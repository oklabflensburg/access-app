import { defineStore } from "pinia";
import { ref } from "vue";

export const useMapStore = defineStore("map", () => {
  const drawRequest = ref(0);
  const drawMode = ref<"feature" | "child">("feature");

  function requestDrawing(mode: "feature" | "child" = "feature") {
    drawMode.value = mode;
    drawRequest.value += 1;
  }

  return { drawRequest, drawMode, requestDrawing };
});
