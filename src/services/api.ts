import type { Observation, Photo } from "../types/observation";
import type { SensorData } from "../types/sensors";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(
        body?.error ?? `Serverfehler ${response.status}.`,
      );
    }
    return (await response.json()) as T;
  } catch (cause) {
    if (controller.signal.aborted)
      throw new Error(
        "Zeitüberschreitung beim Server.",
      );
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}
const headers = (o: Observation) => ({
  Authorization: `Bearer ${o.editToken}`,
  "Content-Type": "application/json",
});
export function uploadObservation(o: Observation, sensors?: SensorData) {
  const { observationId: _, ...measurements } = sensors ?? {
    observationId: o.id,
  };
  return request<{ id: string; revision: number }>("/observations", {
    method: "POST",
    headers: headers(o),
    body: JSON.stringify({
      id: o.id,
      createdAt: o.createdAt,
      revision: o.revision,
      location: o.location,
      accessibility: o.accessibility,
      comment: o.comment,
      photoIds: o.photoIds ?? [],
      ...measurements,
    }),
  });
}
export function uploadPhoto(o: Observation, photo: Photo) {
  const form = new FormData();
  form.append("id", photo.id);
  form.append("revision", String(o.revision));
  form.append("photo", photo.blob, `${photo.id}.jpg`);
  return request<{ id: string }>(`/observations/${o.id}/photos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${o.editToken}` },
    body: form,
  });
}
export function removeRemoteObservation(o: Observation) {
  return request<{ id: string; revision: number }>(`/observations/${o.id}`, {
    method: "DELETE",
    headers: headers(o),
    body: JSON.stringify({ revision: o.revision }),
  });
}
export function getPublicObservations() {
  return request<{ observations: Observation[]; nextCursor: string | null }>(
    "/observations?limit=200",
  );
}
