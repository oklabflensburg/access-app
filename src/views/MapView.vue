<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { getPublicObservations } from "../services/api";
import { database } from "../services/storage";
import type { Observation } from "../types/observation";
import Map from "../components/Map.vue";
import LocationDetails from "../components/LocationDetails.vue";
import { useLocationStore } from "../stores/location";
import { useObservationStore } from "../stores/observation";
const location = useLocationStore();
const observations = useObservationStore();
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
      publicError.value =
        "Showing the first 200 public observations. Additional observations may not appear.";
  } catch {
    publicError.value =
      "Could not load the public map. Your local observations are still available.";
  } finally {
    publicBusy.value = false;
  }
}
onMounted(() => {
  void observations.load();
});
</script>

<template>
  <div class="page-heading">
    <p class="eyebrow">A more accessible everyday</p>
    <h1 tabindex="-1">
      Every place has a story.<br />Help make it accessible.
    </h1>
    <p>Record entrances, ramps, and the details that make a difference.</p>
  </div>
  <p v-if="observations.notice" class="success" role="status">
    {{ observations.notice }}
  </p>
  <div class="map-layout">
    <aside class="panel location-panel" aria-labelledby="location-heading">
      <p class="eyebrow">Start where you are</p>
      <h2 id="location-heading">Your location</h2>
      <p>
        Allow location access to place your observation accurately. Coordinates
        are saved with your answers on this device.
      </p>
      <button
        class="secondary"
        :disabled="location.loading"
        @click="location.locate()"
      >
        {{
          location.loading
            ? "Finding your location…"
            : location.current
              ? "Update & center location"
              : "Use my location"
        }}
      </button>
      <p v-if="location.error" class="error" role="alert">
        {{ location.error }}
      </p>
      <div aria-live="polite">
        <LocationDetails v-if="location.current" :location="location.current" />
      </div>
      <RouterLink class="button primary" to="/observation/new"
        >+ Add accessibility information</RouterLink
      >
      <p class="small">
        Your location will be captured when you start a new observation.
      </p>
    </aside>
    <div>
      <Map :location="location.current" :observations="markers" />
      <div class="map-caption">
        <span>● Your location</span
        ><span
          >Numbered pins · Saved observations ({{
            observations.observations.length
          }})</span
        >
      </div>
    </div>
  </div>
  <div class="actions">
    <button class="secondary" :disabled="publicBusy" @click="loadPublic">
      {{
        publicBusy ? "Loading public map…" : "Load public observations"
      }}</button
    ><span>{{ publicObservations.length }} public observations loaded</span>
  </div>
  <p v-if="publicError" role="status">{{ publicError }}</p>
  <p v-if="observations.error" class="error" role="alert">
    {{ observations.error }}
    <button class="secondary" @click="observations.load()">
      Retry loading
    </button>
  </p>
  <p
    v-if="!observations.observations.length && !observations.error"
    class="empty-note"
  >
    Your map starts here. Add your first observation to leave a marker.
  </p>
</template>
