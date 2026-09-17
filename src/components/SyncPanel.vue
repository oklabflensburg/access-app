<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { liveQuery } from "dexie";
import { database } from "../services/storage";
import { useSyncStore } from "../stores/sync";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Card from "primevue/card";
import Checkbox from "primevue/checkbox";
const sync = useSyncStore();
const { t } = useI18n();
const pending = ref(0);
const subscription = liveQuery(() =>
  Promise.all([
    database.observations
      .where("syncStatus")
      .anyOf("ready", "failed", "syncing")
      .count(),
    database.mapFeatures
      .where("syncStatus")
      .anyOf("ready", "failed", "syncing")
      .count(),
  ]).then(([observations, features]) => observations + features),
).subscribe({
  next: (count) => {
    pending.value = count;
  },
  error: () => {
    /* Main storage error is displayed by the observation store. */
  },
});
onBeforeUnmount(() => subscription.unsubscribe());
</script>
<template>
  <Card class="sync-panel" aria-labelledby="sync-heading">
    <template #title><h2 id="sync-heading">{{ t("sync.title") }}</h2></template>
    <template #content>
    <p>
      {{ sync.online ? t("sync.online") : t("sync.offline") }} · {{ t("sync.queued", { count: pending }) }}
    </p>
    <Button
      :disabled="sync.busy || !sync.online"
      @click="sync.sync(true)"
      :loading="sync.busy"
      :label="sync.busy ? t('sync.syncing') : t('sync.share')"
    />
    <label class="auto-sync"
      ><Checkbox
        :model-value="sync.automatic"
        binary
        @update:model-value="sync.setAutomatic"
      />
      {{ t("sync.automatic") }}</label
    >
    <p v-if="sync.message" role="status">{{ sync.message }}</p>
    </template>
  </Card>
</template>
