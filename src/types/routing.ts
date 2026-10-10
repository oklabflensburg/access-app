export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface WalkingRoute {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distanceMeters: number;
  snappedStart: RoutePoint;
  snappedEnd: RoutePoint;
}
