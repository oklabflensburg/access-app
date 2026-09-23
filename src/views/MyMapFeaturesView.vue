<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Card from "primevue/card";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import {
  deleteMapFeature,
  getLocalMapFeatures,
  updateMapFeatureProperties,
} from "../services/storage";
import {
  mapFeatureTypes,
  type MapFeature,
  type MapFeatureType,
} from "../types/map-feature";

const { t, locale } = useI18n();
const features = ref<MapFeature[]>([]);
const editId = ref("");
const confirmId = ref("");
const featureName = ref("");
const featureType = ref<MapFeatureType>("area");
const saving = ref(false);
const error = ref("");

async function load() {
  try {
    features.value = await getLocalMapFeatures();
  } catch {
    error.value = t("errors.mapFeatures");
  }
}

function startEdit(feature: MapFeature) {
  editId.value = feature.id;
  featureName.value = feature.name;
  featureType.value = feature.type;
  error.value = "";
}

function cancelEdit() {
  editId.value = "";
}

async function save(feature: MapFeature) {
  saving.value = true;
  error.value = "";
  try {
    await updateMapFeatureProperties(
      feature.id,
      featureName.value,
      featureType.value,
    );
    editId.value = "";
    await load();
  } catch (cause) {
    error.value = cause instanceof Error
      ? cause.message
      : t("featureList.updateError");
  } finally {
    saving.value = false;
  }
}

async function remove(id: string) {
  error.value = "";
  try {
    await deleteMapFeature(id);
    confirmId.value = "";
    if (editId.value === id) editId.value = "";
    await load();
  } catch (cause) {
    error.value = cause instanceof Error
      ? cause.message
      : t("featureList.deleteError");
  }
}

onMounted(load);
</script>

<template>
  <h1>{{ t("featureList.title") }}</h1>
  <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
  <p v-if="!features.length">{{ t("featureList.empty") }}</p>
  <ul class="observation-list">
    <li v-for="feature in features" :key="feature.id">
      <Card>
        <template #title>
          <h2>{{ feature.name || t("featureList.unnamed") }}</h2>
        </template>
        <template #content>
          <form
            v-if="editId === feature.id"
            class="feature-edit-form"
            @submit.prevent="save(feature)"
          >
            <label :for="`feature-name-${feature.id}`">{{ t("map.featureName") }}</label>
            <input
              :id="`feature-name-${feature.id}`"
              v-model="featureName"
              type="text"
              maxlength="120"
            />
            <label :for="`feature-type-${feature.id}`">{{ t("map.featureType") }}</label>
            <select :id="`feature-type-${feature.id}`" v-model="featureType">
              <option v-for="type in mapFeatureTypes" :key="type" :value="type">
                {{ t(`map.featureTypes.${type}`) }}
              </option>
            </select>
            <div class="actions">
              <Button
                type="submit"
                :loading="saving"
                :label="saving ? t('featureList.saving') : t('featureList.save')"
              />
              <Button
                type="button"
                outlined
                :label="t('featureList.cancel')"
                @click="cancelEdit"
              />
            </div>
          </form>
          <template v-else>
            <p>{{ t(`map.featureTypes.${feature.type}`) }}</p>
            <p class="small">
              {{ t("featureList.created", { date: new Date(feature.createdAt).toLocaleString(locale) }) }}
            </p>
            <p>{{ t("list.status", { status: feature.syncStatus }) }}</p>
            <Message v-if="feature.lastError" severity="error">{{ feature.lastError }}</Message>
            <div class="actions">
              <Button
                outlined
                :label="t('featureList.edit')"
                @click="startEdit(feature)"
              />
              <Button
                outlined
                severity="danger"
                :label="t('featureList.delete')"
                @click="confirmId = feature.id"
              />
            </div>
          </template>
          <Dialog
            v-if="confirmId === feature.id"
            modal
            :visible="true"
            :header="t('featureList.confirmDelete')"
            @update:visible="confirmId = ''"
          >
            <p>{{ t("featureList.confirmDeleteDescription") }}</p>
            <template #footer>
              <Button
                severity="danger"
                :label="t('featureList.confirm')"
                @click="remove(feature.id)"
              />
              <Button
                outlined
                :label="t('featureList.keep')"
                @click="confirmId = ''"
              />
            </template>
          </Dialog>
        </template>
      </Card>
    </li>
  </ul>
</template>
