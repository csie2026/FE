import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseProgressPath, nearestCoursePosition } from '../src/components/hiking/mapDisplayPath.ts';
import { distanceToCourse } from '../src/components/hiking/trackUtils.ts';

test('current display position projects onto closest segment independently of furthest progress', () => {
  const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }];
  const point = Object.freeze({ lat: 0.4, lng: 1.01 });
  const result = nearestCoursePosition(point, path)!;
  assert.ok(Math.abs(result.coordinate.lat - 0.4) < 1e-10);
  assert.equal(result.coordinate.lng, 1);
  assert.ok(distanceToCourse(result.coordinate, path) < 0.001);
  assert.deepEqual(point, { lat: 0.4, lng: 1.01 });
  assert.equal(nearestCoursePosition({ lat: 0.1, lng: 0.2 }, path)!.coordinate.lng, 0.2);
});

test('nearest display position clamps to endpoints and handles unavailable geometry', () => {
  const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
  assert.deepEqual(nearestCoursePosition({ lat: 0, lng: 2 }, path)!.coordinate, path[1]);
  assert.deepEqual(nearestCoursePosition({ lat: 0, lng: -1 }, path)!.coordinate, path[0]);
  assert.equal(nearestCoursePosition({ lat: 0, lng: 0 }, []), null);
  assert.equal(nearestCoursePosition({ lat: NaN, lng: 0 }, path), null);
  assert.deepEqual(nearestCoursePosition({ lat: 0, lng: 2 }, [path[0]])!.coordinate, path[0]);
});

test('display progress follows course bends instead of connecting noisy GPS points', () => {
  const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }];
  const result = courseProgressPath(path, [[{ lat: 0.4, lng: 1.01 }]]);
  assert.deepEqual(result.slice(0, 2), path.slice(0, 2));
  assert.ok(Math.abs(result[2].lat - 0.4) < 1e-10);
  assert.equal(result[2].lng, 1);
});

test('display progress keeps furthest point across backward movement and pause segments', () => {
  const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
  const before = courseProgressPath(path, [[{ lat: 0.01, lng: 0.7 }]]);
  const after = courseProgressPath(path, [[{ lat: 0.01, lng: 0.7 }], [{ lat: -0.01, lng: 0.3 }]]);
  assert.deepEqual(after, before);
});

test('empty records and reset show no progress; endpoint projection covers whole course', () => {
  const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
  assert.deepEqual(courseProgressPath(path, []), []);
  assert.deepEqual(courseProgressPath(path, [[]]), []);
  assert.deepEqual(courseProgressPath(path, [[{ lat: 0, lng: -1 }]]), []);
  assert.deepEqual(courseProgressPath(path, [[{ lat: 0, lng: 2 }]]), path);
  assert.deepEqual(courseProgressPath([], [[{ lat: 0, lng: 0 }]]), []);
});

test('frozen source coordinates stay unchanged and display coordinates are independent copies', () => {
  const path = Object.freeze([Object.freeze({ lat: 0, lng: 0 }), Object.freeze({ lat: 0, lng: 1 })]);
  const point = Object.freeze({ lat: 0.01, lng: 0.6, accuracy: 10, timestamp: 123 });
  const segments = Object.freeze([Object.freeze([point])]);
  const result = courseProgressPath(path, segments);
  result[0].lat = 99;
  assert.equal(path[0].lat, 0);
  assert.deepEqual(point, { lat: 0.01, lng: 0.6, accuracy: 10, timestamp: 123 });
});

test('duplicate course vertices do not break projection', () => {
  const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
  const result = courseProgressPath(path, [[{ lat: 0, lng: 0.5 }]]);
  assert.deepEqual(result, [{ lat: 0, lng: 0 }, { lat: 0, lng: 0 }, { lat: 0, lng: 0.5 }]);
});
