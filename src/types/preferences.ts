export const routingPreferencesId = "routing";

export interface RoutingPreferences {
  id: typeof routingPreferencesId;
  wheelchairAccessible: boolean;
  revision: number;
  updatedAt: string;
  syncStatus: "ready" | "syncing" | "synced" | "failed";
  attempts: number;
  nextRetryAt: number;
  lastError: string;
}

export interface RemoteRoutingPreferences {
  wheelchairAccessible: boolean;
  revision: number;
  updatedAt: string;
}
