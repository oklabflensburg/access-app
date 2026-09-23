<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useSyncStore } from "./stores/sync";
import { useLocationStore } from "./stores/location";
import { useMapStore } from "./stores/map";
import { useI18n } from "vue-i18n";
import SyncPanel from "./components/SyncPanel.vue";
import PwaStatus from "./components/PwaStatus.vue";

const sync = useSyncStore();
const location = useLocationStore();
const map = useMapStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const menuOpen = ref(false);
const mapVisible = computed(() =>
  route.matched.some((record) => record.name === "map"),
);
async function startDrawing() {
  if (route.name !== "map") {
    await router.push({ name: "map" });
    await nextTick();
  }
  map.requestDrawing();
  menuOpen.value = false;
}
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
      <section class="menu-group" :aria-labelledby="'objects-menu-heading'">
        <h2 id="objects-menu-heading" class="menu-heading">{{ t("navigation.objects") }}</h2>
        <button type="button" class="menu-action" @click="startDrawing">
          <i class="pi pi-plus" aria-hidden="true" /> {{ t("navigation.create") }}
        </button>
        <RouterLink to="/map-features" @click="menuOpen = false">
          <i class="pi pi-map-marker" aria-hidden="true" /> {{ t("navigation.myObjects") }}
        </RouterLink>
      </section>
      <section class="menu-group" :aria-labelledby="'observations-menu-heading'">
        <h2 id="observations-menu-heading" class="menu-heading">{{ t("navigation.observations") }}</h2>
        <RouterLink to="/observation/new" @click="menuOpen = false">
          <i class="pi pi-plus" aria-hidden="true" /> {{ t("navigation.create") }}
        </RouterLink>
        <RouterLink to="/observations" @click="menuOpen = false">
          <i class="pi pi-list" aria-hidden="true" /> {{ t("navigation.myObservations") }}
        </RouterLink>
      </section>
      <SyncPanel class="menu-sync" />
    </nav>
    <button
      v-if="mapVisible"
      class="location-update"
      type="button"
      :disabled="location.loading"
      @click="location.locate()"
    >
      <i :class="location.loading ? 'pi pi-spin pi-spinner' : 'pi pi-map-marker'" aria-hidden="true" />
      <span>{{ location.loading ? t("map.locating") : t("map.location") }}</span>
    </button>
  </header>
  <main id="main" :class="{ 'map-main': mapVisible }">
    <PwaStatus v-if="!mapVisible" />
    <RouterView />
    <footer v-if="!mapVisible">{{ t("app.footer") }}</footer>
  </main>
</template>
