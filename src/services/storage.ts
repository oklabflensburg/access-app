import Dexie, { type Table } from "dexie";
import type { Observation, Photo } from "../types/observation";
import type { SensorData } from "../types/sensors";

class ObservationDatabase extends Dexie {
  observations!: Table<Observation, string>;
  photos!: Table<Photo, string>;
  sensors!: Table<SensorData, string>;
  constructor() {
    super("accessapp");
    this.version(1).stores({ observations: "id, createdAt, syncStatus" });
    this.version(2)
      .stores({
        observations: "id, createdAt, syncStatus",
        photos: "id, observationId",
        sensors: "observationId",
      })
      .upgrade((tx) =>
        tx
          .table("observations")
          .toCollection()
          .modify((row) => {
            row.revision = 1;
            row.editToken = crypto.randomUUID();
            row.photoIds = [];
          }),
      );
  }
}

export const database = new ObservationDatabase();

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
    throw new Error("Ein gültiger Standort ist erforderlich.");
  }
  await database.transaction(
    "rw",
    database.observations,
    database.photos,
    database.sensors,
    async () => {
      const old = await database.observations.get(observation.id);
      if (old && (old.revision !== observation.revision || old.deleted))
        throw new Error(
          "Dieser Eintrag wurde in einem anderen Tab geändert.",
        );
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
