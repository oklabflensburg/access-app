import { computed, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getWalkingRoute } from "../services/api";
import type { RoutePoint, WalkingRoute } from "../types/routing";

export function useRouting() {
  const { t } = useI18n();
  const active = ref(false);
  const picking = ref<"start" | "end" | null>(null);
  const start = ref<RoutePoint | null>(null);
  const end = ref<RoutePoint | null>(null);
  const result = ref<WalkingRoute | null>(null);
  const loading = ref(false);
  const error = ref("");
  let pending: AbortController | undefined;

  function invalidate() {
    pending?.abort();
    pending = undefined;
    loading.value = false;
    result.value = null;
    error.value = "";
  }

  function clear() {
    invalidate();
    start.value = null;
    end.value = null;
    picking.value = active.value ? "start" : null;
  }

  function close() {
    active.value = false;
    clear();
  }

  function open() {
    active.value = true;
    clear();
  }

  function change(which: "start" | "end") {
    invalidate();
    picking.value = which;
  }

  async function calculate() {
    if (!start.value || !end.value) return;
    invalidate();
    picking.value = null;
    if (start.value.latitude === end.value.latitude && start.value.longitude === end.value.longitude) {
      error.value = t("routing.errors.identical_points");
      return;
    }
    if (!navigator.onLine) {
      error.value = t("routing.errors.offline");
      return;
    }
    const controller = new AbortController();
    pending = controller;
    loading.value = true;
    try {
      const route = await getWalkingRoute(start.value, end.value, controller.signal);
      if (pending === controller) result.value = route;
    } catch (cause) {
      if (pending === controller && !controller.signal.aborted)
        error.value = cause instanceof Error && cause.message !== "Failed to fetch"
          ? cause.message
          : t("routing.errors.unavailable");
    } finally {
      if (pending === controller) {
        loading.value = false;
        pending = undefined;
      }
    }
  }

  function selectPoint(point: RoutePoint) {
    if (!active.value || !picking.value) return;
    if (picking.value === "start") start.value = point;
    else end.value = point;
    if (!start.value) picking.value = "start";
    else if (!end.value) picking.value = "end";
    else void calculate();
  }

  const distance = computed(() => {
    if (!result.value) return "";
    const meters = result.value.distanceMeters;
    return new Intl.NumberFormat("de-DE", {
      style: "unit",
      unit: meters < 1000 ? "meter" : "kilometer",
      maximumFractionDigits: meters < 1000 ? 0 : 2,
    }).format(meters < 1000 ? meters : meters / 1000);
  });

  onBeforeUnmount(close);
  return { active, picking, start, end, result, loading, error, distance, open, close, clear, change, calculate, selectPoint };
}
