<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Card from "primevue/card";
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
import type { LocationData } from "../types/location";
import type { Photo } from "../types/observation";
import type { SensorData } from "../types/sensors";

const emit = defineEmits<{ saved: [] }>();
const { t } = useI18n();
const id = crypto.randomUUID();
const photos = ref<Photo[]>([]);
const sensors = ref<SensorData>({ observationId: id });
const photoBusy = ref(false);
const sensorBusy = ref(false);
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
onMounted(() => void captureLocation());
async function save() {
  if (saving.value || !location.value || photoBusy.value || sensorBusy.value)
    return;
  saving.value = true;
  error.value = "";
  try {
    await store.save(
      {
        id,
        createdAt: new Date().toISOString(),
        location: { ...location.value },
        accessibility: { ...accessibility.value },
        comment: comment.value.trim(),
        syncStatus: "ready",
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
  emit("saved");
}
</script>

<template>
  <div class="form-page" id="new-observation">
    <h1>{{ t("observation.title") }}</h1>
    <Card class="captured-location" aria-labelledby="captured-heading">
      <template #title><h2 id="captured-heading">{{ t("map.location") }}</h2></template>
      <template #content>
      <p v-if="locationStore.loading" role="status">{{ t("map.locating") }}</p>
      <Message v-if="locationStore.error" severity="error" role="alert">
        {{ locationStore.error }}
      </Message>
      <ManualLocationForm
        v-if="locationStore.error && !location"
        @selected="useManualLocation"
      />
      <LocationDetails v-if="location" :location="location" />
      <Button outlined :disabled="locationStore.loading || saving" @click="captureLocation" :label="location ? t('map.updateLocation') : t('map.locate')" />
      </template>
    </Card>
    <Card class="questionnaire">
      <template #content>
    <form @submit.prevent="save">
      <fieldset class="form-fields" :disabled="saving">
        <AccessibilityForm v-model="accessibility" />
        <div class="field">
          <label for="comment">{{ t("observation.comment") }} <span class="optional">({{ t("observation.optional") }})</span></label>
          <InputTextarea id="comment" v-model="comment" rows="4" maxlength="2000" :placeholder="t('observation.placeholder')" />
        </div>
        <PhotoCapture v-model="photos" :observation-id="id" @busy="photoBusy = $event" />
        <SensorMeasurements v-model="sensors" @busy="sensorBusy = $event" />
      </fieldset>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <p v-if="!location" class="small">{{ t("location.required") }}</p>
      <Button type="submit" :disabled="!location || locationStore.loading || saving || photoBusy || sensorBusy" :loading="saving" :label="saving ? t('observation.saving') : t('observation.save')" />
    </form>
      </template>
    </Card>
  </div>
</template>
