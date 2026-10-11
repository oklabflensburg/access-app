<script setup lang="ts">
import { computed, nextTick, onMounted, provide, ref, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import Message from "primevue/message";
import Map from "../components/Map.vue";
import FeaturePanel from "../components/FeaturePanel.vue";
import OsmFeaturePanel from "../components/OsmFeaturePanel.vue";
import RoutingPanel from "../components/RoutingPanel.vue";
import { useRouting } from "../composables/useRouting";
import { useMapStore } from "../stores/map";
import { usePublicMapData } from "../composables/usePublicMapData";
import { useMapFeatures } from "../composables/useMapFeatures";
import { useOsmFeatures } from "../composables/useOsmFeatures";
import { useLocationStore } from "../stores/location";
import { useObservationStore } from "../stores/observation";
import { nodeFeatureGeometry, wayFeatureGeometry } from "../domain/map/osmFeatures";
import { mapFeaturesKey } from "../injectionKeys";
import type { LocationData } from "../types/location";
import type { OsmFeature } from "../types/map-feature";

const { t } = useI18n();
const location = useLocationStore();
const observations = useObservationStore();
const router = useRouter();
const route = useRoute();
const mapStore = useMapStore();
const mapComponent = ref<InstanceType<typeof Map>>();
const routingPanel = ref<InstanceType<typeof RoutingPanel>>();

const { publicObservations, publicFeatures, publicError } = usePublicMapData();
const {
  features,
  selectedFeature,
  selectedParentFeature,
  notice: featureNotice,
  error: featureError,
  saving: featureSaving,
  selectFeature,
  closeFeature,
  createFeature,
  updateFeature,
} = useMapFeatures(publicFeatures);
const { osmFeatures, osmFeaturesError } = useOsmFeatures();

const selectedOsmFeature = ref<OsmFeature | null>(null);
const selectedOsmFeaturePoint = ref<{ latitude: number; longitude: number } | null>(null);

function selectOsmFeature(feature: OsmFeature, point: { latitude: number; longitude: number }) {
  closeFeature();
  selectedOsmFeature.value = feature;
  selectedOsmFeaturePoint.value = point;
}

function closeOsmFeature() {
  selectedOsmFeature.value = null;
  selectedOsmFeaturePoint.value = null;
}

function selectFeatureFromMap(id: string) {
  closeOsmFeature();
  selectFeature(id);
}

async function adoptOsmFeature(forObservation: boolean) {
  const osmFeature = selectedOsmFeature.value;
  const point = selectedOsmFeaturePoint.value;
  if (!osmFeature || !point) return;
  const geometry = osmFeature.way
    ? wayFeatureGeometry(osmFeature.way)
    : osmFeature.node
      ? nodeFeatureGeometry(osmFeature.node)
      : null;
  if (!geometry) {
    featureError.value = t("map.osmFeatureTooComplex");
    return;
  }
  closeOsmFeature();
  await createFeature({
    geometry,
    name: osmFeature.name,
    type: osmFeature.type,
    parentFeatureId: null,
    osmId: osmFeature.osmId,
  });
  if (forObservation) {
    void router.push({
      name: "new-observation",
      query: {
        latitude: point.latitude.toString(),
        longitude: point.longitude.toString(),
      },
    });
  }
}

const routing = useRouting(() => features.value);

watch(routing.result, async (result) => {
  if (!result) return;
  await nextTick();
  if (routing.result.value === result)
    mapComponent.value?.fitRoute(routingPanel.value?.getHeight() ?? 0);
});

provide(mapFeaturesKey, features);

watch(() => mapStore.routeRequest, () => {
  closeFeature();
  closeOsmFeature();
  routing.open();
});
watch(() => route.name, (name) => {
  if (name !== "map") routing.close();
});

const markers = computed(() => {
  const localIds = new Set(observations.observations.map((o) => o.id));
  return [
    ...observations.observations,
    ...publicObservations.value.filter((o) => !localIds.has(o.id)),
  ];
});
const ownedObservationIds = computed(
  () => new Set(observations.observations.map((observation) => observation.id)),
);

function editObservation(id: string) {
  void router.push({ name: "edit-observation", params: { id } });
}
function addObservationAt(loc: LocationData) {
  void router.push({
    name: "new-observation",
    query: {
      latitude: loc.latitude.toString(),
      longitude: loc.longitude.toString(),
    },
  });
}

onMounted(() => void observations.load());
</script>

<template>
  <div class="map-page">
    <Map
      ref="mapComponent"
      :location="location.current"
      :observations="markers"
      :features="features"
      :osm-features="osmFeatures"
      :owned-observation-ids="ownedObservationIds"
      :routing-active="routing.active.value"
      :route-picking="routing.picking.value"
      :route-start="routing.start.value"
      :route-end="routing.end.value"
      :walking-route="routing.result.value"
      @select-observation="editObservation"
      @select-location="addObservationAt"
      @select-feature="selectFeatureFromMap"
      @select-osm-feature="selectOsmFeature"
      @create-feature="createFeature"
      @route-point="routing.selectPoint"
      @cancel-route="routing.close"
    />
    <RoutingPanel
      ref="routingPanel"
      v-if="routing.active.value"
      :picking="routing.picking.value"
      :loading="routing.loading.value"
      :error="routing.error.value"
      :distance="routing.distance.value"
      :has-start="!!routing.start.value"
      :has-end="!!routing.end.value"
      @close="routing.close"
      @clear="routing.clear"
      @change="routing.change"
      @retry="routing.calculate"
      @center="mapComponent?.pickMapCenter()"
    />
    <FeaturePanel
      v-if="selectedFeature"
      :feature="selectedFeature"
      :parent-feature="selectedParentFeature"
      :saving="featureSaving"
      @close="closeFeature"
      @select-parent="selectFeature"
      @update="updateFeature"
    />
    <OsmFeaturePanel
      v-if="selectedOsmFeature"
      :feature="selectedOsmFeature"
      @close="closeOsmFeature"
      @adopt="adoptOsmFeature(false)"
      @observe="adoptOsmFeature(true)"
    />
    <div class="map-status" aria-live="polite">
      <Message v-if="location.error" severity="error" role="alert">{{ location.error }}</Message>
      <Message v-else-if="featureError || publicError || osmFeaturesError || observations.error" severity="error" role="alert">
        {{ featureError || publicError || osmFeaturesError || observations.error }}
      </Message>
      <Message v-else-if="featureNotice" severity="success" role="status">
        {{ featureNotice }}
      </Message>
    </div>
    <RouterView />
  </div>
</template>
