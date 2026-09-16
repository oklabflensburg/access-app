<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { getPublicObservations } from "../services/api";
import { database } from "../services/storage";
import type { Observation } from "../types/observation";
import type { LocationData } from "../types/location";
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
const publicError = ref("");
const publicBusy = ref(false);
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
    const result = await getPublicObservations();
    const localIds = new Set(
      await database.observations.toCollection().primaryKeys(),
    );
    publicObservations.value = result.observations.filter(
      (o) => !localIds.has(o.id),
    );
    if (result.nextCursor)
      publicError.value = t("map.publicLimit");
  } catch {
    publicError.value = t("map.publicError");
  } finally {
    publicBusy.value = false;
  }
}
onMounted(() => {
  void observations.load();
  void loadPublic();
});
</script>

<template>
  <div class="map-page">
    <Map
      :location="location.current"
      :observations="markers"
      :owned-observation-ids="ownedObservationIds"
      @select-observation="editObservation"
      @select-location="addObservationAt"
    />
    <div class="map-status" aria-live="polite">
      <Message v-if="location.error" severity="error" role="alert">{{ location.error }}</Message>
      <Message v-else-if="publicError || observations.error" severity="error" role="alert">
        {{ publicError || observations.error }}
      </Message>
    </div>
  </div>
</template>
