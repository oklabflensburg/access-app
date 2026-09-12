<script setup lang="ts">
import { ref } from "vue";
import type { LocationData } from "../types/location";

const emit = defineEmits<{ selected: [location: LocationData] }>();
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
    error.value = "Enter a latitude from −90 to 90 and longitude from −180 to 180.";
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
    <p class="small">
      If automatic location is unavailable, enter coordinates from your map app.
    </p>
    <div class="manual-location-fields">
      <label>
        Latitude
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
        Longitude
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
      Use these coordinates
    </button>
  </div>
</template>
