<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import PwaStatus from "./components/PwaStatus.vue";
import MapView from "./views/MapView.vue";
import NewObservationView from "./views/NewObservationView.vue";
import MyObservationsView from "./views/MyObservationsView.vue";
import { useSyncStore } from "./stores/sync";
import { useI18n } from "vue-i18n";
const sync = useSyncStore();
const { t } = useI18n();
const formKey = ref(0);
let stop: (() => void) | undefined;
onMounted(() => {
  stop = sync.start();
});
onBeforeUnmount(() => stop?.());
</script>

<template>
  <a class="skip-link" href="#main">{{ t("app.skip") }}</a>
  <header class="site-header">
    <span class="brand"><span aria-hidden="true" class="brand-icon">a</span>AccessApp</span>
  </header>
  <main id="main">
    <PwaStatus />
    <MapView />
    <NewObservationView :key="formKey" @saved="formKey += 1" />
    <MyObservationsView />
  </main>
  <footer>{{ t("app.footer") }}</footer>
</template>
