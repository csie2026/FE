import type { Coordinate } from './types.ts';

// 지도 전용 최근접점: 원본 GPS 좌표는 변경하지 않습니다.
export function nearestCoursePosition(point: Coordinate, path: readonly Coordinate[]) {
  if (!path.length || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  const longitudeScale = Math.cos(point.lat * Math.PI / 180);
  let closestDistance = Infinity;
  let progress = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const ax = (a.lng - point.lng) * longitudeScale;
    const ay = a.lat - point.lat;
    const dx = (b.lng - a.lng) * longitudeScale;
    const dy = b.lat - a.lat;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) continue;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    const distanceSquared = (ax + t * dx) ** 2 + (ay + t * dy) ** 2;
    if (distanceSquared < closestDistance) {
      closestDistance = distanceSquared;
      progress = i - 1 + t;
    }
  }
  const index = Math.floor(progress);
  const a = path[index];
  const b = path[Math.min(index + 1, path.length - 1)];
  const t = progress - index;
  return { coordinate: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }, progress };
}

// 지도 표시 전용: 원본 기록을 변경하지 않고 코스의 가장 멀리 진행한 위치까지 복사합니다.
// 산행 거리, GPS 필터 및 정상 도달 판정에는 이 좌표를 사용하지 않습니다.
export function courseProgressPath(
  path: readonly Coordinate[],
  segments: readonly (readonly Coordinate[])[],
): Coordinate[] {
  if (path.length < 2) return [];
  let furthest = 0;
  for (const segment of segments) {
    for (const point of segment) {
      const projection = nearestCoursePosition(point, path);
      const progress = projection?.progress ?? 0;
      furthest = Math.max(furthest, progress);
    }
  }
  if (!furthest) return [];
  const index = Math.floor(furthest);
  const result = path.slice(0, index + 1).map(point => ({ ...point }));
  if (index < path.length - 1 && furthest > index) {
    const a = path[index];
    const b = path[index + 1];
    const t = furthest - index;
    result.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
  }
  return result;
}
