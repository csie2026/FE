import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptTrackPoint, distanceMeters, distanceToCourse, formatDuration, hasReachedSummit, isUsablePoint, trackDistance } from '../src/components/hiking/trackUtils.ts';
import type { GpsPoint } from '../src/components/hiking/types.ts';

const point = (lat = 37, lng = 127, timestamp = Date.now()): GpsPoint => ({
  lat, lng, latitude: lat, longitude: lng, timestamp, accuracy: 10, altitude: null, speed: null,
});
test('haversine distance and pause segments never add connecting distance', () => {
  const a = point(); const b = point(37.001); const c = point(38);
  assert.ok(Math.abs(distanceMeters(a, b) - 111.195) < 0.1);
  assert.equal(distanceMeters(a, a), 0);
  assert.equal(trackDistance([[a, b], [c]]), distanceMeters(a, b));
});
test('GPS filter rejects inaccurate, stale, duplicate, reversed and impossible samples', () => {
  const now = Date.now(); const a = point(37, 127, now - 10_000);
  assert.equal(isUsablePoint({ ...a, accuracy: 51 }), false);
  assert.equal(isUsablePoint({ ...a, timestamp: now - 16_000 }), false);
  assert.equal(isUsablePoint({ ...a, lat: NaN }), false);
  assert.equal(acceptTrackPoint(point(37, 127, now), a), false);
  assert.equal(acceptTrackPoint(point(38, 127, now), a), false);
  assert.equal(acceptTrackPoint(point(37.0001, 127, now), a), true);
  assert.equal(acceptTrackPoint(point(37.0001, 127, now - 11_000), a), false);
});
test('summit uses radius and ignores low accuracy', () => {
  assert.equal(hasReachedSummit(point(37.0003), { lat: 37, lng: 127 }), true);
  assert.equal(hasReachedSummit(point(37.001), { lat: 37, lng: 127 }), false);
  assert.equal(hasReachedSummit({ ...point(), accuracy: 100 }, { lat: 37, lng: 127 }), false);
});
test('course distance measures line segments rather than only course vertices', () => {
  const path = [{ lat: 37, lng: 127 }, { lat: 37.002, lng: 127 }];
  assert.ok(distanceToCourse({ lat: 37.001, lng: 127 }, path) < 0.01);
  assert.ok(distanceToCourse({ lat: 37.001, lng: 127.001 }, path) > 80);
  assert.equal(distanceToCourse(point(), []), Infinity);
});
test('duration formatting includes hours', () => {
  assert.equal(formatDuration(3_661_000), '01:01:01');
});
