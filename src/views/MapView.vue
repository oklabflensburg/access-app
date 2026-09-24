<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed } from "vue";
import { liveQuery } from "dexie";
import { RouterView, useRouter } from "vue-router";
import { getPublicMapFeatures, getPublicObservations } from "../services/api";
import {
  database,
  getLocalMapFeatures,
  saveMapFeature,
  updateMapFeatureProperties,
} from "../services/storage";
import type { Observation } from "../types/observation";
import type { LocationData } from "../types/location";
import {
  mapFeatureTypes,
  type MapFeature,
  type MapFeatureType,
  type PolygonGeometry,
} from "../types/map-feature";
import Map from "../components/Map.vue";
import { useLocationStore } from "../stores/location";
import { useObservationStore } from "../stores/observation";
import { useI18n } from "vue-i18n";
import Message from "primevue/message";
const location = useLocationStore();
const observations = useObservationStore();
const { t } = useI18n();
const router = useRouter();
const publicObservations = ref<Observation[]>([]);
const publicFeatures = ref<MapFeature[]>([]);
const localFeatures = ref<MapFeature[]>([]);
const featureNotice = ref("");
const publicError = ref("");
const publicBusy = ref(false);
const selectedFeatureId = ref("");
const featureName = ref("");
const featureType = ref<MapFeatureType>("area");
const featureSaving = ref(false);
let featureSubscription: { unsubscribe(): void } | undefined;
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

const features = computed(() => {
  const localIds = new Set(localFeatures.value.map((feature) => feature.id));
  return [
    ...localFeatures.value,
    ...publicFeatures.value.filter((feature) => !localIds.has(feature.id)),
  ];
});
const selectedFeature = computed(() =>
  features.value.find(({ id }) => id === selectedFeatureId.value),
);
const selectedParentFeature = computed(() =>
  features.value.find(({ id }) => id === selectedFeature.value?.parentFeatureId),
);
const canEditSelectedFeature = computed(() => Boolean(selectedFeature.value?.editToken));
function editObservation(id: string) {
  void router.push({ name: "edit-observation", params: { id } });
}
function addObservationAt(location: LocationData) {
  void router.push({
    name: "new-observation",
    query: {
      latitude: location.latitude.toString(),
      longitude: location.longitude.toString(),
    },
  });
}
async function loadPublic() {
  publicBusy.value = true;
  publicError.value = "";
  try {
    const [result, featureResult] = await Promise.all([
      getPublicObservations(),
      getPublicMapFeatures(),
    ]);
    const [observationKeys, featureKeys] = await Promise.all([
      database.observations.toCollection().primaryKeys(),
      database.mapFeatures.toCollection().primaryKeys(),
    ]);
    const localIds = new Set(observationKeys);
    const localFeatureIds = new Set(featureKeys);
    publicObservations.value = result.observations.filter(
      (o) => !localIds.has(o.id),
    );
    publicFeatures.value = featureResult.features.filter(
      (feature) => !localFeatureIds.has(feature.id),
    );
    if (result.nextCursor)
      publicError.value = t("map.publicLimit");
  } catch {
    publicError.value = t("map.publicError");
  } finally {
    publicBusy.value = false;
  }
}
async function createFeature({
  geometry,
  name,
  type,
  parentFeatureId,
}: {
  geometry: PolygonGeometry;
  name: string;
  type: MapFeatureType;
  parentFeatureId: string | null;
}) {
  featureNotice.value = "";
  try {
    const feature = await saveMapFeature(geometry, name, type, parentFeatureId);
    localFeatures.value = await getLocalMapFeatures();
    selectFeature(feature.id);
    featureNotice.value = t("map.featureSavedOffline");
  } catch (cause) {
    publicError.value =
      cause instanceof Error ? cause.message : t("map.featureSaveError");
  }
}
function selectFeature(id: string) {
  const feature = features.value.find((candidate) => candidate.id === id);
  if (!feature) return;
  selectedFeatureId.value = id;
  featureName.value = feature.name;
  featureType.value = feature.type;
}
function closeFeature() {
  selectedFeatureId.value = "";
}
async function updateFeature() {
  if (!selectedFeature.value || !canEditSelectedFeature.value) return;
  featureSaving.value = true;
  featureNotice.value = "";
  publicError.value = "";
  try {
    await updateMapFeatureProperties(
      selectedFeature.value.id,
      featureName.value,
      featureType.value,
    );
    featureNotice.value = t("map.featureUpdatedOffline");
  } catch (cause) {
    publicError.value = cause instanceof Error
      ? cause.message
      : t("map.featureUpdateError");
  } finally {
    featureSaving.value = false;
  }
}
onMounted(() => {
  void observations.load();
  featureSubscription = liveQuery(getLocalMapFeatures).subscribe({
    next: (result) => {
      localFeatures.value = result;
    },
    error: () => {
      publicError.value = t("map.featureSaveError");
    },
  });
  void loadPublic();
});
onBeforeUnmount(() => featureSubscription?.unsubscribe());
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
    <form
      v-if="selectedFeature"
      class="feature-panel"
      :aria-label="t('map.featureDetails')"
      @submit.prevent="updateFeature"
    >
      <div class="feature-panel-heading">
        <strong>{{ t("map.featureDetails") }}</strong>
        <button type="button" class="feature-panel-close" :aria-label="t('map.closeFeatureDetails')" @click="closeFeature">
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </div>
      <button
        v-if="selectedParentFeature"
        type="button"
        class="secondary"
        @click="selectFeature(selectedParentFeature!.id)"
      >
        {{ t("map.showParentFeature") }}
      </button>
      <label for="selected-feature-name">{{ t("map.featureName") }}</label>
      <input
        id="selected-feature-name"
        v-model="featureName"
        type="text"
        maxlength="120"
        :readonly="!canEditSelectedFeature"
      />
      <label for="selected-feature-type">{{ t("map.featureType") }}</label>
      <select id="selected-feature-type" v-model="featureType" :disabled="!canEditSelectedFeature">
        <option v-for="type in mapFeatureTypes" :key="type" :value="type">
          {{ t(`map.featureTypes.${type}`) }}
        </option>
      </select>
      <p v-if="!canEditSelectedFeature" class="feature-readonly">{{ t("map.featureReadOnly") }}</p>
      <button v-else type="submit" class="primary" :disabled="featureSaving">
        {{ featureSaving ? t("map.featureUpdating") : t("map.updateFeature") }}
      </button>
    </form>
    <div class="map-status" aria-live="polite">
      <Message v-if="location.error" severity="error" role="alert">{{ location.error }}</Message>
      <Message v-else-if="publicError || observations.error" severity="error" role="alert">
        {{ publicError || observations.error }}
      </Message>
      <Message v-else-if="featureNotice" severity="success" role="status">
        {{ featureNotice }}
      </Message>
    </div>
    <RouterView />
  </div>
</template>
