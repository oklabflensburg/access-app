<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { liveQuery } from "dexie";
import { database } from "../services/storage";
import { useSyncStore } from "../stores/sync";
import { useI18n } from "vue-i18n";
const sync = useSyncStore();
const { t } = useI18n();
const pending = ref(0);
const canSync = computed(
  () => pending.value > 0 && sync.online && !sync.busy,
);
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

function synchronize() {
  if (!canSync.value) return;
  void sync.sync(true);
}
</script>
<template>
  <div class="sync-panel">
    <button
      type="button"
      class="menu-action"
      :disabled="!canSync"
      @click="synchronize"
    >
      <i :class="sync.busy ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'" aria-hidden="true" />
      <span>{{ sync.busy ? t("sync.syncing") : t("sync.action") }}</span>
      <span class="sync-count">{{ t("sync.queued", { count: pending }) }}</span>
    </button>
  </div>
</template>
