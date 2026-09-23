import Dexie, { type Table } from "dexie";
import type { Observation, Photo } from "../types/observation";
import type { SensorData } from "../types/sensors";
import { mapFeatureTypes, type MapFeature, type MapFeatureType } from "../types/map-feature";
import { t } from "../i18n";

class ObservationDatabase extends Dexie {
  observations!: Table<Observation, string>;
  photos!: Table<Photo, string>;
  sensors!: Table<SensorData, string>;
  mapFeatures!: Table<MapFeature, string>;
  constructor() {
    super("accessapp");
    this.version(1).stores({
      observations: "id, createdAt, syncStatus",
      photos: "id, observationId",
      sensors: "observationId",
      mapFeatures: "id, createdAt, syncStatus",
    });
  }
}

export const database = new ObservationDatabase();

export async function saveMapFeature(
  geometry: MapFeature["geometry"],
  name: string,
  type: MapFeatureType,
): Promise<MapFeature> {
  const ring = geometry.coordinates[0];
  if (
    ring.length < 4 ||
    ring.length > 501 ||
    ring.some(
      ([longitude, latitude]) =>
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180,
    ) ||
    ring[0][0] !== ring.at(-1)?.[0] ||
    ring[0][1] !== ring.at(-1)?.[1]
  ) {
    throw new Error(t("errors.invalidArea"));
  }
  const feature: MapFeature = {
    id: crypto.randomUUID(),
    type,
    name: name.trim(),
    geometry,
    createdAt: new Date().toISOString(),
    syncStatus: "ready",
    editToken: crypto.randomUUID(),
    attempts: 0,
    nextRetryAt: 0,
    lastError: "",
  };
  await database.mapFeatures.add(feature);
  return feature;
}

export function getLocalMapFeatures(): Promise<MapFeature[]> {
  return database.mapFeatures.orderBy("createdAt").reverse().toArray();
}

export async function updateMapFeatureProperties(
  id: string,
  name: string,
  type: MapFeatureType,
): Promise<MapFeature> {
  const feature = await database.mapFeatures.get(id);
  if (!feature?.editToken)
    throw new Error(t("errors.featureNotEditable"));
  const trimmedName = name.trim();
  if (trimmedName.length > 120 || !mapFeatureTypes.includes(type))
    throw new Error(t("errors.invalidFeatureProperties"));
  const updated: MapFeature = {
    ...feature,
    name: trimmedName,
    type,
    syncStatus: "ready",
    attempts: 0,
    nextRetryAt: 0,
    lastError: "",
  };
  await database.mapFeatures.put(updated);
  return updated;
}

export async function saveObservation(
  observation: Observation,
  photos: Photo[] = [],
  sensors?: SensorData,
): Promise<void> {
  const { latitude, longitude } = observation.location;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    throw new Error(t("errors.validLocationRequired"));
  }
  await database.transaction(
    "rw",
    database.observations,
    database.photos,
    database.sensors,
    async () => {
      const old = await database.observations.get(observation.id);
      if (old && (old.revision !== observation.revision || old.deleted))
        throw new Error(t("errors.observationConflict"));
      const record: Observation = JSON.parse(
        JSON.stringify({
          ...observation,
          revision: (old?.revision ?? 0) + 1,
          editToken: old?.editToken ?? crypto.randomUUID(),
          photoIds: photos.map((p) => p.id),
          syncStatus: observation.syncStatus === "draft" ? "draft" : "ready",
          attempts: 0,
          nextRetryAt: 0,
          lastError: "",
        }),
      );
      if (old) await database.observations.put(record);
      else await database.observations.add(record);
      await database.photos.where("observationId").equals(record.id).delete();
      if (photos.length)
        await database.photos.bulkPut(
          photos.map((p) => ({
            id: p.id,
            observationId: record.id,
            blob: p.blob,
            width: p.width,
            height: p.height,
          })),
        );
      if (sensors)
        await database.sensors.put(JSON.parse(JSON.stringify(sensors)));
    },
  );
}

export async function getObservations(): Promise<Observation[]> {
  return (
    await database.observations.orderBy("createdAt").reverse().toArray()
  ).filter((o) => !o.deleted);
}

export async function deleteObservation(id: string) {
  // Keep a tombstone until server acknowledgement, including for ambiguous failed uploads.
  await database.transaction(
    "rw",
    database.observations,
    database.photos,
    database.sensors,
    async () => {
      const row = await database.observations.get(id);
      if (!row) return;
      await database.observations.update(id, {
        deleted: true,
        revision: (row.revision ?? 1) + 1,
        syncStatus: "ready",
        nextRetryAt: 0,
        attempts: 0,
      });
      await database.photos.where("observationId").equals(id).delete();
      await database.sensors.delete(id);
    },
  );
}
