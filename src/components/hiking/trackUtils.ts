import { GPS_FILTER, SUMMIT_RADIUS_METERS } from './config.ts';
import type { Coordinate, GpsPoint } from './types.ts';

const radians = (degrees: number) => (degrees * Math.PI) / 180;
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const h =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function isUsablePoint(point: GpsPoint, now = Date.now()): boolean {
  return (
    Number.isFinite(point.lat) &&
    Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lng) <= 180 &&
    Number.isFinite(point.accuracy) &&
    point.accuracy >= 0 &&
    point.accuracy <= GPS_FILTER.maxAccuracyMeters &&
    Number.isFinite(point.timestamp) &&
    now - point.timestamp <= GPS_FILTER.maxSampleAgeMs &&
    point.timestamp <= now
  );
}
export function acceptTrackPoint(point: GpsPoint, previous?: GpsPoint): boolean {
  if (!isUsablePoint(point)) return false;
  if (!previous) return true;
  const seconds = (point.timestamp - previous.timestamp) / 1000;
  const distance = distanceMeters(previous, point);
  return (
    seconds > 0 &&
    distance >= GPS_FILTER.minDistanceMeters &&
    distance / seconds <= GPS_FILTER.maxSpeedMetersPerSecond
  );
}
export function trackDistance(segments: GpsPoint[][]): number {
  return segments.reduce(
    (total, segment) =>
      total +
      segment.reduce((sum, point, i) => sum + (i ? distanceMeters(segment[i - 1], point) : 0), 0),
    0,
  );
}
export function hasReachedSummit(point: GpsPoint, summit: Coordinate): boolean {
  return isUsablePoint(point) && distanceMeters(point, summit) <= SUMMIT_RADIUS_METERS;
}
// 각 코스 선분에 투영한 최소 거리. 짧은 산행 코스용 지역 평면 근사입니다.
export function distanceToCourse(point: Coordinate, path: Coordinate[]): number {
  if (!path.length) return Infinity;
  if (path.length === 1) return distanceMeters(point, path[0]);
  const project = (p: Coordinate) => ({
    x: radians(p.lng - point.lng) * 6_371_000 * Math.cos(radians(point.lat)),
    y: radians(p.lat - point.lat) * 6_371_000,
  });
  let minimum = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = project(path[i - 1]);
    const b = project(path[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared)) : 0;
    minimum = Math.min(minimum, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return minimum;
}
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}
