<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { useSyncStore } from "./stores/sync";
import { useLocationStore } from "./stores/location";
import { useI18n } from "vue-i18n";

const sync = useSyncStore();
const location = useLocationStore();
const route = useRoute();
const { t } = useI18n();
const menuOpen = ref(false);
let stop: (() => void) | undefined;
onMounted(() => {
  stop = sync.start();
});
onBeforeUnmount(() => stop?.());
</script>

<template>
  <a class="skip-link" href="#main">{{ t("app.skip") }}</a>
  <header class="app-bar">
    <button
      class="menu-toggle"
      type="button"
      :aria-expanded="menuOpen"
      aria-controls="main-menu"
      :aria-label="t('app.menu')"
      @click="menuOpen = !menuOpen"
    >
      <i class="pi pi-bars" aria-hidden="true" />
    </button>
    <nav v-if="menuOpen" id="main-menu" class="mobile-menu" :aria-label="t('app.menu')">
      <RouterLink to="/" @click="menuOpen = false">
        <i class="pi pi-map" aria-hidden="true" /> {{ t("app.map") }}
      </RouterLink>
      <RouterLink to="/beobachtung" @click="menuOpen = false">
        <i class="pi pi-pencil" aria-hidden="true" /> {{ t("app.observation") }}
      </RouterLink>
    </nav>
    <button
      v-if="route.name === 'map'"
      class="location-update"
      type="button"
      :disabled="location.loading"
      @click="location.locate()"
    >
      <i :class="location.loading ? 'pi pi-spin pi-spinner' : 'pi pi-map-marker'" aria-hidden="true" />
      <span>{{ location.loading ? t("map.locating") : t("map.updateLocation") }}</span>
    </button>
  </header>
  <main id="main" :class="{ 'map-main': route.name === 'map' }">
    <RouterView />
  </main>
</template>
