import type { MapFeatureType, OsmFeature, PolygonGeometry, PolygonPosition } from "../../types/map-feature";
import { featureTypes } from "../../types/map-feature";
import { createPathGeometry } from "./pathGeometry";

const EARTH_RADIUS = 6371000;
const RADIANS = Math.PI / 180;
type Point = [x: number, y: number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPosition(value: unknown): value is PolygonPosition {
  return Array.isArray(value) && value.length === 2
    && typeof value[0] === "number" && Number.isFinite(value[0])
    && typeof value[1] === "number" && Number.isFinite(value[1]);
}

function featureId(feature: Record<string, unknown>): number | null {
  const properties = isRecord(feature.properties) ? feature.properties : {};
  const raw = feature.id ?? properties.id;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw !== "string") return null;
  const matched = /^(?:[a-z])?(\d+)$/i.exec(raw);
  const parsed = matched ? Number(matched[1]) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Classifies extract features by their OSM tags; the configured types are
 * checked in order and the first matching rule wins, so a ramped staircase
 * (highway=steps + ramp=wheelchair) stays steps.
 */
function classify(properties: Record<string, unknown>): MapFeatureType | null {
  for (const type of featureTypes) {
    for (const rule of type.osm) {
      if (Object.entries(rule.tags).every(([tag, value]) => properties[tag] === value))
        return type.id;
    }
  }
  return null;
}

/**
 * Parse the static OSM extract; keeps classified ways (LineStrings) and nodes
 * (Points) and drops everything else, e.g. area polygons and unclassified
 * referenced nodes.
 */
export function parseOsmFeaturesGeoJson(data: unknown): OsmFeature[] {
  if (!isRecord(data) || data.type !== "FeatureCollection" || !Array.isArray(data.features))
    return [];
  const features: OsmFeature[] = [];
  const seen = new Set<string>();
  for (const entry of data.features) {
    if (!isRecord(entry)) continue;
    const osmId = featureId(entry);
    if (osmId === null) continue;
    const geometry = isRecord(entry.geometry) ? entry.geometry : null;
    if (!geometry || !Array.isArray(geometry.coordinates)) continue;
    const properties = isRecord(entry.properties) ? entry.properties : {};
    const type = classify(properties);
    if (!type) continue;
    const name = typeof properties.name === "string" ? properties.name.trim() : "";
    if (geometry.type === "LineString") {
      const way = geometry.coordinates.filter(isPosition);
      if (way.length < 2) continue;
      const key = `w${osmId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      features.push({ osmId, type, name, way });
    } else if (geometry.type === "Point" && isPosition(geometry.coordinates)) {
      const key = `n${osmId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      features.push({ osmId, type, name, node: geometry.coordinates });
    }
  }
  return features;
}

function toMetres(positions: PolygonPosition[]): Point[] {
  const [originLng, originLat] = positions[0];
  const meanLatitude = positions.reduce((sum, [, lat]) => sum + lat, 0) / positions.length;
  const longitudeScale = EARTH_RADIUS * RADIANS * Math.cos(meanLatitude * RADIANS);
  const latitudeScale = EARTH_RADIUS * RADIANS;
  return positions.map(([lng, lat]) =>
    [(lng - originLng) * longitudeScale, (lat - originLat) * latitudeScale]);
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1,
        ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dy));
}

/** Douglas-Peucker simplification of an open line, tolerance in metres. */
function simplifyLine(positions: PolygonPosition[], tolerance: number): PolygonPosition[] {
  const points = toMetres(positions);
  const keep = new Set<number>([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let maxDistance = 0;
    for (let index = first + 1; index < last; index++) {
      const distance = distanceToSegment(points[index], points[first], points[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = index;
      }
    }
    if (maxDistance > tolerance && farthest >= 0) {
      keep.add(farthest);
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return [...keep].sort((first, second) => first - second).map((index) => positions[index]);
}

/**
 * Buffer an OSM way into the same 10 metre corridor polygon used for drawn
 * paths. Ways too long or bent for the buffer limits are simplified with
 * growing tolerance first.
 */
export function wayFeatureGeometry(positions: PolygonPosition[]): PolygonGeometry | null {
  const direct = createPathGeometry(positions);
  if (direct) return direct;
  for (const tolerance of [1, 2, 5, 10, 20]) {
    const geometry = createPathGeometry(simplifyLine(positions, tolerance));
    if (geometry) return geometry;
  }
  return null;
}

const NODE_RADIUS_METRES = 5;
const NODE_CIRCLE_SEGMENTS = 12;

/** Buffer an OSM node into a small circle polygon around its position. */
export function nodeFeatureGeometry(
  position: PolygonPosition,
  radiusMetres: number = NODE_RADIUS_METRES,
): PolygonGeometry {
  const [longitude, latitude] = position;
  const latitudeScale = EARTH_RADIUS * RADIANS;
  const longitudeScale = latitudeScale * Math.cos(latitude * RADIANS);
  const ring: PolygonPosition[] = [];
  for (let index = 0; index < NODE_CIRCLE_SEGMENTS; index++) {
    const angle = (2 * Math.PI * index) / NODE_CIRCLE_SEGMENTS;
    ring.push([
      longitude + (Math.cos(angle) * radiusMetres) / longitudeScale,
      latitude + (Math.sin(angle) * radiusMetres) / latitudeScale,
    ]);
  }
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}
