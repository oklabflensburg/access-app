<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import Dialog from "primevue/dialog";
import NewObservationView from "./NewObservationView.vue";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const editing = computed(() => typeof route.params.id === "string");

function close() {
  void router.push({ name: "map" });
}
</script>

<template>
  <Dialog
    modal
    dismissable-mask
    :visible="true"
    class="list-dialog edit-observation-dialog"
    aria-labelledby="edit-observation-dialog-title"
    @update:visible="close"
  >
    <template #header>
      <h1 id="edit-observation-dialog-title" class="dialog-title">
        {{ editing ? t("observation.edit") : t("observation.title") }}
      </h1>
    </template>
    <NewObservationView embedded />
  </Dialog>
</template>
