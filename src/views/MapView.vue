<script setup lang="ts">
import { computed, onMounted, provide } from "vue";
import { RouterView, useRouter } from "vue-router";
import Message from "primevue/message";
import Map from "../components/Map.vue";
import FeaturePanel from "../components/FeaturePanel.vue";
import { usePublicMapData } from "../composables/usePublicMapData";
import { useMapFeatures } from "../composables/useMapFeatures";
import { useLocationStore } from "../stores/location";
import { useObservationStore } from "../stores/observation";
import { mapFeaturesKey } from "../injectionKeys";
import type { LocationData } from "../types/location";

const location = useLocationStore();
const observations = useObservationStore();
const router = useRouter();

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

provide(mapFeaturesKey, features);

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
      :location="location.current"
      :observations="markers"
      :features="features"
      :owned-observation-ids="ownedObservationIds"
      @select-observation="editObservation"
      @select-location="addObservationAt"
      @select-feature="selectFeature"
      @create-feature="createFeature"
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
    <div class="map-status" aria-live="polite">
      <Message v-if="location.error" severity="error" role="alert">{{ location.error }}</Message>
      <Message v-else-if="featureError || publicError || observations.error" severity="error" role="alert">
        {{ featureError || publicError || observations.error }}
      </Message>
      <Message v-else-if="featureNotice" severity="success" role="status">
        {{ featureNotice }}
      </Message>
    </div>
    <RouterView />
  </div>
</template>
