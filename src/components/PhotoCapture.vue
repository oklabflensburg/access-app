<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { preparePhoto } from "../services/camera";
import type { Photo } from "../types/observation";
const props = defineProps<{ observationId: string }>();
const photos = defineModel<Photo[]>({ required: true });
const emit = defineEmits<{ busy: [value: boolean] }>();
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
async function add(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!files.length) return;
  error.value = "";
  busy.value = true;
  emit("busy", true);
  try {
    if (photos.value.length + files.length > 6)
      throw new Error("Add at most 6 photos per observation.");
    const prepared: Photo[] = [];
    for (const file of files)
      prepared.push(await preparePhoto(file, props.observationId));
    if (!disposed) photos.value = [...photos.value, ...prepared];
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Could not process this photo.";
  } finally {
    busy.value = false;
    emit("busy", false);
  }
}
</script>
<template>
  <section aria-labelledby="photos-heading" class="optional-section">
    <h2 id="photos-heading">Photos <span class="optional">(optional)</span></h2>
    <p class="small">
      Up to 6 photos of entrances, ramps, or obstacles. Photos are resized and
      location metadata is removed. Avoid including identifiable people.
    </p>
    <div class="field">
      <label for="camera">Take a photo</label
      ><input
        id="camera"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        :disabled="busy"
        @change="add"
      />
    </div>
    <div class="field">
      <label for="photo-files">Choose photos</label
      ><input
        id="photo-files"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        :disabled="busy"
        @change="add"
      />
    </div>
    <p v-if="busy" role="status">Preparing photos…</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <ul class="photo-grid">
      <li v-for="(photo, index) in previews" :key="photo.id">
        <img :src="photo.url" :alt="`Observation photo ${index + 1}`" /><button
          type="button"
          class="secondary"
          :disabled="busy"
          @click="photos = photos.filter((p) => p.id !== photo.id)"
        >
          Remove photo {{ index + 1 }}
        </button>
      </li>
    </ul>
  </section>
</template>
