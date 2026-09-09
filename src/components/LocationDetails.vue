<script setup lang="ts">
import type { LocationData } from "../types/location";
defineProps<{ location: LocationData }>();
</script>

<template>
  <dl class="location-details">
    <div>
      <dt>Coordinates</dt>
      <dd>
        {{ location.latitude.toFixed(6) }}, {{ location.longitude.toFixed(6) }}
      </dd>
    </div>
    <div>
      <dt>GPS accuracy</dt>
      <dd>
        {{
          location.accuracy === null
            ? "Unavailable"
            : `Within ${Math.round(location.accuracy)} m`
        }}
      </dd>
    </div>
    <div>
      <dt>Altitude</dt>
      <dd>
        {{
          location.altitude === null
            ? "Unavailable"
            : `${Math.round(location.altitude)} m`
        }}
      </dd>
    </div>
    <div>
      <dt>Captured</dt>
      <dd>
        {{
          location.timestamp === null
            ? "Unavailable"
            : new Date(location.timestamp).toLocaleString()
        }}
      </dd>
    </div>
  </dl>
</template>
