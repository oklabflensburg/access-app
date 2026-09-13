<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { liveQuery } from "dexie";
import { database } from "../services/storage";
import { useSyncStore } from "../stores/sync";
import { useI18n } from "vue-i18n";
const sync = useSyncStore();
const { t } = useI18n();
const pending = ref(0);
const subscription = liveQuery(() =>
  database.observations
    .where("syncStatus")
    .anyOf("ready", "failed", "syncing")
    .count(),
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
  <section class="panel sync-panel" aria-labelledby="sync-heading">
    <h2 id="sync-heading">{{ t("sync.title") }}</h2>
    <p>
      {{ sync.online ? t("sync.online") : t("sync.offline") }} · {{ t("sync.queued", { count: pending }) }}
    </p>
    <button
      class="primary"
      :disabled="sync.busy || !sync.online"
      @click="sync.sync(true)"
    >
      {{ sync.busy ? t("sync.syncing") : t("sync.share") }}
    </button>
    <label class="auto-sync"
      ><input
        type="checkbox"
        :checked="sync.automatic"
        @change="sync.setAutomatic(($event.target as HTMLInputElement).checked)"
      />
      {{ t("sync.automatic") }}</label
    >
    <p v-if="sync.message" role="status">{{ sync.message }}</p>
  </section>
</template>
