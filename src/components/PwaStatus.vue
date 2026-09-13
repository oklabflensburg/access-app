<script setup lang="ts">
import { useRegisterSW } from "virtual:pwa-register/vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Message from "primevue/message";
const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();
const { t } = useI18n();
</script>
<template>
  <Message v-if="offlineReady || needRefresh" class="pwa-status" severity="success" role="status">
    <template v-if="needRefresh"
      >{{ t("pwa.update") }}
      <Button outlined @click="updateServiceWorker(true)" :label="t('pwa.reload')" /></template
    >
    <template v-else
      >{{ t("pwa.ready") }}</template
    >
    <Button
      outlined
      @click="
        offlineReady = false;
        needRefresh = false;
      "
      :label="t('pwa.dismiss')"
    />
  </Message>
</template>
