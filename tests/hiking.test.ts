import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptTrackPoint,
  distanceMeters,
  distanceToCourse,
  formatDuration,
  hasReachedSummit,
  isUsablePoint,
  trackDistance,
} from '../src/components/hiking/trackUtils.ts';
import { GPS_FILTER, SUMMIT_RADIUS_METERS } from '../src/components/hiking/config.ts';
import { nearestCoursePosition } from '../src/components/hiking/mapDisplayPath.ts';
import type { GpsPoint } from '../src/components/hiking/types.ts';

const point = (lat = 37, lng = 127, timestamp = Date.now()): GpsPoint => ({
  lat,
  lng,
  latitude: lat,
  longitude: lng,
  timestamp,
  accuracy: 10,
  altitude: null,
  speed: null,
});
test('haversine distance and pause segments never add connecting distance', () => {
  const a = point();
  const b = point(37.001);
  const c = point(38);
  assert.ok(Math.abs(distanceMeters(a, b) - 111.195) < 0.1);
  assert.equal(distanceMeters(a, a), 0);
  assert.equal(trackDistance([[a, b], [c]]), distanceMeters(a, b));
});
test('GPS filter rejects inaccurate, stale, duplicate, reversed and impossible samples', () => {
  const now = Date.now();
  const a = point(37, 127, now - 10_000);
  assert.equal(isUsablePoint({ ...a, accuracy: 51 }), false);
  assert.equal(isUsablePoint({ ...a, timestamp: now - 16_000 }), false);
  assert.equal(isUsablePoint({ ...a, lat: NaN }), false);
  assert.equal(acceptTrackPoint(point(37, 127, now), a), false);
  assert.equal(acceptTrackPoint(point(38, 127, now), a), false);
  assert.equal(acceptTrackPoint(point(37.0001, 127, now), a), true);
  assert.equal(acceptTrackPoint(point(37.0001, 127, now - 11_000), a), false);
});
const summit = { lat: 0, lng: 127 };
const northOfSummit = (meters: number) => point((meters / 6_371_000) * (180 / Math.PI));

test('summit radius is 30m while GPS accuracy allowance remains 50m', () => {
  assert.equal(SUMMIT_RADIUS_METERS, 30);
  assert.equal(GPS_FILTER.maxAccuracyMeters, 50);
  assert.equal(hasReachedSummit(point(37.0002), { lat: 37, lng: 127 }), true);
  // 약 33m 떨어진 이 표본은 구버전의 정상 반경 50m에서는 정상 도달로 판정되었다.
  assert.equal(hasReachedSummit(point(37.0003), { lat: 37, lng: 127 }), false);
});

test('summit distance includes the 30m boundary and rejects samples just outside', () => {
  assert.ok(Math.abs(distanceMeters(northOfSummit(30), summit) - 30) < 1e-9);
  assert.equal(hasReachedSummit(northOfSummit(29.99), summit), true);
  assert.equal(hasReachedSummit(northOfSummit(30), summit), true);
  assert.equal(hasReachedSummit(northOfSummit(30.01), summit), false);
  assert.equal(hasReachedSummit(northOfSummit(50), summit), false);
});

test('accuracy 50m remains usable, but accuracy just beyond 50m cannot complete a hike', () => {
  const valid = { ...northOfSummit(20), accuracy: 50 };
  assert.equal(isUsablePoint(valid), true);
  assert.equal(hasReachedSummit(valid, summit), true);
  assert.equal(isUsablePoint({ ...valid, accuracy: 50.01 }), false);
  assert.equal(hasReachedSummit({ ...valid, accuracy: 50.01 }, summit), false);
});

test('even a summit sample must have valid, fresh GPS data', () => {
  for (const invalid of [
    { ...northOfSummit(0), accuracy: 100 },
    { ...northOfSummit(0), accuracy: -1 },
    { ...northOfSummit(0), timestamp: Date.now() - 16_000 },
    { ...northOfSummit(0), timestamp: Date.now() + 60_000 },
    { ...northOfSummit(0), lat: NaN },
  ])
    assert.equal(hasReachedSummit(invalid, summit), false);
});

test('display snapping onto the summit does not turn an outside raw GPS point into completion', () => {
  const raw = northOfSummit(33);
  const original = { ...raw };
  const projection = nearestCoursePosition(raw, [{ lat: -0.001, lng: 127 }, summit])!;
  assert.deepEqual(projection.coordinate, summit);
  assert.equal(hasReachedSummit(raw, summit), false);
  assert.deepEqual(raw, original);
});

test('course distance measures line segments rather than only course vertices', () => {
  const path = [
    { lat: 37, lng: 127 },
    { lat: 37.002, lng: 127 },
  ];
  assert.ok(distanceToCourse({ lat: 37.001, lng: 127 }, path) < 0.01);
  assert.ok(distanceToCourse({ lat: 37.001, lng: 127.001 }, path) > 80);
  assert.equal(distanceToCourse(point(), []), Infinity);
});
test('duration formatting includes hours', () => {
  assert.equal(formatDuration(3_661_000), '01:01:01');
});
