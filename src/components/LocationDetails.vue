<script setup lang="ts">
import type { LocationData } from "../types/location";
import { useI18n } from "vue-i18n";
defineProps<{ location: LocationData }>();
const { t, locale } = useI18n();
</script>

<template>
  <dl class="location-details">
    <div>
      <dt>{{ t("location.coordinates") }}</dt>
      <dd>
        {{ location.latitude.toFixed(6) }}, {{ location.longitude.toFixed(6) }}
      </dd>
    </div>
    <div>
      <dt>{{ t("location.accuracy") }}</dt>
      <dd>
        {{
          location.accuracy === null
            ? t("location.unavailable")
            : t("location.within", { meters: Math.round(location.accuracy) })
        }}
      </dd>
    </div>
    <div>
      <dt>{{ t("location.altitude") }}</dt>
      <dd>
        {{
          location.altitude === null
            ? t("location.unavailable")
            : `${Math.round(location.altitude)} m`
        }}
      </dd>
    </div>
    <div>
      <dt>{{ t("location.captured") }}</dt>
      <dd>
        {{
          location.timestamp === null
            ? t("location.unavailable")
            : new Date(location.timestamp).toLocaleString(locale)
        }}
      </dd>
    </div>
  </dl>
</template>
