import type { Observation, Photo } from "../types/observation";
import type { SensorData } from "../types/sensors";
import type { MapFeature } from "../types/map-feature";
import type {
  FeaturePrioritySettings,
  PriorityArea,
  RemoteRoutingPreferences,
  RoutingPreferences,
} from "../types/preferences";
import type { RoutePoint, WalkingRoute } from "../types/routing";
import { t } from "../i18n";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(
        path === "/routes"
          ? t(`routing.errors.${body?.code ?? "failed"}`)
          : body?.error ?? t("errors.server", { status: response.status }),
      );
    }
    return (await response.json()) as T;
  } catch (cause) {
    if (controller.signal.aborted)
      throw new Error(t("errors.serverTimeout"));
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

export function getWalkingRoute(
  start: RoutePoint,
  end: RoutePoint,
  featurePriorities: FeaturePrioritySettings,
  priorityAreas: PriorityArea[],
  signal: AbortSignal,
) {
  return request<WalkingRoute>("/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start, end, featurePriorities, priorityAreas }),
    signal,
  });
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
      parentFeatureId: o.parentFeatureId ?? null,
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

export function uploadMapFeature(feature: MapFeature) {
  return request<{ id: string }>("/map-features", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${feature.editToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: feature.id,
      type: feature.type,
      name: feature.name,
      geometry: feature.geometry,
      createdAt: feature.createdAt,
      parentFeatureId: feature.parentFeatureId ?? null,
    }),
  });
}

export function removeRemoteMapFeature(feature: MapFeature) {
  return request<{ id: string }>(`/map-features/${feature.id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${feature.editToken}`,
    },
  });
}

export function getPublicMapFeatures() {
  return request<{ features: MapFeature[] }>("/map-features?limit=200");
}

export function fetchRoutingPreferences() {
  return request<RemoteRoutingPreferences & { id: string }>("/preferences/routing");
}

export function uploadRoutingPreferences(prefs: RoutingPreferences) {
  return request<RemoteRoutingPreferences & { id: string }>("/preferences/routing", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      featurePriorities: prefs.featurePriorities,
      revision: prefs.revision,
    }),
  });
}
