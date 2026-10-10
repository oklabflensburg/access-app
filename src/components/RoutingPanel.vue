<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref } from "vue";
const { t } = useI18n();
const panel = ref<HTMLElement>();
defineExpose({ getHeight: () => panel.value?.getBoundingClientRect().height ?? 0 });
defineProps<{
  picking: "start" | "end" | null;
  loading: boolean;
  error: string;
  distance: string;
  hasStart: boolean;
  hasEnd: boolean;
}>();
defineEmits<{
  close: [];
  clear: [];
  change: [which: "start" | "end"];
  retry: [];
  center: [];
}>();
</script>

<template>
  <section ref="panel" class="routing-panel" :aria-label="t('routing.title')">
    <div class="feature-panel-heading">
      <h2>{{ t("routing.title") }}</h2>
      <button type="button" class="feature-panel-close" :aria-label="t('routing.close')" @click="$emit('close')">×</button>
    </div>
    <p role="status" aria-live="polite">
      <template v-if="picking">{{ t(`routing.pick${picking === 'start' ? 'Start' : 'End'}`) }}</template>
      <template v-else-if="loading">{{ t("routing.loading") }}</template>
      <template v-else-if="distance">{{ t("routing.distance", { distance }) }}</template>
    </p>
    <p v-if="error" class="drawing-error" role="alert">{{ error }}</p>
    <p v-if="distance" class="small">{{ t("routing.snapHint") }}</p>
    <div class="routing-actions">
      <button v-if="picking" type="button" class="secondary" @click="$emit('center')">{{ t("routing.useCenter") }}</button>
      <button v-if="hasStart" type="button" class="secondary" @click="$emit('change', 'start')">{{ t("routing.changeStart") }}</button>
      <button v-if="hasEnd" type="button" class="secondary" @click="$emit('change', 'end')">{{ t("routing.changeEnd") }}</button>
      <button v-if="error && hasStart && hasEnd" type="button" class="primary" @click="$emit('retry')">{{ t("routing.retry") }}</button>
      <button type="button" class="secondary" @click="$emit('clear')">{{ t("routing.clear") }}</button>
    </div>
  </section>
</template>
