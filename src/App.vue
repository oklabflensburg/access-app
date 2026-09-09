<script setup lang="ts">
import { nextTick, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import PwaStatus from "./components/PwaStatus.vue";
import { useSyncStore } from "./stores/sync";
const sync = useSyncStore();
let stop: (() => void) | undefined;
onMounted(() => {
  stop = sync.start();
});
onBeforeUnmount(() => stop?.());

const route = useRoute();
watch(
  () => route.path,
  async () => {
    await nextTick();
    document.querySelector<HTMLElement>("h1")?.focus();
  },
);
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <RouterLink class="brand" to="/" aria-label="AccessApp home"
      ><span aria-hidden="true" class="brand-icon">a</span>AccessApp</RouterLink
    >
    <nav aria-label="Main navigation">
      <RouterLink to="/">Map</RouterLink
      ><RouterLink to="/observations">My observations</RouterLink>
    </nav>
  </header>
  <main id="main"><PwaStatus /><RouterView :key="route.fullPath" /></main>
  <footer>
    Saved on your device · No account needed · Community observations are not
    verified
  </footer>
</template>
