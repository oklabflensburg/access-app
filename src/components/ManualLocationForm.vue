<script setup lang="ts">
import { ref } from "vue";
import type { LocationData } from "../types/location";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import Message from "primevue/message";

const emit = defineEmits<{ selected: [location: LocationData] }>();
const { t } = useI18n();
const latitude = ref<number | null>(null);
const longitude = ref<number | null>(null);
const error = ref("");

function selectLocation() {
  const parsedLatitude = latitude.value;
  const parsedLongitude = longitude.value;
  if (
    parsedLatitude === null ||
    parsedLongitude === null ||
    parsedLatitude < -90 ||
    parsedLatitude > 90 ||
    parsedLongitude < -180 ||
    parsedLongitude > 180
  ) {
    error.value = t("location.invalid");
    return;
  }

  error.value = "";
  emit("selected", {
    latitude: parsedLatitude,
    longitude: parsedLongitude,
    accuracy: null,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    timestamp: Date.now(),
  });
}
</script>

<template>
  <div class="manual-location">
    <p class="small">{{ t("location.manual") }}</p>
    <div class="manual-location-fields">
      <label for="latitude">
        {{ t("location.latitude") }}
        <InputNumber
          id="latitude"
          v-model="latitude"
          name="latitude"
          :min="-90"
          :max="90"
          :min-fraction-digits="0"
          :max-fraction-digits="8"
          required
        />
      </label>
      <label for="longitude">
        {{ t("location.longitude") }}
        <InputNumber
          id="longitude"
          v-model="longitude"
          name="longitude"
          :min="-180"
          :max="180"
          :min-fraction-digits="0"
          :max-fraction-digits="8"
          required
        />
      </label>
    </div>
    <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
    <Button type="button" outlined @click="selectLocation" :label="t('location.use')" />
  </div>
</template>
