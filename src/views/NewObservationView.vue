<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import InputTextarea from "primevue/textarea";
import Message from "primevue/message";
import AccessibilityForm from "../components/AccessibilityForm.vue";
import LocationDetails from "../components/LocationDetails.vue";
import ManualLocationForm from "../components/ManualLocationForm.vue";
import PhotoCapture from "../components/PhotoCapture.vue";
import SensorMeasurements from "../components/SensorMeasurements.vue";
import { useLocationStore } from "../stores/location";
import { useObservationStore } from "../stores/observation";
import { emptyAccessibility } from "../types/observation";
import { database } from "../services/storage";
import { detectParentFeatureForPoint } from "../domain/map/geometry";
import { mapFeaturesKey } from "../injectionKeys";
import type { LocationData } from "../types/location";
import type { MapFeature } from "../types/map-feature";
import type { Photo } from "../types/observation";
import type { SensorData } from "../types/sensors";

const { t } = useI18n();
withDefaults(defineProps<{ embedded?: boolean }>(), {
  embedded: false,
});
const route = useRoute();
const router = useRouter();
const id = typeof route.params.id === "string" ? route.params.id : crypto.randomUUID();
const editing = computed(() => typeof route.params.id === "string");
const createdAt = ref<string>();
const revision = ref<number>();
const photos = ref<Photo[]>([]);
const sensors = ref<SensorData>({ observationId: id });
const photoBusy = ref(false);
const sensorBusy = ref(false);
const locationStore = useLocationStore();
const store = useObservationStore();
const features = inject(mapFeaturesKey, ref<MapFeature[]>([]));
const location = ref<LocationData | null>(null);
const accessibility = ref(emptyAccessibility());
const comment = ref("");
const saving = ref(false);
const error = ref("");

// The feature the observation belongs to: the one containing its location.
const parentFeature = computed(() => {
  if (!location.value) return null;
  return detectParentFeatureForPoint(
    location.value.latitude,
    location.value.longitude,
    features.value,
  );
});
const parentFeatureLabel = computed(() =>
  parentFeature.value
    ? parentFeature.value.name || t(`map.featureTypes.${parentFeature.value.type}`)
    : "",
);

function selectedMapLocation(): LocationData | null {
  const latitude = Number(route.query.latitude);
  const longitude = Number(route.query.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    return null;
  return {
    latitude,
    longitude,
    accuracy: null,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    timestamp: Date.now(),
  };
}
async function captureLocation() {
  location.value = await locationStore.locate();
}
function useManualLocation(selected: LocationData) {
  locationStore.setManualLocation(selected);
  location.value = { ...selected };
}
async function loadObservation() {
  const observation = await database.observations.get(id);
  if (!observation || observation.deleted) {
    error.value = t("observation.notFound");
    return;
  }
  const [savedPhotos, savedSensors] = await Promise.all([
    database.photos.where("observationId").equals(id).toArray(),
    database.sensors.get(id),
  ]);
  location.value = { ...observation.location };
  accessibility.value = { ...observation.accessibility };
  comment.value = observation.comment;
  createdAt.value = observation.createdAt;
  revision.value = observation.revision ?? 0;
  photos.value = savedPhotos;
  sensors.value = savedSensors ?? { observationId: id };
}
onMounted(() => {
  if (editing.value) void loadObservation();
  else {
    const mapLocation = selectedMapLocation();
    if (mapLocation) useManualLocation(mapLocation);
    else void captureLocation();
  }
});
async function save() {
  if (saving.value || !location.value || photoBusy.value || sensorBusy.value)
    return;
  if (editing.value && (!createdAt.value || revision.value === undefined)) {
    error.value = t("observation.notFound");
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    await store.save(
      {
        id,
        createdAt: createdAt.value ?? new Date().toISOString(),
        location: { ...location.value },
        accessibility: { ...accessibility.value },
        comment: comment.value.trim(),
        syncStatus: "ready",
        revision: revision.value,
        parentFeatureId: parentFeature.value?.id ?? null,
      },
      photos.value,
      sensors.value,
    );
  } catch {
    error.value = t("errors.save");
    saving.value = false;
    return;
  }
  saving.value = false;
  await router.push({ name: "map" });
}
</script>

<template>
  <div class="form-page observation-form" id="new-observation">
    <h1 v-if="!embedded">{{ editing ? t("observation.edit") : t("observation.title") }}</h1>
    <header class="observation-context" aria-labelledby="observation-object-heading">
      <span class="context-icon" aria-hidden="true"><i class="pi pi-map-marker" /></span>
      <div>
        <p class="context-label">{{ parentFeature ? t("observation.parentFeature") : t("map.location") }}</p>
        <h2 id="observation-object-heading">{{ parentFeatureLabel || t("observation.locationEntry") }}</h2>
        <p v-if="parentFeature" class="context-type">{{ t(`map.featureTypes.${parentFeature.type}`) }}</p>
      </div>
    </header>

    <section class="observation-section captured-location" aria-labelledby="captured-heading">
      <div class="section-heading location-heading">
        <h2 id="captured-heading">{{ t("map.location") }}</h2>
        <Button
          type="button"
          outlined
          icon="pi pi-refresh"
          :disabled="locationStore.loading || saving"
          :loading="locationStore.loading"
          @click="captureLocation"
          :aria-label="location ? t('map.updateLocation') : t('map.locate')"
          :title="location ? t('map.updateLocation') : t('map.locate')"
          :label="location ? t('map.updateLocation') : t('map.locate')"
        />
      </div>
      <p v-if="locationStore.loading" class="small" role="status">{{ t("map.locating") }}</p>
      <Message v-if="locationStore.error" severity="error" role="alert">{{ locationStore.error }}</Message>
      <ManualLocationForm v-if="locationStore.error && !location" @selected="useManualLocation" />
      <LocationDetails v-if="location" :location="location" />
    </section>

    <form class="questionnaire" @submit.prevent="save">
      <fieldset class="form-fields" :disabled="saving" :aria-label="t('observation.details')">
        <section class="observation-section" aria-labelledby="accessibility-heading">
          <div class="section-heading">
            <i class="pi pi-check-circle" aria-hidden="true" />
            <h2 id="accessibility-heading">{{ t("observation.accessibility") }}</h2>
          </div>
          <AccessibilityForm v-model="accessibility" />
        </section>

        <section class="observation-section" aria-labelledby="documentation-heading">
          <div class="section-heading">
            <i class="pi pi-file-edit" aria-hidden="true" />
            <h2 id="documentation-heading">{{ t("observation.documentation") }}</h2>
          </div>
          <div class="field comment-field">
            <label for="comment">{{ t("observation.comment") }} <span class="optional">{{ t("observation.optional") }}</span></label>
            <InputTextarea id="comment" v-model="comment" rows="3" maxlength="2000" :placeholder="t('observation.placeholder')" />
          </div>
          <PhotoCapture v-model="photos" :observation-id="id" @busy="photoBusy = $event" />
        </section>

        <div class="observation-section measurements-section">
          <SensorMeasurements v-model="sensors" @busy="sensorBusy = $event" />
        </div>
      </fieldset>
      <div class="observation-actions">
        <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
        <p class="small">{{ !location ? t("location.required") : t("observation.saveHint") }}</p>
        <Button type="submit" icon="pi pi-check" :disabled="!location || locationStore.loading || saving || photoBusy || sensorBusy" :loading="saving" :label="saving ? t('observation.saving') : t('observation.save')" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.observation-form {
  --p-button-primary-background: #18594b;
  --p-button-primary-border-color: #18594b;
  --p-button-primary-hover-background: #104638;
  --p-button-primary-hover-border-color: #104638;
  --p-button-primary-active-background: #104638;
  --p-button-primary-active-border-color: #104638;
  --p-button-outlined-primary-color: #18594b;
  --p-button-outlined-primary-border-color: #b9cbbd;
  --p-button-outlined-primary-hover-background: #f1f6ef;
  --p-button-outlined-primary-active-background: #e5eee2;
  display: grid;
  gap: 16px;
}
.observation-context {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 24px;
  border: 1px solid #cbded2;
  border-radius: 16px;
  background: linear-gradient(120deg, #edf5ee, #f8faf5);
}
.observation-context > div {
  min-width: 0;
}
.context-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: #18594b;
  color: #fff;
  font-size: 1.3rem;
}
.context-label {
  margin: 0 0 4px;
  color: #426958;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.observation-context h2 {
  margin: 0;
  font-size: clamp(1.3rem, 3vw, 1.65rem);
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}
.context-type {
  margin: 4px 0 0;
  color: #52655d;
  font-size: 0.84rem;
}
.observation-section {
  padding: 22px 24px;
  border: 1px solid #dce4dc;
  border-radius: 16px;
  background: #fff;
}
.captured-location {
  margin: 0;
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}
.section-heading > i {
  color: #426958;
  font-size: 1.1rem;
}
.section-heading h2 {
  margin: 0;
  font-size: 1.1rem;
}
.location-heading {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.location-heading :deep(button) {
  padding: 8px 12px;
  font-size: 0.8rem;
}
.captured-location :deep(.location-details) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 24px;
  margin: 0;
  padding-top: 16px;
  border-top: 1px solid #e8ede7;
}
.captured-location :deep(.location-details div) {
  display: grid;
  gap: 2px;
  overflow-wrap: anywhere;
}
.captured-location :deep(.location-extra) {
  margin-top: 12px;
  font-size: 0.78rem;
  color: #52655d;
}
.captured-location :deep(summary) {
  width: fit-content;
  padding: 8px 0;
  cursor: pointer;
}
.captured-location :deep(summary:focus-visible) {
  outline: 3px solid #a34612;
  outline-offset: 4px;
}
.questionnaire .form-fields {
  display: grid;
  gap: 16px;
}
.questionnaire :deep(.accessibility-group) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
}
.questionnaire :deep(.accessibility-group + .accessibility-group) {
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid #e8ede7;
}
.questionnaire :deep(.accessibility-group h3) {
  grid-column: 1 / -1;
  margin: 0;
  color: #52655d;
  font-size: 0.8rem;
  font-weight: 600;
}
.questionnaire :deep(.accessibility-group fieldset),
.questionnaire :deep(.accessibility-group .field) {
  margin: 0;
}
.questionnaire :deep(.accessibility-overview fieldset),
.questionnaire :deep(.surface-field) {
  grid-column: 1 / -1;
}
.questionnaire :deep(legend),
.questionnaire :deep(.field > label) {
  font-size: 0.88rem;
}
.questionnaire :deep(.choices) {
  gap: 6px;
  flex-wrap: wrap;
}
.questionnaire :deep(.choice) {
  padding: 8px;
  font-size: 0.8rem;
}
.questionnaire :deep(.p-select) {
  width: 100%;
}
.questionnaire :deep(.optional) {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f1f4ef;
  color: #52655d;
  font-size: 0.72rem;
  font-weight: 400;
  vertical-align: middle;
}
.comment-field {
  margin-bottom: 0;
}
.questionnaire :deep(.optional-section h2) {
  font-size: 1rem;
}
.questionnaire :deep(.optional-section .field) {
  margin-bottom: 12px;
}
.questionnaire :deep(.optional-section .field > label) {
  display: none;
}
.questionnaire :deep(.photo-grid:empty) {
  display: none;
}
.measurements-section :deep(.optional-section) {
  margin: 0;
  padding: 0;
  border: 0;
}
.measurements-section :deep(.optional-section > button) {
  margin: 0 8px 8px 0;
  padding: 10px 12px;
  font-size: 0.85rem;
}
.observation-actions {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: grid;
  gap: 12px;
  margin-top: 16px;
  padding: 16px 0;
  border-top: 1px solid #dce4dc;
  background: #fff;
}
.observation-actions p {
  margin: 0;
}
.observation-actions > button {
  width: 100%;
  background: #18594b;
  border-color: #18594b;
}
.observation-actions > button:enabled:hover {
  background: #104638;
  border-color: #104638;
}
@media (max-width: 600px) {
  .observation-context,
  .observation-section {
    padding: 18px 16px;
    border-radius: 12px;
  }
  .questionnaire :deep(.accessibility-group) {
    grid-template-columns: minmax(0, 1fr);
  }
  .questionnaire :deep(.choice) {
    font-size: 0.85rem;
  }
  .captured-location :deep(.location-details) {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    font-size: 0.78rem;
  }
  .captured-location :deep(.location-details > div:last-child) {
    display: flex;
  }
  .location-heading :deep(.p-button-label) {
    display: none;
  }
  .location-heading :deep(button) {
    width: 48px;
  }
}
</style>
