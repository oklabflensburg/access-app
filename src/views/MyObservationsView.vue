<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useObservationStore } from "../stores/observation";
import { deleteObservation } from "../services/storage";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Card from "primevue/card";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import { RouterLink, useRouter } from "vue-router";
const store = useObservationStore();
const router = useRouter();
const { t, locale } = useI18n();
const confirmId = ref("");
const error = ref("");
onMounted(store.load);
function close() {
  void router.push({ name: "map" });
}
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
  <Dialog
    modal
    dismissable-mask
    :visible="true"
    class="list-dialog"
    aria-labelledby="observations-dialog-title"
    @update:visible="close"
  >
    <template #header>
      <h1 id="observations-dialog-title" class="dialog-title">{{ t("list.title") }}</h1>
    </template>
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
          <RouterLink :to="{ name: 'edit-observation', params: { id: observation.id } }">
            {{ t("list.edit") }}
          </RouterLink>
          <Button outlined severity="danger" @click="confirmId = observation.id" :label="t('list.delete')" />
        </div>
        <Dialog
          v-if="confirmId === observation.id"
          modal
          dismissable-mask
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
  </Dialog>
</template>
