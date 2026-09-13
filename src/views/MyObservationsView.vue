<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useObservationStore } from "../stores/observation";
import { deleteObservation } from "../services/storage";
import SyncPanel from "../components/SyncPanel.vue";
import { useI18n } from "vue-i18n";
const store = useObservationStore();
const { t, locale } = useI18n();
const confirmId = ref("");
const error = ref("");
onMounted(store.load);
async function remove(id: string) {
  try {
    await deleteObservation(id);
    confirmId.value = "";
    await store.load();
  } catch {
    error.value = t("list.deleteError");
  }
}
</script>
<template>
  <h1>{{ t("list.title") }}</h1>
  <SyncPanel />
  <p v-if="error || store.error" class="error" role="alert">
    {{ error || store.error }}
  </p>
  <p v-if="!store.observations.length">
    {{ t("list.empty") }}
  </p>
  <ul class="observation-list">
    <li
      v-for="observation in store.observations"
      :key="observation.id"
      class="panel"
    >
      <h2>{{ new Date(observation.createdAt).toLocaleString(locale) }}</h2>
      <p>{{ observation.comment || t("map.noComment") }}</p>
      <p class="small">
        {{ observation.location.latitude.toFixed(5) }},
        {{ observation.location.longitude.toFixed(5) }} ·
        {{ t("list.photos", { count: observation.photoIds?.length ?? 0 }) }}
      </p>
      <p>
        {{ t("list.status", { status: observation.syncStatus }) }}
      </p>
      <p v-if="observation.lastError" class="error">
        {{ observation.lastError }}
      </p>
      <div class="actions">
        <button class="secondary" @click="confirmId = observation.id">{{ t("list.delete") }}</button>
      </div>
      <div
        v-if="confirmId === observation.id"
        role="group"
        :aria-label="t('list.confirmDelete')"
      >
        <p>
          {{ t("list.confirmDelete") }}
        </p>
        <button class="primary" @click="remove(observation.id)">
          {{ t("list.confirm") }}
        </button>
        <button class="secondary" @click="confirmId = ''">
          {{ t("list.keep") }}
        </button>
      </div>
    </li>
  </ul>
</template>
