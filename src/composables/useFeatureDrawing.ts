import { computed, ref } from "vue";
import L from "leaflet";
import { useI18n } from "vue-i18n";
import type {
  MapFeature,
  MapFeatureType,
  PolygonGeometry,
  PolygonPosition,
  FeatureDrawingMode,
} from "../types/map-feature";
import { createPathGeometry, MAX_PATH_POINTS } from "../domain/map/pathGeometry";
import { hasMapPoint } from "../domain/map/events";
import {
  containsPoint,
  detectParentFeature,
  polygonIntersectsItself,
} from "../domain/map/geometry";

interface FeatureDrawingOptions {
  features: () => MapFeature[];
  map: () => L.Map | undefined;
  drawingLayer: () => L.LayerGroup;
  createFeature: (feature: {
    geometry: PolygonGeometry;
    name: string;
    type: MapFeatureType;
    parentFeatureId: string | null;
  }) => void;
}

export function useFeatureDrawing(options: FeatureDrawingOptions) {
  const { t } = useI18n();
  const drawing = ref(false);
  const choosingParent = ref(false);
  const parentFeature = ref<MapFeature | null>(null);
  const prospectiveParent = ref<MapFeature | null>(null);
  const vertices = ref<L.LatLng[]>([]);
  const drawingError = ref("");
  const featureName = ref("");
  const canSavePath = computed(() => vertices.value.length >= 2);
  const canSaveArea = computed(() => vertices.value.length >= 3);

  function featureLabel(feature: MapFeature): string {
    return feature.name || t(`map.featureTypes.${feature.type}`);
  }

  function renderDrawing() {
    options.drawingLayer().clearLayers();
    if (!vertices.value.length) return;
    L.polyline(vertices.value, {
      color: "#a34612",
      weight: 4,
      dashArray: "7 6",
      interactive: false,
    }).addTo(options.drawingLayer());
    vertices.value.forEach((point, index) =>
      L.circleMarker(point, {
        radius: index === 0 ? 8 : 6,
        color: "#fff",
        weight: 2,
        fillColor: "#a34612",
        fillOpacity: 1,
        interactive: false,
      }).addTo(options.drawingLayer()),
    );
  }

  function addVertex(event: L.LeafletEvent) {
    if (!drawing.value || !hasMapPoint(event)) return;
    const lastPoint = vertices.value.at(-1);
    if (lastPoint?.lat === event.latlng.lat
      && lastPoint.lng === event.latlng.lng) return;
    if (vertices.value.length >= 500) return;
    if (parentFeature.value
      && !containsPoint(parentFeature.value, event.latlng, options.map())) {
      drawingError.value = t("map.pointOutsideParent");
      return;
    }
    vertices.value = [...vertices.value, event.latlng];
    drawingError.value = "";
    renderDrawing();
    updateDrawingHints();
  }

  function startDrawing(mode: FeatureDrawingMode = "feature") {
    choosingParent.value = mode === "child";
    drawing.value = mode !== "child";
    parentFeature.value = null;
    prospectiveParent.value = null;
    vertices.value = [];
    drawingError.value = "";
    featureName.value = "";
    renderDrawing();
  }

  function updateDrawingHints() {
    if (parentFeature.value || !canSavePath.value) {
      prospectiveParent.value = null;
      return;
    }
    // The object type is chosen when saving, so both interpretations of the
    // drawn points decide the hint: a way buffered around the line and the
    // polygon ring closed directly.
    const interpretations: { parent: MapFeature | null; conflict: MapFeature | null }[] = [];
    const pathGeometry = createPathGeometry(vertices.value.map((point) => [point.lng, point.lat]));
    if (pathGeometry)
      interpretations.push(detectParentFeature(
        pathGeometry.coordinates[0].slice(0, -1), options.features(), "path"));
    if (canSaveArea.value)
      interpretations.push(detectParentFeature(
        vertices.value.map((point) => [point.lng, point.lat]), options.features(), "area"));
    const conflict = interpretations.find(({ conflict }) => conflict)?.conflict;
    if (conflict) {
      prospectiveParent.value = null;
      drawingError.value = t("map.overlapsExistingObject", { name: featureLabel(conflict) });
      return;
    }
    const parents = interpretations
      .map(({ parent }) => parent)
      .filter((parent): parent is MapFeature => !!parent);
    prospectiveParent.value =
      parents.length && parents.every((parent) => parent === parents[0]) ? parents[0] : null;
  }

  function chooseParent(feature: MapFeature, event: L.LeafletMouseEvent) {
    if (!choosingParent.value) {
      return;
    }
    L.DomEvent.stopPropagation(event.originalEvent);
    parentFeature.value = feature;
    choosingParent.value = false;
    drawing.value = true;
    drawingError.value = "";
  }

  function undoVertex() {
    vertices.value = vertices.value.slice(0, -1);
    drawingError.value = "";
    renderDrawing();
    updateDrawingHints();
  }

  function cancelDrawing() {
    drawing.value = false;
    choosingParent.value = false;
    parentFeature.value = null;
    prospectiveParent.value = null;
    vertices.value = [];
    drawingError.value = "";
    options.drawingLayer().clearLayers();
  }

  function finishDrawing(type: "path" | "area") {
    if (!drawing.value) return;
    if (type === "path" && !canSavePath.value) return;
    if (type === "area" && !canSaveArea.value) return;
    let ring: PolygonPosition[];
    if (type === "path") {
      if (vertices.value.length > MAX_PATH_POINTS) {
        drawingError.value = t("map.pathPointLimit", { count: MAX_PATH_POINTS });
        return;
      }
      const geometry = createPathGeometry(vertices.value.map((point) => [point.lng, point.lat]));
      if (!geometry) {
        drawingError.value = t("map.invalidPath");
        return;
      }
      ring = geometry.coordinates[0];
    } else {
      ring = vertices.value.map((point) => [point.lng, point.lat]);
      ring.push([...ring[0]]);
      if (new Set(ring.slice(0, -1).map(([x, y]) => `${x},${y}`)).size < 3 || polygonIntersectsItself(ring)) {
        drawingError.value = t("map.invalidPolygon");
        return;
      }
    }
    if (parentFeature.value && ring.slice(0, -1).some(([longitude, latitude]) =>
      !containsPoint(parentFeature.value!, L.latLng(latitude, longitude), options.map()))) {
      drawingError.value = t("map.pointOutsideParent");
      return;
    }
    let parentFeatureId = parentFeature.value?.id ?? null;
    if (!parentFeature.value) {
      // A drawing that overlaps an existing feature becomes its subobject.
      const { parent, conflict } = detectParentFeature(
        ring.slice(0, -1), options.features(), type);
      if (conflict) {
        drawingError.value = t("map.overlapsExistingObject", {
          name: featureLabel(conflict),
        });
        return;
      }
      parentFeatureId = parent?.id ?? null;
    }
    options.createFeature({
      geometry: { type: "Polygon", coordinates: [ring] },
      name: featureName.value.trim(),
      type,
      parentFeatureId,
    });
    cancelDrawing();
  }

  return {
    drawing,
    canSavePath,
    canSaveArea,
    choosingParent,
    parentFeature,
    prospectiveParent,
    vertices,
    drawingError,
    featureLabel,
    addVertex,
    startDrawing,
    chooseParent,
    undoVertex,
    cancelDrawing,
    finishDrawing,
  };
}
