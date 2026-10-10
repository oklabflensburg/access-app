import type { PolygonGeometry, PolygonPosition } from "../../types/map-feature";

export const PATH_WIDTH_METRES = 2;
// Each side can have two points per interior join, plus its endpoints.
export const MAX_PATH_POINTS = 126;
const EARTH_RADIUS = 6371000;
const RADIANS = Math.PI / 180;
const EPSILON = 1e-7;
type Point = [x: number, y: number];

function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(point: Point, a: Point, b: Point): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return Math.abs(cross(a, b, point)) <= EPSILON * length
    && point[0] >= Math.min(a[0], b[0]) - EPSILON
    && point[0] <= Math.max(a[0], b[0]) + EPSILON
    && point[1] >= Math.min(a[1], b[1]) - EPSILON
    && point[1] <= Math.max(a[1], b[1]) + EPSILON;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  if (onSegment(a, c, d) || onSegment(b, c, d)
    || onSegment(c, a, b) || onSegment(d, a, b)) return true;
  return cross(a, b, c) * cross(a, b, d) < 0
    && cross(c, d, a) * cross(c, d, b) < 0;
}

function intersectsItself(points: Point[], closed: boolean): boolean {
  const edges = closed ? points.length : points.length - 1;
  for (let first = 0; first < edges; first++) {
    for (let second = first + 2; second < edges; second++) {
      if (closed && first === 0 && second === edges - 1) continue;
      if (segmentsIntersect(points[first], points[(first + 1) % points.length],
        points[second], points[(second + 1) % points.length])) return true;
    }
  }
  return false;
}

/** Buffer an open centerline in local metre coordinates, independently of map zoom. */
export function createPathGeometry(positions: PolygonPosition[]): PolygonGeometry | null {
  const distinct = positions.filter((point, index) => index === 0
    || point[0] !== positions[index - 1][0] || point[1] !== positions[index - 1][1]);
  if (distinct.length < 2 || distinct.length > MAX_PATH_POINTS
    || distinct.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat)
      || Math.abs(lng) > 180 || Math.abs(lat) > 90)) return null;

  const [originLng, originLat] = distinct[0];
  const meanLatitude = distinct.reduce((sum, [, lat]) => sum + lat, 0) / distinct.length;
  const longitudeScale = EARTH_RADIUS * RADIANS * Math.cos(meanLatitude * RADIANS);
  const latitudeScale = EARTH_RADIUS * RADIANS;
  if (longitudeScale < EPSILON) return null;
  const points: Point[] = distinct.map(([lng, lat]) =>
    [(lng - originLng) * longitudeScale, (lat - originLat) * latitudeScale]);
  if (intersectsItself(points, false)) return null;

  const normals: Point[] = [];
  for (let index = 1; index < points.length; index++) {
    const dx = points[index][0] - points[index - 1][0];
    const dy = points[index][1] - points[index - 1][1];
    const length = Math.hypot(dx, dy);
    if (length <= EPSILON) return null;
    normals.push([-dy / length, dx / length]);
  }
  const halfWidth = PATH_WIDTH_METRES / 2;
  function side(sign: number): Point[] | null {
    const result: Point[] = [];
    const offset = (point: Point, normal: Point): Point =>
      [point[0] + sign * halfWidth * normal[0], point[1] + sign * halfWidth * normal[1]];
    result.push(offset(points[0], normals[0]));
    for (let index = 1; index < points.length - 1; index++) {
      const before = normals[index - 1];
      const after = normals[index];
      const denominator = 1 + before[0] * after[0] + before[1] * after[1];
      // Reversing direction would produce a retraced, invalid polygon.
      if (denominator <= EPSILON) return null;
      const miter: Point = [halfWidth * (before[0] + after[0]) / denominator,
        halfWidth * (before[1] + after[1]) / denominator];
      const turn = before[0] * after[1] - before[1] * after[0];
      // Only the outside of a bend needs beveling; its inside meets at the intersection.
      if (Math.hypot(...miter) <= 2 * halfWidth || sign * turn > 0) {
        result.push([points[index][0] + sign * miter[0], points[index][1] + sign * miter[1]]);
      } else {
        result.push(offset(points[index], before), offset(points[index], after));
      }
    }
    result.push(offset(points.at(-1)!, normals.at(-1)!));
    return result;
  }
  const left = side(1);
  const right = side(-1);
  if (!left || !right) return null;
  const outline = [...left, ...right.reverse()];
  if (outline.length > 500 || intersectsItself(outline, true)) return null;
  const area = outline.reduce((sum, point, index) => {
    const next = outline[(index + 1) % outline.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (Math.abs(area) <= EPSILON) return null;
  const ring: PolygonPosition[] = outline.map(([x, y]) =>
    [originLng + x / longitudeScale, originLat + y / latitudeScale]);
  if (ring.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat)
    || Math.abs(lng) > 180 || Math.abs(lat) > 90)) return null;
  ring.push([...ring[0]]);
  return { type: "Polygon", coordinates: [ring] };
}
