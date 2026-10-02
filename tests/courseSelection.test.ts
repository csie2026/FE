import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHikingCourse, type CourseDetail, type MountainOption } from '../src/components/hiking/services/courseApi.ts';

const mountain: MountainOption = { id: 47, name: '북한산', city: '고양시', height: 835.6, lat: 37.66, lng: 126.98, courseCount: 1 };
const detail: CourseDetail = {
  course: { id: 10, mountainId: 47, name: '정상 코스', startName: '입구', startLat: 37.6, startLng: 126.9, lengthKm: 3, upMin: 60, downMin: 40, difficulty: 'NORMAL', risk: null, source: 'FOREST' },
  path: [[126.9, 37.6], [126.98, 37.66]],
};
test('selected course preserves DB identity and converts longitude-first paths for the map', () => {
  const selected = toHikingCourse(mountain, detail);
  assert.equal(selected.mountainId, '47');
  assert.equal(selected.courseId, '10');
  assert.deepEqual(selected.path[0], selected.startPoint);
  assert.deepEqual(selected.path[1], selected.summitPoint);
  assert.deepEqual(detail.path[0], [126.9, 37.6]);
});
test('selection rejects another mountain and unusable geometry', () => {
  assert.throws(() => toHikingCourse({ ...mountain, id: 3 }, detail));
  assert.throws(() => toHikingCourse(mountain, { ...detail, path: [] }));
  assert.throws(() => toHikingCourse(mountain, { ...detail, path: [[NaN, 37], [127, 38]] }));
  assert.throws(() => toHikingCourse(mountain, { ...detail, path: [[37, 127], [38, 127]] }));
});
