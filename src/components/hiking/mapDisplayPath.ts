import type { Coordinate } from './types.ts';
import { GPS_FILTER } from './config.ts';
import { distanceMeters } from './trackUtils.ts';

// 지도 전용 최근접점: 원본 GPS 좌표는 변경하지 않습니다.
export function nearestCoursePosition(point: Coordinate, path: readonly Coordinate[]) {
  if (!path.length || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  // 위도에 따른 경도 길이 차이를 보정한 뒤 코스 선분에 투영해 표시 위치를 구한다.
  const longitudeScale = Math.cos((point.lat * Math.PI) / 180);
  let closestDistance = Infinity;
  let progress = 0;
  let traversedMeters = 0;
  let alongMeters = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const lengthMeters = distanceMeters(a, b);
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
      alongMeters = traversedMeters + lengthMeters * t;
    }
    traversedMeters += lengthMeters;
  }
  const index = Math.floor(progress);
  const a = path[index];
  const b = path[Math.min(index + 1, path.length - 1)];
  const t = progress - index;
  return {
    coordinate: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
    progress,
    alongMeters,
  };
}

// 기존 GPS 정확도 한도(50m) 안에서만 지도 표시를 코스에 맞춘다.
export function matchCoursePosition(point: Coordinate, path: readonly Coordinate[]) {
  const projection = nearestCoursePosition(point, path);
  return projection && distanceMeters(point, projection.coordinate) <= GPS_FILTER.maxAccuracyMeters
    ? projection
    : null;
}

// 지도 표시 전용: 원본 기록을 변경하지 않고 코스의 가장 멀리 진행한 위치까지 복사합니다.
// 산행 거리, GPS 필터 및 정상 도달 판정에는 이 좌표를 사용하지 않습니다.
export function courseProgressPath(
  path: readonly Coordinate[],
  segments: readonly (readonly Coordinate[])[],
): Coordinate[] {
  if (path.length < 2) return [];
  let furthest = 0;
  let previous: { point: Coordinate; alongMeters: number } | null = null;
  for (const segment of segments) {
    for (const point of segment) {
      const projection = matchCoursePosition(point, path);
      if (!projection) continue;
      // 가까이 접힌 코스의 다른 구간으로 GPS가 튀어도 진행률을 크게 올리지 않는다.
      // 두 표본의 매칭 오차만 허용하며, 원본 거리나 수집 공백을 보충하지 않는다.
      if (
        previous &&
        Math.abs(projection.alongMeters - previous.alongMeters) >
          distanceMeters(previous.point, point) + 2 * GPS_FILTER.maxAccuracyMeters
      )
        continue;
      previous = { point, alongMeters: projection.alongMeters };
      furthest = Math.max(furthest, projection.progress);
    }
  }
  if (!furthest) return [];
  const index = Math.floor(furthest);
  const result = path.slice(0, index + 1).map((point) => ({ ...point }));
  if (index < path.length - 1 && furthest > index) {
    const a = path[index];
    const b = path[index + 1];
    const t = furthest - index;
    result.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
  }
  return result;
}
