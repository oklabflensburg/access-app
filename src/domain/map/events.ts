import type { LatLng, LeafletEvent } from "leaflet";

export type MapPointEvent = LeafletEvent & { latlng: LatLng };

export function hasMapPoint(event: LeafletEvent): event is MapPointEvent {
  return "latlng" in event;
}
