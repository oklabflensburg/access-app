export type PolygonPosition = [longitude: number, latitude: number];

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: [PolygonPosition[]];
}

export interface MapFeature {
  id: string;
  type: "area";
  name: string;
  geometry: PolygonGeometry;
  createdAt: string;
  syncStatus?: "ready" | "syncing" | "synced" | "failed";
  editToken?: string;
  lastError?: string;
  attempts?: number;
  nextRetryAt?: number;
}
