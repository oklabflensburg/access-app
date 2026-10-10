import { defineStore } from "pinia";
import { ref } from "vue";
import type { FeatureDrawingMode } from "../types/map-feature";

export const useMapStore = defineStore("map", () => {
  const drawRequest = ref(0);
  const drawMode = ref<FeatureDrawingMode>("feature");
  const pickPointRequest = ref(0);
  const routeRequest = ref(0);

  function requestRouting() {
    routeRequest.value += 1;
  }

  function requestDrawing(mode: FeatureDrawingMode = "feature") {
    drawMode.value = mode;
    drawRequest.value += 1;
  }

  function requestObservationPoint() {
    pickPointRequest.value += 1;
  }

  return {
    drawRequest,
    drawMode,
    requestDrawing,
    pickPointRequest,
    requestObservationPoint,
    routeRequest,
    requestRouting,
  };
});
