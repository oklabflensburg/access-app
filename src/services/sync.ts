import { database } from "./storage";
import {
  removeRemoteObservation,
  uploadMapFeature,
  uploadObservation,
  uploadPhoto,
} from "./api";
import type { Observation } from "../types/observation";

let running: Promise<{ synced: number; failed: number }> | undefined;
export function syncObservations(
  force = false,
): Promise<{ synced: number; failed: number }> {
  if (running) return running;
  const work = () => runQueue(force);
  running = (async () =>
    navigator.locks
      ? await navigator.locks.request("accessapp-sync", work)
      : await work())().finally(() => {
    running = undefined;
  });
  return running;
}
async function runQueue(force: boolean) {
  const result = { synced: 0, failed: 0 };
  if (!navigator.onLine)
    throw new Error(
      "Offline. Einträge bleiben auf diesem Gerät gespeichert.",
    );
  // A terminated tab can leave a row in syncing. The cross-tab lock makes recovery safe.
  const queue = await database.observations
    .where("syncStatus")
    .anyOf("ready", "failed", "syncing")
    .toArray();
  for (const o of queue) {
    if (!navigator.onLine) break;
    if (!force && (o.nextRetryAt ?? 0) > Date.now()) continue;
    try {
      await updateIfCurrent(o, { syncStatus: "syncing", lastError: "" });
      if (o.deleted) {
        const ack = await removeRemoteObservation(o);
        if (ack.id !== o.id || ack.revision !== o.revision)
          throw new Error(
            "Löschung konnte nicht bestätigt werden.",
          );
      } else {
        const [sensors, photos] = await Promise.all([
          database.sensors.get(o.id),
          database.photos.where("observationId").equals(o.id).toArray(),
        ]);
        const ack = await uploadObservation(o, sensors);
        if (ack.id !== o.id || ack.revision !== o.revision)
          throw new Error(
            "Der Eintrag wurde auf dem Server geändert.",
          );
        for (const id of o.photoIds ?? []) {
          const photo = photos.find((p) => p.id === id);
          if (!photo)
            throw new Error(
              "Ein lokales Foto fehlt.",
            );
          const photoAck = await uploadPhoto(o, photo);
          if (photoAck.id !== id)
            throw new Error(
              "Foto konnte nicht bestätigt werden.",
            );
        }
      }
      await updateIfCurrent(o, {
        syncStatus: "synced",
        attempts: 0,
        nextRetryAt: 0,
        lastError: "",
      });
      result.synced++;
    } catch (cause) {
      const attempts = (o.attempts ?? 0) + 1;
      await updateIfCurrent(o, {
        syncStatus: "failed",
        attempts,
        nextRetryAt:
          Date.now() + Math.min(300000, 5000 * 2 ** Math.min(attempts, 6)),
        lastError:
          cause instanceof Error
            ? cause.message
            : "Upload fehlgeschlagen.",
      });
      result.failed++;
    }
  }
  const featureQueue = await database.mapFeatures
    .where("syncStatus")
    .anyOf("ready", "failed", "syncing")
    .toArray();
  for (const feature of featureQueue) {
    if (!navigator.onLine) break;
    if (!force && (feature.nextRetryAt ?? 0) > Date.now()) continue;
    try {
      await database.mapFeatures.update(feature.id, {
        syncStatus: "syncing",
        lastError: "",
      });
      const ack = await uploadMapFeature(feature);
      if (ack.id !== feature.id)
        throw new Error("Die Fläche konnte nicht bestätigt werden.");
      await database.mapFeatures.update(feature.id, {
        syncStatus: "synced",
        attempts: 0,
        nextRetryAt: 0,
        lastError: "",
      });
      result.synced++;
    } catch (cause) {
      const attempts = (feature.attempts ?? 0) + 1;
      await database.mapFeatures.update(feature.id, {
        syncStatus: "failed",
        attempts,
        nextRetryAt:
          Date.now() + Math.min(300000, 5000 * 2 ** Math.min(attempts, 6)),
        lastError:
          cause instanceof Error ? cause.message : "Upload fehlgeschlagen.",
      });
      result.failed++;
    }
  }
  return result;
}
async function updateIfCurrent(o: Observation, changes: Partial<Observation>) {
  await database.transaction("rw", database.observations, async () => {
    const current = await database.observations.get(o.id);
    if (current?.revision === o.revision)
      await database.observations.update(o.id, changes);
  });
}
