<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useObservationStore } from "../stores/observation";
import { deleteObservation } from "../services/storage";
import SyncPanel from "../components/SyncPanel.vue";
const store = useObservationStore();
const confirmId = ref("");
const error = ref("");
onMounted(store.load);
async function remove(id: string) {
  try {
    await deleteObservation(id);
    confirmId.value = "";
    await store.load();
  } catch {
    error.value = "Could not delete this observation. Please retry.";
  }
}
</script>
<template>
  <h1 tabindex="-1">My observations</h1>
  <p>
    Saved on this device. Edit details, manage photos, or share with the public
    map.
  </p>
  <SyncPanel />
  <p v-if="error || store.error" class="error" role="alert">
    {{ error || store.error }}
  </p>
  <p v-if="!store.observations.length">
    No observations yet.
    <RouterLink to="/observation/new">Add an observation</RouterLink>.
  </p>
  <ul class="observation-list">
    <li
      v-for="observation in store.observations"
      :key="observation.id"
      class="panel"
    >
      <h2>{{ new Date(observation.createdAt).toLocaleString() }}</h2>
      <p>{{ observation.comment || "No comment added." }}</p>
      <p class="small">
        {{ observation.location.latitude.toFixed(5) }},
        {{ observation.location.longitude.toFixed(5) }} ·
        {{ observation.photoIds?.length ?? 0 }} photos
      </p>
      <p>
        Status: <strong>{{ observation.syncStatus }}</strong>
      </p>
      <p v-if="observation.lastError" class="error">
        {{ observation.lastError }}
      </p>
      <div class="actions">
        <RouterLink
          class="button secondary"
          :to="`/observation/${observation.id}/edit`"
          >Edit observation</RouterLink
        ><button class="secondary" @click="confirmId = observation.id">
          Delete observation
        </button>
      </div>
      <div
        v-if="confirmId === observation.id"
        role="group"
        aria-label="Confirm deletion"
      >
        <p>
          Delete this observation and its photos? If shared, removal from the
          public map will be queued for the next sync.
        </p>
        <button class="primary" @click="remove(observation.id)">
          Confirm delete
        </button>
        <button class="secondary" @click="confirmId = ''">
          Keep observation
        </button>
      </div>
    </li>
  </ul>
</template>
