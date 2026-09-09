import { defineStore } from "pinia";
import { ref } from "vue";
import { syncObservations } from "../services/sync";
import { useObservationStore } from "./observation";
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
      message.value = "This preference could not be saved for the next visit.";
    }
    if (value) void sync();
  }
  async function sync(force = false) {
    if (busy.value) return;
    busy.value = true;
    message.value = "Synchronizing…";
    try {
      const result = await syncObservations(force);
      message.value = `${result.synced} synchronized. ${result.failed} failed. Failed items remain queued for retry.`;
    } catch (cause) {
      message.value =
        cause instanceof Error ? cause.message : "Synchronization failed.";
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
