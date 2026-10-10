import L from "leaflet";
import type { MapFeature, PolygonPosition } from "../../types/map-feature";

export interface RingBounds {
  minLongitude: number;
  minLatitude: number;
  maxLongitude: number;
  maxLatitude: number;
}

export function openRing(ring: PolygonPosition[]): PolygonPosition[] {
  const first = ring[0];
  const last = ring.at(-1);
  if (first && last && first[0] === last[0] && first[1] === last[1])
    return ring.slice(0, -1);
  return ring;
}

export function pointInRing(
  longitude: number,
  latitude: number,
  ring: PolygonPosition[],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > latitude) !== (yj > latitude))
      && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function segmentsCross(
  a: PolygonPosition,
  b: PolygonPosition,
  c: PolygonPosition,
  d: PolygonPosition,
): boolean {
  const direction = (p: PolygonPosition, q: PolygonPosition, r: PolygonPosition) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = direction(a, b, c);
  const abD = direction(a, b, d);
  const cdA = direction(c, d, a);
  const cdB = direction(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

export function ringsCross(first: PolygonPosition[], second: PolygonPosition[]): boolean {
  for (let i = 0; i < first.length; i++) {
    const a = first[i];
    const b = first[(i + 1) % first.length];
    for (let j = 0; j < second.length; j++) {
      if (segmentsCross(a, b, second[j], second[(j + 1) % second.length]))
        return true;
    }
  }
  return false;
}

export function ringBounds(ring: PolygonPosition[]): RingBounds {
  const bounds: RingBounds = {
    minLongitude: Infinity,
    minLatitude: Infinity,
    maxLongitude: -Infinity,
    maxLatitude: -Infinity,
  };
  for (const [longitude, latitude] of ring) {
    if (longitude < bounds.minLongitude) bounds.minLongitude = longitude;
    if (longitude > bounds.maxLongitude) bounds.maxLongitude = longitude;
    if (latitude < bounds.minLatitude) bounds.minLatitude = latitude;
    if (latitude > bounds.maxLatitude) bounds.maxLatitude = latitude;
  }
  return bounds;
}

export function boundsOverlap(first: RingBounds, second: RingBounds): boolean {
  return !(first.maxLongitude < second.minLongitude
    || second.maxLongitude < first.minLongitude
    || first.maxLatitude < second.minLatitude
    || second.maxLatitude < first.minLatitude);
}

export function featureOverlapsRing(
  feature: MapFeature,
  positions: PolygonPosition[],
  positionBounds: RingBounds,
): boolean {
  const ring = openRing(feature.geometry.coordinates[0]);
  if (ring.length < 3) return false;
  if (!boundsOverlap(ringBounds(ring), positionBounds)) return false;
  if (ringsCross(ring, positions)) return true;
  if (positions.some(([longitude, latitude]) => pointInRing(longitude, latitude, ring)))
    return true;
  return ring.some(([longitude, latitude]) => pointInRing(longitude, latitude, positions));
}

export function featureContainsRing(
  feature: MapFeature,
  positions: PolygonPosition[],
): boolean {
  const ring = openRing(feature.geometry.coordinates[0]);
  if (ring.length < 3) return false;
  if (!positions.every(([longitude, latitude]) => pointInRing(longitude, latitude, ring)))
    return false;
  return !ringsCross(ring, positions);
}

export function ringArea(ring: PolygonPosition[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(sum) / 2;
}

export function polygonIntersectsItself(ring: [number, number][]): boolean {
  const edgeCount = ring.length - 1;
  for (let first = 0; first < edgeCount; first++) {
    for (let second = first + 1; second < edgeCount; second++) {
      if (second === first + 1 || (first === 0 && second === edgeCount - 1))
        continue;
      if (segmentsCross(ring[first], ring[first + 1], ring[second], ring[second + 1]))
        return true;
    }
  }
  return false;
}

export function containsPoint(
  feature: MapFeature,
  point: L.LatLng,
  map?: L.Map,
): boolean {
  const ring = feature.geometry.coordinates[0];
  let inside = false;
  const pixelPoint = map?.latLngToLayerPoint(point);
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (pixelPoint && map) {
      const first = map.latLngToLayerPoint([yi, xi]);
      const second = map.latLngToLayerPoint([yj, xj]);
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const lengthSquared = dx * dx + dy * dy;
      const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
        ((pixelPoint.x - first.x) * dx + (pixelPoint.y - first.y) * dy) / lengthSquared,
      ));
      if (pixelPoint.distanceTo(L.point(first.x + ratio * dx, first.y + ratio * dy)) <= 8)
        return true;
    }
    if (((yi > point.lat) !== (yj > point.lat))
      && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function featureDepth(feature: MapFeature, features: MapFeature[]): number {
  let depth = 0;
  let parentId = feature.parentFeatureId;
  const visited = new Set([feature.id]);
  while (parentId) {
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const parent = features.find(({ id }) => id === parentId);
    if (!parent) break;
    depth++;
    parentId = parent.parentFeatureId;
  }
  return depth;
}

export function detectParentFeature(
  positions: PolygonPosition[],
  features: MapFeature[],
): { parent: MapFeature | null; conflict: MapFeature | null } {
  const positionBounds = ringBounds(positions);
  const overlapping = features.filter((feature) =>
    featureOverlapsRing(feature, positions, positionBounds));
  const containers = overlapping.filter((feature) =>
    featureContainsRing(feature, positions));
  if (containers.length) {
    const parent = containers.reduce((best, candidate) => {
      const depthDelta = featureDepth(candidate, features) - featureDepth(best, features);
      if (depthDelta > 0) return candidate;
      if (depthDelta === 0
        && ringArea(openRing(candidate.geometry.coordinates[0]))
          < ringArea(openRing(best.geometry.coordinates[0]))) return candidate;
      return best;
    });
    return { parent, conflict: null };
  }
  return { parent: null, conflict: overlapping[0] ?? null };
}

export function detectParentFeatureForPoint(
  latitude: number,
  longitude: number,
  features: MapFeature[],
): MapFeature | null {
  const point = L.latLng(latitude, longitude);
  const containers = features.filter((feature) => containsPoint(feature, point));
  if (!containers.length) return null;
  return containers.reduce((best, candidate) => {
    const depthDelta = featureDepth(candidate, features) - featureDepth(best, features);
    if (depthDelta > 0) return candidate;
    if (depthDelta === 0
      && ringArea(openRing(candidate.geometry.coordinates[0]))
        < ringArea(openRing(best.geometry.coordinates[0]))) return candidate;
    return best;
  });
}
