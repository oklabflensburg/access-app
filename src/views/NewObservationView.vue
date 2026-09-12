<script setup lang="ts">
import { onMounted, ref } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import AccessibilityForm from "../components/AccessibilityForm.vue";
import LocationDetails from "../components/LocationDetails.vue";
import ManualLocationForm from "../components/ManualLocationForm.vue";
import { useLocationStore } from "../stores/location";
import { useObservationStore } from "../stores/observation";
import { emptyAccessibility } from "../types/observation";
import type { LocationData } from "../types/location";
import type { Observation, Photo } from "../types/observation";
import type { SensorData } from "../types/sensors";
import { database } from "../services/storage";
import PhotoCapture from "../components/PhotoCapture.vue";
import SensorMeasurements from "../components/SensorMeasurements.vue";

const router = useRouter();
const route = useRoute();
const editing = !!route.params.id;
const id = editing ? String(route.params.id) : crypto.randomUUID();
const original = ref<Observation>();
const photos = ref<Photo[]>([]);
const sensors = ref<SensorData>({ observationId: id });
const photoBusy = ref(false);
const sensorBusy = ref(false);
const loading = ref(editing);
const locationStore = useLocationStore();
const store = useObservationStore();
const location = ref<LocationData | null>(null);
const accessibility = ref(emptyAccessibility());
const comment = ref("");
const saving = ref(false);
const error = ref("");

async function captureLocation() {
  location.value = await locationStore.locate();
}
function useManualLocation(selected: LocationData) {
  locationStore.setManualLocation(selected);
  location.value = { ...selected };
}
onMounted(async () => {
  if (!editing) {
    await captureLocation();
    return;
  }
  try {
    const row = await database.observations.get(id);
    if (!row || row.deleted)
      throw new Error("This observation no longer exists.");
    original.value = row;
    location.value = row.location;
    accessibility.value = row.accessibility;
    comment.value = row.comment;
    photos.value = await database.photos
      .where("observationId")
      .equals(id)
      .toArray();
    sensors.value = (await database.sensors.get(id)) ?? { observationId: id };
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Could not load this observation.";
  } finally {
    loading.value = false;
  }
});
onBeforeRouteLeave(() => !saving.value);
async function save(draft = false) {
  if (
    saving.value ||
    !location.value ||
    photoBusy.value ||
    sensorBusy.value ||
    (editing && !original.value)
  )
    return;
  saving.value = true;
  error.value = "";
  try {
    await store.save(
      {
        ...original.value,
        id,
        createdAt: original.value?.createdAt ?? new Date().toISOString(),
        location: { ...location.value },
        accessibility: { ...accessibility.value },
        comment: comment.value.trim(),
        syncStatus: draft ? "draft" : "ready",
      },
      photos.value,
      sensors.value,
    );
  } catch (cause) {
    error.value =
      "Could not save on this device. Your answers are still here. Check available storage and browser settings, then try again.";
    if (cause instanceof Error && cause.message.includes("another tab"))
      error.value = cause.message;
    saving.value = false;
    return;
  }
  saving.value = false;
  await router.push("/");
}
</script>

<template>
  <div class="form-page">
    <RouterLink class="back-link" to="/">← Back to map</RouterLink>
    <p class="eyebrow">A little detail goes a long way</p>
    <h1 tabindex="-1">
      {{ editing ? "Edit observation" : "New observation" }}
    </h1>
    <p v-if="loading" role="status">Loading observation…</p>
    <p>
      Describe what you can see. Choose “Unknown” for anything you cannot check.
    </p>
    <section class="panel captured-location" aria-labelledby="captured-heading">
      <h2 id="captured-heading">Observation location</h2>
      <p class="small">
        We request your current position to attach it to this observation. Check
        it before saving.
      </p>
      <p v-if="locationStore.loading" role="status">Finding your location…</p>
      <p v-if="locationStore.error" class="error" role="alert">
        {{ locationStore.error }}
      </p>
      <ManualLocationForm
        v-if="locationStore.error && !location"
        @selected="useManualLocation"
      />
      <LocationDetails v-if="location" :location="location" />
      <button
        class="secondary"
        :disabled="locationStore.loading || saving"
        @click="captureLocation"
      >
        {{ location ? "Refresh observation location" : "Try location again" }}
      </button>
    </section>
    <form class="panel questionnaire" @submit.prevent="save(false)">
      <fieldset class="form-fields" :disabled="saving || loading">
        <AccessibilityForm v-model="accessibility" />
        <div class="field">
          <label for="comment"
            >Comment <span class="optional">(optional)</span></label
          ><textarea
            id="comment"
            v-model="comment"
            rows="4"
            maxlength="2000"
            placeholder="For example: step-free entrance on the side of the building"
          /><span class="small">Up to 2,000 characters.</span>
        </div>
        <PhotoCapture
          v-model="photos"
          :observation-id="id"
          @busy="photoBusy = $event"
        />
        <SensorMeasurements v-model="sensors" @busy="sensorBusy = $event" />
      </fieldset>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="!location" class="small">
        A location is needed to save. Allow location access and try again.
      </p>
      <button
        class="primary"
        type="submit"
        :disabled="
          !location ||
          locationStore.loading ||
          saving ||
          loading ||
          photoBusy ||
          sensorBusy ||
          (editing && !original)
        "
      >
        {{ saving ? "Saving…" : "Save observation on this device" }}
      </button>
      <button
        v-if="!original || original.syncStatus === 'draft'"
        class="secondary"
        type="button"
        :disabled="!location || saving || loading || photoBusy || sensorBusy"
        @click="save(true)"
      >
        Save draft
      </button>
      <p class="small">
        Saved locally first. Share ready observations from My observations.
        Drafts are never synced.
      </p>
    </form>
  </div>
</template>
