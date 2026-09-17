<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import L from "leaflet";
import type { LocationData } from "../types/location";
import type { Observation } from "../types/observation";
import type { MapFeature, PolygonGeometry } from "../types/map-feature";
import { useI18n } from "vue-i18n";
import { useMapStore } from "../stores/map";

const props = defineProps<{
  location: LocationData | null;
  observations: Observation[];
  ownedObservationIds: ReadonlySet<string>;
  features: MapFeature[];
}>();
const emit = defineEmits<{
  selectObservation: [id: string];
  selectLocation: [location: LocationData];
  createFeature: [geometry: PolygonGeometry];
}>();
const { t } = useI18n();
const mapStore = useMapStore();
const container = ref<HTMLDivElement>();
const tileError = ref(false);
const drawing = ref(false);
const vertices = ref<L.LatLng[]>([]);
const drawingError = ref("");
const longPressDelay = 700;
let map: L.Map | undefined;
let observationLayer: L.LayerGroup;
let locationLayer: L.LayerGroup;
let featureLayer: L.LayerGroup;
let drawingLayer: L.LayerGroup;
let resizeObserver: ResizeObserver | undefined;
let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let longPressPoint: L.LatLng | undefined;
type MapPointEvent = L.LeafletEvent & { latlng: L.LatLng };

function hasMapPoint(event: L.LeafletEvent): event is MapPointEvent {
  return "latlng" in event;
}

function cancelLongPress() {
  if (longPressTimer !== undefined) clearTimeout(longPressTimer);
  longPressTimer = undefined;
  longPressPoint = undefined;
}

function startLongPress(event: L.LeafletEvent) {
  if (drawing.value) return;
  if (!hasMapPoint(event)) return;
  cancelLongPress();
  longPressPoint = event.latlng;
  longPressTimer = setTimeout(() => {
    if (!longPressPoint) return;
    emit("selectLocation", {
      latitude: longPressPoint.lat,
      longitude: longPressPoint.lng,
      accuracy: null,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      timestamp: Date.now(),
    });
    cancelLongPress();
  }, longPressDelay);
}

function renderDrawing() {
  drawingLayer.clearLayers();
  if (!vertices.value.length) return;
  L.polyline(vertices.value, {
    color: "#a34612",
    weight: 4,
    dashArray: "7 6",
  }).addTo(drawingLayer);
  vertices.value.forEach((point, index) =>
    L.circleMarker(point, {
      radius: index === 0 ? 8 : 6,
      color: "#fff",
      weight: 2,
      fillColor: "#a34612",
      fillOpacity: 1,
    }).addTo(drawingLayer),
  );
}

function addVertex(event: L.LeafletEvent) {
  if (!drawing.value || !hasMapPoint(event) || vertices.value.length >= 500)
    return;
  vertices.value = [...vertices.value, event.latlng];
  drawingError.value = "";
  renderDrawing();
}

function startDrawing() {
  cancelLongPress();
  drawing.value = true;
  vertices.value = [];
  drawingError.value = "";
  renderDrawing();
}

function undoVertex() {
  vertices.value = vertices.value.slice(0, -1);
  drawingError.value = "";
  renderDrawing();
}

function cancelDrawing() {
  drawing.value = false;
  vertices.value = [];
  drawingError.value = "";
  drawingLayer.clearLayers();
}

function finishDrawing() {
  if (vertices.value.length < 3) return;
  const ring = vertices.value.map(
    (point) => [point.lng, point.lat] as [number, number],
  );
  ring.push([...ring[0]]);
  if (new Set(ring.slice(0, -1).map(([x, y]) => `${x},${y}`)).size < 3 || polygonIntersectsItself(ring)) {
    drawingError.value = t("map.invalidPolygon");
    return;
  }
  emit("createFeature", { type: "Polygon", coordinates: [ring] });
  cancelDrawing();
}

function polygonIntersectsItself(ring: [number, number][]): boolean {
  const crosses = (
    a: [number, number],
    b: [number, number],
    c: [number, number],
    d: [number, number],
  ) => {
    const direction = (p: [number, number], q: [number, number], r: [number, number]) =>
      (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const abC = direction(a, b, c);
    const abD = direction(a, b, d);
    const cdA = direction(c, d, a);
    const cdB = direction(c, d, b);
    return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
      && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
  };
  const edgeCount = ring.length - 1;
  for (let first = 0; first < edgeCount; first++) {
    for (let second = first + 1; second < edgeCount; second++) {
      if (second === first + 1 || (first === 0 && second === edgeCount - 1))
        continue;
      if (crosses(ring[first], ring[first + 1], ring[second], ring[second + 1]))
        return true;
    }
  }
  return false;
}

function drawLocation() {
  if (!map) return;
  locationLayer.clearLayers();
  if (!props.location) return;
  const { latitude, longitude, accuracy } = props.location;
  const point: L.LatLngExpression = [latitude, longitude];
  if (accuracy !== null)
    L.circle(point, {
      radius: accuracy,
      color: "#2265aa",
      weight: 1,
      fillOpacity: 0.08,
    }).addTo(locationLayer);
  const marker = L.marker(point, {
    icon: L.divIcon({
      className: "position-marker",
      html: '<span aria-hidden="true">●</span>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    title: t("map.yourLocation"),
    alt: t("map.yourLocation"),
  })
    .bindPopup(t("map.yourLocation"))
    .addTo(locationLayer);
  marker.getElement()?.setAttribute("aria-label", t("map.yourLocation"));
  map.setView(point, 17);
}

function drawObservations() {
  if (!map) return;
  observationLayer.clearLayers();
  props.observations.forEach((observation, index) => {
    const isOwned = props.ownedObservationIds.has(observation.id);
    const accessible = observation.accessibility.wheelchairAccessible;
    const label =
      accessible === null
        ? t("map.unknown")
        : accessible
          ? t("map.accessible")
          : t("map.notAccessible");
    const popup = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = label;
    popup.append(title);
    const detail = document.createElement("p");
    detail.textContent = observation.comment || t("map.noComment");
    popup.append(detail);
    const marker = L.marker(
      [observation.location.latitude, observation.location.longitude],
      {
        icon: L.divIcon({
          className: `observation-marker observation-marker--${isOwned ? "owned" : "other"}`,
          html: `<span>${index + 1}</span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 36],
        }),
        title: t("map.entry", { number: index + 1, label }),
        alt: t("map.entry", { number: index + 1, label }),
      },
    ).addTo(observationLayer);
    if (isOwned) marker.on("click", () => emit("selectObservation", observation.id));
    else marker.bindPopup(popup);
    marker
      .getElement()
      ?.setAttribute("aria-label", t("map.entry", { number: index + 1, label }));
  });
  if (!props.location && props.observations.length) {
    map.fitBounds(
      L.latLngBounds(
        props.observations.map((o) => [
          o.location.latitude,
          o.location.longitude,
        ]),
      ),
      { maxZoom: 17, padding: [35, 35] },
    );
  }
}

function drawFeatures() {
  featureLayer.clearLayers();
  props.features.forEach((feature) => {
    const ring = feature.geometry.coordinates[0].map(
      ([longitude, latitude]) => [latitude, longitude] as L.LatLngTuple,
    );
    const polygon = L.polygon(ring, {
      color: feature.syncStatus && feature.syncStatus !== "synced" ? "#a34612" : "#18594b",
      weight: 3,
      fillColor: "#56a784",
      fillOpacity: 0.22,
    }).addTo(featureLayer);
    polygon.bindTooltip(
      feature.syncStatus === "failed"
        ? t("map.featureFailed")
        : feature.syncStatus && feature.syncStatus !== "synced"
          ? t("map.featurePending")
          : t("map.area"),
    );
  });
  if (!props.location && !props.observations.length && props.features.length) {
    map?.fitBounds(
      L.latLngBounds(
        props.features.flatMap((feature) =>
          feature.geometry.coordinates[0].map(
            ([longitude, latitude]) => [latitude, longitude] as L.LatLngTuple,
          ),
        ),
      ),
      { maxZoom: 17, padding: [35, 35] },
    );
  }
}

onMounted(() => {
  map = L.map(container.value!, {
    scrollWheelZoom: true,
    touchZoom: true,
    doubleClickZoom: true,
  }).setView([20, 0], 2);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  })
    .on("tileerror", () => {
      tileError.value = true;
    })
    .addTo(map);
  locationLayer = L.layerGroup().addTo(map);
  featureLayer = L.layerGroup().addTo(map);
  observationLayer = L.layerGroup().addTo(map);
  drawingLayer = L.layerGroup().addTo(map);
  map.on("mousedown", startLongPress);
  map.on("touchstart", startLongPress);
  map.on("mouseup touchend touchcancel dragstart move", cancelLongPress);
  map.on("click", addVertex);
  drawLocation();
  drawObservations();
  drawFeatures();
  resizeObserver = new ResizeObserver(() => map?.invalidateSize());
  resizeObserver.observe(container.value!);
});
watch(() => props.location, drawLocation);
watch(() => props.observations, drawObservations, { deep: true });
watch(() => props.features, drawFeatures, { deep: true });
watch(() => mapStore.drawRequest, startDrawing);
onBeforeUnmount(() => {
  cancelLongPress();
  resizeObserver?.disconnect();
  map?.remove();
});
</script>

<template>
  <section class="map-frame" :aria-label="t('map.mapLabel')">
    <div
      ref="container"
      class="map"
      :aria-label="t('map.mapHelp')"
    />
    <div v-if="drawing" class="drawing-controls" role="group" :aria-label="t('map.drawControls')">
      <p class="drawing-instruction" role="status">
        {{ t("map.drawHelp", { count: vertices.length }) }}
      </p>
      <p v-if="drawingError" class="drawing-error" role="alert">{{ drawingError }}</p>
      <button type="button" class="secondary" :disabled="!vertices.length" @click="undoVertex">
        {{ t("map.undoPoint") }}
      </button>
      <button type="button" class="secondary" @click="cancelDrawing">
        {{ t("map.cancelDrawing") }}
      </button>
      <button type="button" class="primary" :disabled="vertices.length < 3" @click="finishDrawing">
        {{ t("map.closeAndSave") }}
      </button>
    </div>
    <p v-if="tileError" class="map-warning" role="status">
      {{ t("map.mapError") }}
    </p>
  </section>
</template>
