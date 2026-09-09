import type { LocationData } from "./location";

export interface AccessibilityData {
  wheelchairAccessible: boolean | null;
  steps: 0 | 1 | 2 | 3 | null;
  ramp: boolean | null;
  accessibleToilet: boolean | null;
  elevator: boolean | null;
  surface: "smooth" | "uneven" | "cobblestone" | "gravel" | "other" | null;
}

export interface Observation {
  id: string;
  createdAt: string;
  location: LocationData;
  accessibility: AccessibilityData;
  comment: string;
  syncStatus: "draft" | "ready" | "syncing" | "synced" | "failed";
  revision?: number;
  editToken?: string;
  deleted?: boolean;
  lastError?: string;
  attempts?: number;
  nextRetryAt?: number;
  photoIds?: string[];
}

export interface Photo {
  id: string;
  observationId: string;
  blob: Blob;
  width: number;
  height: number;
}

export function emptyAccessibility(): AccessibilityData {
  return {
    wheelchairAccessible: null,
    steps: null,
    ramp: null,
    accessibleToilet: null,
    elevator: null,
    surface: null,
  };
}
