<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { liveQuery } from "dexie";
import { database } from "../services/storage";
import { useSyncStore } from "../stores/sync";
const sync = useSyncStore();
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
    <h2 id="sync-heading">Share with the public map</h2>
    <p>
      Sync publishes ready observations, exact locations, comments, photos, and
      optional measurements. Drafts stay private. Pending deletions are sent
      too.
    </p>
    <p>
      {{ sync.online ? "Online" : "Offline" }} · {{ pending }} queued changes
    </p>
    <button
      class="primary"
      :disabled="sync.busy || !sync.online"
      @click="sync.sync(true)"
    >
      {{ sync.busy ? "Synchronizing…" : "Share & sync now" }}
    </button>
    <label class="auto-sync"
      ><input
        type="checkbox"
        :checked="sync.automatic"
        @change="sync.setAutomatic(($event.target as HTMLInputElement).checked)"
      />
      Automatically share ready observations and retry while this app is
      open</label
    >
    <p v-if="sync.message" role="status">{{ sync.message }}</p>
  </section>
</template>
