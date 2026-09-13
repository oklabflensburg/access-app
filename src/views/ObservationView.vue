<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import PwaStatus from "../components/PwaStatus.vue";
import NewObservationView from "./NewObservationView.vue";
import MyObservationsView from "./MyObservationsView.vue";

const formKey = ref(0);
const { t } = useI18n();
</script>

<template>
  <div class="observation-page">
    <PwaStatus />
    <NewObservationView :key="formKey" @saved="formKey += 1" />
    <MyObservationsView />
    <footer>AccessApp · {{ t("app.footer") }}</footer>
  </div>
</template>
