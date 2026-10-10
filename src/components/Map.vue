<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import L from "leaflet";
import type { LocationData } from "../types/location";
import type { Observation } from "../types/observation";
import type {
  MapFeature,
  MapFeatureType,
  PolygonGeometry,
} from "../types/map-feature";
import { useI18n } from "vue-i18n";
import { useMapStore } from "../stores/map";
import { useFeatureDrawing } from "../composables/useFeatureDrawing";
import { hasMapPoint } from "../domain/map/events";
import { containsPoint, featureDepth } from "../domain/map/geometry";

const props = defineProps<{
  location: LocationData | null;
  observations: Observation[];
  ownedObservationIds: ReadonlySet<string>;
  features: MapFeature[];
}>();
const emit = defineEmits<{
  selectObservation: [id: string];
  selectLocation: [location: LocationData];
  selectFeature: [id: string];
  createFeature: [feature: { geometry: PolygonGeometry; name: string; type: MapFeatureType; parentFeatureId: string | null }];
}>();
const { t } = useI18n();
const mapStore = useMapStore();
const container = ref<HTMLDivElement>();
const tileError = ref(false);
let lastFeatureClickPoint: L.Point | undefined;
let lastFeatureClickIds: string[] = [];
let featureClickIndex = -1;
let map: L.Map | undefined;
let initialBoundsFitted = false;
let observationLayer: L.LayerGroup;
let locationLayer: L.LayerGroup;
let featureLayer: L.LayerGroup;
let drawingLayer: L.LayerGroup;
let resizeObserver: ResizeObserver | undefined;
const pickingPoint = ref(false);

const {
  drawing,
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
} = useFeatureDrawing({
  features: () => props.features,
  map: () => map,
  drawingLayer: () => drawingLayer,
  createFeature: (feature) => emit("createFeature", feature),
});

let pointPickedThisClick = false;

function pickObservationPoint(event: L.LeafletEvent) {
  if (!pickingPoint.value || !hasMapPoint(event)) return;
  pickingPoint.value = false;
  pointPickedThisClick = true;
  emit("selectLocation", {
    latitude: event.latlng.lat,
    longitude: event.latlng.lng,
    accuracy: null,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    timestamp: Date.now(),
  });
}

function selectFeatureAtPoint(point: L.LatLng) {
  const candidates = props.features
    .filter((feature) => containsPoint(feature, point, map))
    .sort((first, second) =>
      featureDepth(second, props.features) - featureDepth(first, props.features));
  if (!candidates.length) {
    lastFeatureClickPoint = undefined;
    lastFeatureClickIds = [];
    featureClickIndex = -1;
    return;
  }
  const ids = candidates.map(({ id }) => id);
  const pointInContainer = map?.latLngToContainerPoint(point);
  const samePlace = pointInContainer && lastFeatureClickPoint
    && pointInContainer.distanceTo(lastFeatureClickPoint) <= 12
    && ids.length === lastFeatureClickIds.length
    && ids.every((id, index) => id === lastFeatureClickIds[index]);
  featureClickIndex = samePlace ? (featureClickIndex + 1) % ids.length : 0;
  lastFeatureClickPoint = pointInContainer;
  lastFeatureClickIds = ids;
  emit("selectFeature", ids[featureClickIndex]);
}

function selectFeatureOnMapClick(event: L.LeafletEvent) {
  if (pointPickedThisClick) {
    pointPickedThisClick = false;
    return;
  }
  if (drawing.value || choosingParent.value || pickingPoint.value || !hasMapPoint(event))
    return;
  selectFeatureAtPoint(event.latlng);
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

function fitInitialBounds() {
  if (initialBoundsFitted || !map || props.location) return;
  const observationPoints = props.observations.map(
    (observation): L.LatLngTuple => [
      observation.location.latitude,
      observation.location.longitude,
    ],
  );
  const points = observationPoints.length
    ? observationPoints
    : props.features.flatMap((feature) =>
        feature.geometry.coordinates[0].map(
          ([longitude, latitude]) => [latitude, longitude] as L.LatLngTuple,
        ),
      );
  if (!points.length) return;
  initialBoundsFitted = true;
  map.fitBounds(L.latLngBounds(points), { maxZoom: 17, padding: [35, 35] });
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
  fitInitialBounds();
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
    const label = feature.name || t(`map.featureTypes.${feature.type}`);
    const syncLabel = feature.syncStatus === "failed"
      ? t("map.featureFailed")
      : feature.syncStatus && feature.syncStatus !== "synced"
        ? t("map.featurePending")
        : "";
    polygon.bindTooltip(syncLabel ? `${label} · ${syncLabel}` : label);
    polygon.on("click", (event) => {
      if (choosingParent.value) chooseParent(feature, event);
    });
  });
  fitInitialBounds();
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
  map.on("click", pickObservationPoint);
  map.on("click", addVertex);
  map.on("click", selectFeatureOnMapClick);
  drawLocation();
  drawObservations();
  drawFeatures();
  resizeObserver = new ResizeObserver(() => map?.invalidateSize());
  resizeObserver.observe(container.value!);
});
watch(() => props.location, drawLocation);
watch(() => props.observations, drawObservations, { deep: true });
watch(() => props.features, drawFeatures, { deep: true });
watch(() => mapStore.drawRequest, () => {
  pickingPoint.value = false;
  startDrawing(mapStore.drawMode);
});
watch(() => mapStore.pickPointRequest, () => {
  cancelDrawing();
  pickingPoint.value = true;
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  map?.remove();
});
</script>

<template>
  <section class="map-frame" :aria-label="t('map.mapLabel')">
    <div
      ref="container"
      class="map"
      :class="{ 'map--picking': pickingPoint }"
      :aria-label="t('map.mapHelp')"
    />
    <div v-if="pickingPoint" class="drawing-controls" role="group" :aria-label="t('map.pickPointControls')">
      <p class="drawing-instruction">{{ t("map.pickObservationPoint") }}</p>
      <button type="button" class="secondary" @click="pickingPoint = false">
        {{ t("map.cancelPicking") }}
      </button>
    </div>
    <div v-if="drawing || choosingParent" class="drawing-controls" role="group" :aria-label="t('map.drawControls')">

      <p v-if="choosingParent" class="drawing-instruction">{{ t("map.chooseParent") }}</p>
      <p v-else-if="parentFeature" class="drawing-instruction">{{ t("map.drawWithinParent") }}</p>
      <p v-else-if="prospectiveParent" class="drawing-instruction">{{ t("map.drawsAsChild", { name: featureLabel(prospectiveParent) }) }}</p>

      <p v-if="drawingError" class="drawing-error" role="alert">{{ drawingError }}</p>

      <button v-if="drawing" type="button" class="secondary" :disabled="!vertices.length" @click="undoVertex">
        {{ t("map.undoPoint") }}
      </button>
      <button type="button" class="secondary" @click="cancelDrawing">
        {{ t("map.cancelDrawing") }}
      </button>
      <button v-if="drawing" type="button" class="primary" :disabled="vertices.length < 3" @click="finishDrawing">
        {{ t("map.closeAndSave") }}
      </button>
    </div>
    <p v-if="tileError" class="map-warning" role="status">
      {{ t("map.mapError") }}
    </p>
  </section>
</template>
