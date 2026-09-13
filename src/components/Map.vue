<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import L from "leaflet";
import type { LocationData } from "../types/location";
import type { Observation } from "../types/observation";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  location: LocationData | null;
  observations: Observation[];
}>();
const { t } = useI18n();
const container = ref<HTMLDivElement>();
const tileError = ref(false);
let map: L.Map | undefined;
let observationLayer: L.LayerGroup;
let locationLayer: L.LayerGroup;
let resizeObserver: ResizeObserver | undefined;

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
          className: "observation-marker",
          html: `<span>${index + 1}</span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 36],
        }),
        title: t("map.entry", { number: index + 1, label }),
        alt: t("map.entry", { number: index + 1, label }),
      },
    )
      .bindPopup(popup)
      .addTo(observationLayer);
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
  drawLocation();
  drawObservations();
  resizeObserver = new ResizeObserver(() => map?.invalidateSize());
  resizeObserver.observe(container.value!);
});
watch(() => props.location, drawLocation);
watch(() => props.observations, drawObservations, { deep: true });
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
      :aria-label="t('map.mapHelp')"
    />
    <p v-if="tileError" class="map-warning" role="status">
      {{ t("map.mapError") }}
    </p>
  </section>
</template>
