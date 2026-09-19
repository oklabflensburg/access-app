<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed } from "vue";
import { liveQuery } from "dexie";
import { useRouter } from "vue-router";
import { getPublicMapFeatures, getPublicObservations } from "../services/api";
import {
  database,
  getLocalMapFeatures,
  saveMapFeature,
} from "../services/storage";
import type { Observation } from "../types/observation";
import type { LocationData } from "../types/location";
import type { MapFeature, PolygonGeometry } from "../types/map-feature";
import Map from "../components/Map.vue";
import { useLocationStore } from "../stores/location";
import { useObservationStore } from "../stores/observation";
import { useI18n } from "vue-i18n";
import Message from "primevue/message";
import { useSyncStore } from "../stores/sync";
const location = useLocationStore();
const observations = useObservationStore();
const { t } = useI18n();
const router = useRouter();
const sync = useSyncStore();
const publicObservations = ref<Observation[]>([]);
const publicFeatures = ref<MapFeature[]>([]);
const localFeatures = ref<MapFeature[]>([]);
const featureNotice = ref("");
const publicError = ref("");
const publicBusy = ref(false);
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
    const localIds = new Set(
      await database.observations.toCollection().primaryKeys(),
    );
    publicObservations.value = result.observations.filter(
      (o) => !localIds.has(o.id),
    );
    publicFeatures.value = featureResult.features;
    if (result.nextCursor)
      publicError.value = t("map.publicLimit");
  } catch {
    publicError.value = t("map.publicError");
  } finally {
    publicBusy.value = false;
  }
}
async function createFeature(geometry: PolygonGeometry) {
  featureNotice.value = "";
  try {
    const feature = await saveMapFeature(geometry);
    localFeatures.value = await getLocalMapFeatures();
    if (navigator.onLine) {
      await sync.sync(true);
      localFeatures.value = await getLocalMapFeatures();
    }
    const stored = localFeatures.value.find(({ id }) => id === feature.id);
    if (stored?.syncStatus === "failed") {
      publicError.value = stored.lastError || t("map.featureSaveError");
      return;
    }
    featureNotice.value =
      stored?.syncStatus === "synced"
        ? t("map.featureSaved")
        : t("map.featureSavedOffline");
  } catch (cause) {
    publicError.value =
      cause instanceof Error ? cause.message : t("map.featureSaveError");
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
      @create-feature="createFeature"
    />
    <div class="map-status" aria-live="polite">
      <Message v-if="location.error" severity="error" role="alert">{{ location.error }}</Message>
      <Message v-else-if="publicError || observations.error" severity="error" role="alert">
        {{ publicError || observations.error }}
      </Message>
      <Message v-else-if="featureNotice" severity="success" role="status">
        {{ featureNotice }}
      </Message>
    </div>
  </div>
</template>
