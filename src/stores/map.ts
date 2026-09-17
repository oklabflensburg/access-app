import { defineStore } from "pinia";
import { ref } from "vue";

export const useMapStore = defineStore("map", () => {
  const drawRequest = ref(0);

  function requestDrawing() {
    drawRequest.value += 1;
  }

  return { drawRequest, requestDrawing };
});
