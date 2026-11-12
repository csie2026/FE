import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  courseProgressPath,
  nearestCoursePosition,
  matchCoursePosition,
} from '../src/components/hiking/mapDisplayPath.ts';
import { distanceToCourse, trackDistance } from '../src/components/hiking/trackUtils.ts';
import { GPS_FILTER } from '../src/components/hiking/config.ts';
import {
  sessionStatistics,
  initialSession,
} from '../src/components/hiking/services/sessionRecovery.ts';
import type { GpsPoint } from '../src/components/hiking/types.ts';

test('current display position projects onto closest segment independently of furthest progress', () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
  ];
  const point = Object.freeze({ lat: 0.4, lng: 1.01 });
  const result = nearestCoursePosition(point, path)!;
  assert.ok(Math.abs(result.coordinate.lat - 0.4) < 1e-10);
  assert.equal(result.coordinate.lng, 1);
  assert.ok(distanceToCourse(result.coordinate, path) < 0.001);
  assert.deepEqual(point, { lat: 0.4, lng: 1.01 });
  assert.equal(nearestCoursePosition({ lat: 0.1, lng: 0.2 }, path)!.coordinate.lng, 0.2);
});

test('nearest display position clamps to endpoints and handles unavailable geometry', () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
  ];
  assert.deepEqual(nearestCoursePosition({ lat: 0, lng: 2 }, path)!.coordinate, path[1]);
  assert.deepEqual(nearestCoursePosition({ lat: 0, lng: -1 }, path)!.coordinate, path[0]);
  assert.equal(nearestCoursePosition({ lat: 0, lng: 0 }, []), null);
  assert.equal(nearestCoursePosition({ lat: NaN, lng: 0 }, path), null);
  assert.deepEqual(nearestCoursePosition({ lat: 0, lng: 2 }, [path[0]])!.coordinate, path[0]);
});

test('display progress follows course bends instead of connecting noisy GPS points', () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
    { lat: 0.001, lng: 0.001 },
  ];
  const result = courseProgressPath(path, [[{ lat: 0.0004, lng: 0.00101 }]]);
  assert.deepEqual(result.slice(0, 2), path.slice(0, 2));
  assert.ok(Math.abs(result[2].lat - 0.0004) < 1e-10);
  assert.equal(result[2].lng, 0.001);
});

test('display progress keeps furthest point across backward movement and pause segments', () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
  ];
  const before = courseProgressPath(path, [[{ lat: 1e-5, lng: 0.0007 }]]);
  const after = courseProgressPath(path, [
    [{ lat: 1e-5, lng: 0.0007 }],
    [{ lat: -1e-5, lng: 0.0003 }],
  ]);
  assert.deepEqual(after, before);
});

test('empty records and reset show no progress; endpoint projection covers whole course', () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
  ];
  assert.deepEqual(courseProgressPath(path, []), []);
  assert.deepEqual(courseProgressPath(path, [[]]), []);
  assert.deepEqual(courseProgressPath(path, [[{ lat: 0, lng: -0.001 }]]), []);
  assert.deepEqual(courseProgressPath(path, [[{ lat: 0, lng: 0.001 }]]), path);
  assert.deepEqual(courseProgressPath([], [[{ lat: 0, lng: 0 }]]), []);
});

test('frozen source coordinates stay unchanged and display coordinates are independent copies', () => {
  const path = Object.freeze([
    Object.freeze({ lat: 0, lng: 0 }),
    Object.freeze({ lat: 0, lng: 0.001 }),
  ]);
  const point = Object.freeze({ lat: 1e-5, lng: 0.0006, accuracy: 10, timestamp: 123 });
  const segments = Object.freeze([Object.freeze([point])]);
  const result = courseProgressPath(path, segments);
  result[0].lat = 99;
  assert.equal(path[0].lat, 0);
  assert.deepEqual(point, { lat: 1e-5, lng: 0.0006, accuracy: 10, timestamp: 123 });
});

test('duplicate course vertices do not break projection', () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
  ];
  const result = courseProgressPath(path, [[{ lat: 0, lng: 0.0005 }]]);
  assert.deepEqual(result, [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.0005 },
  ]);
});

test('off-course samples cannot advance or complete the course', () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
  ];
  const valid = { lat: 0.0001, lng: 0.0003 };
  const far = { lat: 0.01, lng: 0.001 };
  const before = courseProgressPath(path, [[valid]]);
  assert.equal(matchCoursePosition(far, path), null);
  assert.deepEqual(courseProgressPath(path, [[far]]), []);
  assert.deepEqual(courseProgressPath(path, [[valid, far]]), before);
  assert.deepEqual(courseProgressPath(path, [[{ lat: 0, lng: 0.002 }]]), []);
});

test('matching tolerance uses the existing 50m limit without extending it', () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
  ];
  const latitude = ((GPS_FILTER.maxAccuracyMeters / 6371000) * 180) / Math.PI;
  assert.ok(matchCoursePosition({ lat: latitude * 0.99, lng: 0.0005 }, path));
  assert.equal(matchCoursePosition({ lat: latitude * 1.01, lng: 0.0005 }, path), null);
});

test('GPS jitter cannot jump to the end of a nearby folded course or regress progress', () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.003 },
    { lat: 0.0001, lng: 0.003 },
    { lat: 0.0001, lng: 0 },
  ];
  const start = { lat: 0, lng: 0.0001 };
  const jumped = { lat: 0.00009, lng: 0.0002 };
  const next = { lat: 0, lng: 0.0003 };
  assert.deepEqual(
    courseProgressPath(path, [[start, jumped]]),
    courseProgressPath(path, [[start]]),
  );
  const progressed = courseProgressPath(path, [[start, jumped, next]]);
  assert.ok(Math.abs(progressed.at(-1)!.lng - next.lng) < 1e-10);
  assert.deepEqual(courseProgressPath(path, [[start, jumped, next], [start]]), progressed);
});

test('course display leaves raw GPS distance, time, speed and segment boundaries untouched', () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
  ];
  const segments = [
    [
      { lat: 0.0001, lng: 0.0001, timestamp: 1000 },
      { lat: -0.0001, lng: 0.0006, timestamp: 11000 },
    ],
    [{ lat: 0.0001, lng: 0.0008, timestamp: 100000 }],
  ] as GpsPoint[][];
  const session = { ...initialSession(), segments, accumulatedMs: 100000 };
  const before = structuredClone(segments);
  const stats = sessionStatistics(session, 100000);
  const display = courseProgressPath(path, segments);
  assert.deepEqual(segments, before);
  assert.deepEqual(sessionStatistics(session, 100000), stats);
  assert.equal(stats.distance, trackDistance(segments));
  assert.notEqual(trackDistance([display as GpsPoint[]]), stats.distance);
  assert.ok(display.every((p) => distanceToCourse(p, path) < 0.001));
});
