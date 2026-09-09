<script setup lang="ts">
import { useRegisterSW } from "virtual:pwa-register/vue";
const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();
</script>
<template>
  <div v-if="offlineReady || needRefresh" class="pwa-status" role="status">
    <template v-if="needRefresh"
      >An app update is ready. Save your work before reloading.
      <button class="secondary" @click="updateServiceWorker(true)">
        Reload app
      </button></template
    >
    <template v-else
      >App ready for offline use. Map tiles still need a connection.</template
    >
    <button
      class="secondary"
      @click="
        offlineReady = false;
        needRefresh = false;
      "
    >
      Dismiss
    </button>
  </div>
</template>
