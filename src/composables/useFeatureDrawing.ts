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
  const featureType = ref<MapFeatureType>("area");
  const drawingMode = ref<FeatureDrawingMode>("feature");
  const drawingPath = computed(() => drawingMode.value === "path");
  const canFinishDrawing = computed(() => vertices.value.length >= (drawingPath.value ? 2 : 3));
  const pathGeometry = computed(() => drawingPath.value
    ? createPathGeometry(vertices.value.map((point) => [point.lng, point.lat])) : null);

  function featureLabel(feature: MapFeature): string {
    return feature.name || t(`map.featureTypes.${feature.type}`);
  }

  function renderDrawing() {
    options.drawingLayer().clearLayers();
    if (!vertices.value.length) return;
    if (pathGeometry.value) {
      L.polygon(pathGeometry.value.coordinates[0].map(([lng, lat]) => [lat, lng]), {
        color: "#a34612",
        weight: 1,
        fillColor: "#a34612",
        fillOpacity: 0.25,
        interactive: false,
      }).addTo(options.drawingLayer());
    }
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
    if (drawingPath.value && lastPoint?.lat === event.latlng.lat
      && lastPoint.lng === event.latlng.lng) return;
    if (vertices.value.length >= (drawingPath.value ? MAX_PATH_POINTS : 500)) {
      if (drawingPath.value) drawingError.value = t("map.pathPointLimit", { count: MAX_PATH_POINTS });
      return;
    }
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
    drawingMode.value = mode;
    choosingParent.value = mode === "child";
    drawing.value = mode !== "child";
    parentFeature.value = null;
    prospectiveParent.value = null;
    vertices.value = [];
    drawingError.value = "";
    featureName.value = "";
    featureType.value = mode === "path" ? "path" : "area";
    renderDrawing();
  }

  function updateDrawingHints() {
    if (parentFeature.value || !canFinishDrawing.value) {
      prospectiveParent.value = null;
      return;
    }
    const positions = drawingPositions();
    if (!positions) {
      prospectiveParent.value = null;
      drawingError.value = t("map.invalidPath");
      return;
    }
    const { parent, conflict } = detectParentFeature(
      positions, options.features(), featureType.value);
    prospectiveParent.value = parent;
    if (!parent && conflict)
      drawingError.value = t(drawingPath.value ? "map.overlapsExistingWay" : "map.overlapsExistingFeature", { name: featureLabel(conflict) });
  }

  function drawingPositions(): PolygonPosition[] | null {
    return drawingPath.value
      ? pathGeometry.value?.coordinates[0].slice(0, -1) ?? null
      : vertices.value.map((point) => [point.lng, point.lat]);
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

  function finishDrawing() {
    if (!drawing.value || !canFinishDrawing.value) return;
    const ring = drawingPositions();
    if (!ring) {
      drawingError.value = t("map.invalidPath");
      return;
    }
    ring.push([...ring[0]]);
    if (new Set(ring.slice(0, -1).map(([x, y]) => `${x},${y}`)).size < 3 || polygonIntersectsItself(ring)) {
      drawingError.value = t("map.invalidPolygon");
      return;
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
        ring.slice(0, -1), options.features(), featureType.value);
      if (conflict) {
        drawingError.value = t(drawingPath.value ? "map.overlapsExistingWay" : "map.overlapsExistingFeature", {
          name: featureLabel(conflict),
        });
        return;
      }
      parentFeatureId = parent?.id ?? null;
    }
    options.createFeature({
      geometry: { type: "Polygon", coordinates: [ring] },
      name: featureName.value.trim(),
      type: featureType.value,
      parentFeatureId,
    });
    cancelDrawing();
  }

  return {
    drawing,
    drawingPath,
    canFinishDrawing,
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
