<script setup lang="ts">
import { ref } from "vue";
import type { LocationData } from "../types/location";
import { useI18n } from "vue-i18n";

const emit = defineEmits<{ selected: [location: LocationData] }>();
const { t } = useI18n();
const latitude = ref<string | number>("");
const longitude = ref<string | number>("");
const error = ref("");

function selectLocation() {
  const rawLatitude = String(latitude.value).trim();
  const rawLongitude = String(longitude.value).trim();
  const parsedLatitude = Number(rawLatitude);
  const parsedLongitude = Number(rawLongitude);
  if (
    rawLatitude === "" ||
    rawLongitude === "" ||
    !Number.isFinite(parsedLatitude) ||
    !Number.isFinite(parsedLongitude) ||
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
      <label>
        {{ t("location.latitude") }}
        <input
          v-model="latitude"
          name="latitude"
          type="number"
          min="-90"
          max="90"
          step="any"
          inputmode="decimal"
          required
        />
      </label>
      <label>
        {{ t("location.longitude") }}
        <input
          v-model="longitude"
          name="longitude"
          type="number"
          min="-180"
          max="180"
          step="any"
          inputmode="decimal"
          required
        />
      </label>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button class="secondary" type="button" @click="selectLocation">
      {{ t("location.use") }}
    </button>
  </div>
</template>
