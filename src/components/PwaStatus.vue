<script setup lang="ts">
import { useRegisterSW } from "virtual:pwa-register/vue";
import { useI18n } from "vue-i18n";
const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();
const { t } = useI18n();
</script>
<template>
  <div v-if="offlineReady || needRefresh" class="pwa-status" role="status">
    <template v-if="needRefresh"
      >{{ t("pwa.update") }}
      <button class="secondary" @click="updateServiceWorker(true)">
        {{ t("pwa.reload") }}
      </button></template
    >
    <template v-else
      >{{ t("pwa.ready") }}</template
    >
    <button
      class="secondary"
      @click="
        offlineReady = false;
        needRefresh = false;
      "
    >
      {{ t("pwa.dismiss") }}
    </button>
  </div>
</template>
