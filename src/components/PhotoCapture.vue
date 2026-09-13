<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { preparePhoto } from "../services/camera";
import type { Photo } from "../types/observation";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import FileUpload, {
  type FileUploadUploaderEvent,
} from "primevue/fileupload";
import Message from "primevue/message";
const props = defineProps<{ observationId: string }>();
const photos = defineModel<Photo[]>({ required: true });
const emit = defineEmits<{ busy: [value: boolean] }>();
const { t } = useI18n();
const busy = ref(false);
const error = ref("");
const previews = ref<{ id: string; url: string }[]>([]);
let disposed = false;
function revoke() {
  previews.value.forEach((p) => URL.revokeObjectURL(p.url));
}
watch(
  photos,
  () => {
    revoke();
    previews.value = photos.value.map((p) => ({
      id: p.id,
      url: URL.createObjectURL(p.blob),
    }));
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  disposed = true;
  revoke();
});
async function add(event: FileUploadUploaderEvent) {
  const files = Array.isArray(event.files) ? event.files : [event.files];
  if (!files.length) return;
  error.value = "";
  busy.value = true;
  emit("busy", true);
  try {
    if (photos.value.length + files.length > 6)
      throw new Error(t("observation.maxPhotos"));
    const prepared: Photo[] = [];
    for (const file of files)
      prepared.push(await preparePhoto(file, props.observationId));
    if (!disposed) photos.value = [...photos.value, ...prepared];
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : t("observation.photoError");
  } finally {
    busy.value = false;
    emit("busy", false);
  }
}
</script>
<template>
  <section aria-labelledby="photos-heading" class="optional-section">
    <h2 id="photos-heading">{{ t("observation.photos") }} <span class="optional">({{ t("observation.optional") }})</span></h2>
    <div class="field">
      <label for="camera">{{ t("observation.takePhoto") }}</label>
      <FileUpload
        id="camera"
        mode="basic"
        accept="image/jpeg,image/png,image/webp"
        :choose-label="t('observation.takePhoto')"
        :custom-upload="true"
        :input-props="{ capture: 'environment' }"
        :disabled="busy"
        @uploader="add"
      />
    </div>
    <div class="field">
      <label for="photo-files">{{ t("observation.choosePhotos") }}</label>
      <FileUpload
        id="photo-files"
        accept="image/jpeg,image/png,image/webp"
        multiple
        mode="basic"
        :choose-label="t('observation.choosePhotos')"
        :custom-upload="true"
        :disabled="busy"
        @uploader="add"
      />
    </div>
    <p v-if="busy" role="status">{{ t("observation.preparingPhotos") }}</p>
    <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
    <ul class="photo-grid">
      <li v-for="(photo, index) in previews" :key="photo.id">
        <img :src="photo.url" :alt="t('observation.photo', { number: index + 1 })" /><Button
          type="button"
          outlined
          :disabled="busy"
          @click="photos = photos.filter((p) => p.id !== photo.id)"
          :label="t('observation.removePhoto', { number: index + 1 })"
        />
      </li>
    </ul>
  </section>
</template>
