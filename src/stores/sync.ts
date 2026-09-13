import { defineStore } from "pinia";
import { ref } from "vue";
import { syncObservations } from "../services/sync";
import { useObservationStore } from "./observation";
import { t } from "../i18n";
export const useSyncStore = defineStore("sync", () => {
  const online = ref(navigator.onLine);
  const busy = ref(false);
  const message = ref("");
  const automatic = ref(false);
  try {
    automatic.value = localStorage.getItem("accessapp-auto-sync") === "true";
  } catch {
    /* Storage may be disabled. */
  }
  function setAutomatic(value: boolean) {
    automatic.value = value;
    try {
      localStorage.setItem("accessapp-auto-sync", String(value));
    } catch {
      message.value = t("sync.preferenceError");
    }
    if (value) void sync();
  }
  async function sync(force = false) {
    if (busy.value) return;
    busy.value = true;
    message.value = t("sync.syncing");
    try {
      const result = await syncObservations(force);
      message.value = t("sync.result", result);
    } catch (cause) {
      message.value =
        cause instanceof Error ? cause.message : t("sync.failed");
    } finally {
      busy.value = false;
      await useObservationStore().load();
    }
  }
  function start() {
    const tick = () => {
      online.value = navigator.onLine;
      if (online.value && automatic.value) void sync();
    };
    window.addEventListener("online", tick);
    window.addEventListener("offline", tick);
    const timer = setInterval(tick, 30000);
    tick();
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", tick);
      window.removeEventListener("offline", tick);
    };
  }
  return { online, busy, message, automatic, setAutomatic, sync, start };
});
