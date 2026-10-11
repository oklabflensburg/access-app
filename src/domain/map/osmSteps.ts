import type { OsmStepWay, PolygonGeometry, PolygonPosition } from "../../types/map-feature";
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

function wayId(feature: Record<string, unknown>): number | null {
  const properties = isRecord(feature.properties) ? feature.properties : {};
  const raw = feature.id ?? properties.id;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw !== "string") return null;
  const matched = /^(?:[a-z])?(\d+)$/i.exec(raw);
  const parsed = matched ? Number(matched[1]) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Parse the static steps extract; keeps only the staircase ways (LineStrings). */
export function parseOsmStepsGeoJson(data: unknown): OsmStepWay[] {
  if (!isRecord(data) || data.type !== "FeatureCollection" || !Array.isArray(data.features))
    return [];
  const ways: OsmStepWay[] = [];
  const seen = new Set<number>();
  for (const entry of data.features) {
    if (!isRecord(entry)) continue;
    const osmWayId = wayId(entry);
    if (osmWayId === null || seen.has(osmWayId)) continue;
    const geometry = isRecord(entry.geometry) ? entry.geometry : null;
    if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates))
      continue;
    const coordinates = geometry.coordinates.filter(isPosition);
    if (coordinates.length < 2) continue;
    const properties = isRecord(entry.properties) ? entry.properties : {};
    seen.add(osmWayId);
    ways.push({
      osmWayId,
      name: typeof properties.name === "string" ? properties.name.trim() : "",
      coordinates,
    });
  }
  return ways;
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
 * Buffer an OSM staircase way into the same 10 metre corridor polygon used for
 * drawn paths. Ways too long or bent for the buffer limits are simplified with
 * growing tolerance first.
 */
export function staircaseGeometryFromWay(positions: PolygonPosition[]): PolygonGeometry | null {
  const direct = createPathGeometry(positions);
  if (direct) return direct;
  for (const tolerance of [1, 2, 5, 10, 20]) {
    const geometry = createPathGeometry(simplifyLine(positions, tolerance));
    if (geometry) return geometry;
  }
  return null;
}
