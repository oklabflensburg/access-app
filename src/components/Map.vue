<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import L from "leaflet";
import type { LocationData } from "../types/location";
import type { Observation } from "../types/observation";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  location: LocationData | null;
  observations: Observation[];
  ownedObservationIds: ReadonlySet<string>;
}>();
const emit = defineEmits<{
  selectObservation: [id: string];
  selectLocation: [location: LocationData];
}>();
const { t } = useI18n();
const container = ref<HTMLDivElement>();
const tileError = ref(false);
const longPressDelay = 700;
let map: L.Map | undefined;
let observationLayer: L.LayerGroup;
let locationLayer: L.LayerGroup;
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

onMounted(() => {
  map = L.map(container.value!, { scrollWheelZoom: false }).setView([20, 0], 2);
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
  observationLayer = L.layerGroup().addTo(map);
  map.on("mousedown", startLongPress);
  map.on("touchstart", startLongPress);
  map.on("mouseup touchend touchcancel dragstart move", cancelLongPress);
  drawLocation();
  drawObservations();
  resizeObserver = new ResizeObserver(() => map?.invalidateSize());
  resizeObserver.observe(container.value!);
});
watch(() => props.location, drawLocation);
watch(() => props.observations, drawObservations, { deep: true });
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
    <p v-if="tileError" class="map-warning" role="status">
      {{ t("map.mapError") }}
    </p>
  </section>
</template>
