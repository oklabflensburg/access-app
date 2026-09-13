<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useObservationStore } from "../stores/observation";
import { deleteObservation } from "../services/storage";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Card from "primevue/card";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
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
  <Message v-if="error || store.error" severity="error" role="alert">
    {{ error || store.error }}
  </Message>
  <p v-if="!store.observations.length">
    {{ t("list.empty") }}
  </p>
  <ul class="observation-list">
    <li
      v-for="observation in store.observations"
      :key="observation.id"
    >
      <Card>
      <template #title><h2>{{ new Date(observation.createdAt).toLocaleString(locale) }}</h2></template>
      <template #content>
      <p>{{ observation.comment || t("map.noComment") }}</p>
      <p class="small">
        {{ observation.location.latitude.toFixed(5) }},
        {{ observation.location.longitude.toFixed(5) }} ·
        {{ t("list.photos", { count: observation.photoIds?.length ?? 0 }) }}
      </p>
      <p>
        {{ t("list.status", { status: observation.syncStatus }) }}
      </p>
      <Message v-if="observation.lastError" severity="error">
        {{ observation.lastError }}
      </Message>
      <div class="actions">
        <Button outlined severity="danger" @click="confirmId = observation.id" :label="t('list.delete')" />
      </div>
      <Dialog
        v-if="confirmId === observation.id"
        modal
        :visible="true"
        :header="t('list.confirmDelete')"
        @update:visible="confirmId = ''"
      >
        <p>{{ t("list.confirmDelete") }}</p>
        <template #footer>
          <Button severity="danger" @click="remove(observation.id)" :label="t('list.confirm')" />
          <Button outlined @click="confirmId = ''" :label="t('list.keep')" />
        </template>
      </Dialog>
      </template>
      </Card>
    </li>
  </ul>
</template>
