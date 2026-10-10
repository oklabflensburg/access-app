<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import ToggleSwitch from "primevue/toggleswitch";
import { usePreferencesStore } from "../stores/preferences";

const { t } = useI18n();
const router = useRouter();
const preferences = usePreferencesStore();
onMounted(() => void preferences.load());
function close() {
  void router.push({ name: "map" });
}
function update(value: boolean) {
  void preferences.save(value);
}
</script>

<template>
  <Dialog
    modal
    dismissable-mask
    :visible="true"
    class="list-dialog preferences-dialog"
    aria-labelledby="preferences-dialog-title"
    @update:visible="close"
  >
    <template #header>
      <h1 id="preferences-dialog-title" class="dialog-title">{{ t("preferences.title") }}</h1>
    </template>
    <Message v-if="preferences.error" severity="error" role="alert">
      {{ preferences.error }}
    </Message>
    <div class="preference-field">
      <label for="wheelchair-accessible">{{ t("preferences.wheelchair") }}</label>
      <p class="small">{{ t("preferences.wheelchairHint") }}</p>
      <ToggleSwitch
        id="wheelchair-accessible"
        :model-value="preferences.wheelchairAccessible"
        :disabled="preferences.saving"
        :aria-label="t('preferences.wheelchair')"
        @update:model-value="update"
      />
    </div>
    <p class="small">{{ t("preferences.saveHint") }}</p>
  </Dialog>
</template>

<style scoped>
.preference-field {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid #dce4dc;
  border-radius: 12px;
  background: #fff;
}
.preference-field label {
  font-weight: 600;
}
.preference-field :deep(.p-toggleswitch) {
  justify-self: start;
  margin-top: 4px;
}
</style>
