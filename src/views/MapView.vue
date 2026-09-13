<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { getPublicObservations } from "../services/api";
import { database } from "../services/storage";
import type { Observation } from "../types/observation";
import Map from "../components/Map.vue";
import LocationDetails from "../components/LocationDetails.vue";
import ManualLocationForm from "../components/ManualLocationForm.vue";
import { useLocationStore } from "../stores/location";
import { useObservationStore } from "../stores/observation";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Card from "primevue/card";
import Message from "primevue/message";
const location = useLocationStore();
const observations = useObservationStore();
const { t } = useI18n();
const publicObservations = ref<Observation[]>([]);
const publicError = ref("");
const publicBusy = ref(false);
const markers = computed(() => {
  const localIds = new Set(observations.observations.map((o) => o.id));
  return [
    ...observations.observations,
    ...publicObservations.value.filter((o) => !localIds.has(o.id)),
  ];
});
async function loadPublic() {
  publicBusy.value = true;
  publicError.value = "";
  try {
    const result = await getPublicObservations();
    const localIds = new Set(
      await database.observations.toCollection().primaryKeys(),
    );
    publicObservations.value = result.observations.filter(
      (o) => !localIds.has(o.id),
    );
    if (result.nextCursor)
      publicError.value = t("map.publicLimit");
  } catch {
    publicError.value = t("map.publicError");
  } finally {
    publicBusy.value = false;
  }
}
onMounted(() => {
  void observations.load();
});
</script>

<template>
  <h1 tabindex="-1">{{ t("map.title") }}</h1>
  <Message v-if="observations.notice" severity="success" role="status">
    {{ observations.notice }}
  </Message>
  <div class="map-layout">
    <Card class="location-panel" aria-labelledby="location-heading">
      <template #title><h2 id="location-heading">{{ t("map.location") }}</h2></template>
      <template #content>
      <Button
        outlined
        :disabled="location.loading"
        @click="location.locate()"
        :label="
          location.loading
            ? t('map.locating')
            : location.current
              ? t('map.updateLocation')
              : t('map.locate')
        "
      >
      </Button>
      <Message v-if="location.error" severity="error" role="alert">
        {{ location.error }}
      </Message>
      <ManualLocationForm
        v-if="location.error && !location.current"
        @selected="location.setManualLocation"
      />
      <div aria-live="polite">
        <LocationDetails v-if="location.current" :location="location.current" />
      </div>
      </template>
    </Card>
    <div>
      <Map :location="location.current" :observations="markers" />
      <div class="map-caption">
        <span>● {{ t("map.yourLocation") }}</span
        ><span>{{ t("map.local", { count: observations.observations.length }) }}</span>
      </div>
    </div>
  </div>
  <div class="actions">
    <Button outlined :disabled="publicBusy" :loading="publicBusy" @click="loadPublic" :label="publicBusy ? t('map.loadingPublic') : t('map.loadPublic')" />
    <span>{{ t("map.publicLoaded", { count: publicObservations.length }) }}</span>
  </div>
  <p v-if="publicError" role="status">{{ publicError }}</p>
  <Message v-if="observations.error" severity="error" role="alert">
    {{ observations.error }}
    <Button outlined @click="observations.load()" :label="t('map.retry')" />
  </Message>
  <p
    v-if="!observations.observations.length && !observations.error"
    class="empty-note"
  >
    {{ t("map.empty") }}
  </p>
</template>
