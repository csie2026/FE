import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadHikingSelection,
  readHikingSelection,
} from '../src/components/hiking/services/hikingNavigation.ts';
import type { CourseDetail, MountainOption } from '../src/components/hiking/services/courseApi.ts';

const mountain: MountainOption = {
  id: 47,
  name: '북한산',
  city: '고양시',
  height: 835.6,
  lat: 37.66,
  lng: 126.98,
  courseCount: 1,
};
const detail: CourseDetail = {
  course: {
    id: 10,
    mountainId: 47,
    name: '정상 코스',
    startName: '입구',
    startLat: 37.6,
    startLng: 126.9,
    lengthKm: 3,
    upMin: 60,
    downMin: 40,
    difficulty: 'NORMAL',
    risk: null,
    source: 'FOREST',
  },
  path: [
    [126.9, 37.6],
    [126.98, 37.66],
  ],
};

test('navigation history accepts positive DB IDs and drops malformed or legacy values', () => {
  assert.deepEqual(readHikingSelection({ mountainId: 47, courseId: 10 }), {
    mountainId: 47,
    courseId: 10,
  });
  for (const value of [
    null,
    undefined,
    [],
    {},
    '47:10',
    { mountainId: '47', courseId: 10 },
    { mountainId: -1, courseId: 10 },
    { mountainId: 47, courseId: 0 },
    { mountainId: 1.5, courseId: 10 },
    { mountainId: Infinity, courseId: 10 },
  ]) {
    assert.equal(readHikingSelection(value), null);
  }
});

test('linked hiking selection refetches DB records and preserves the exact selected IDs', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  const paths: string[] = [];
  globalThis.fetch = async (path, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init.signal.aborted, false);
    assert.equal(init?.credentials, 'include');
    paths.push(String(path));
    return new Response(JSON.stringify(String(path) === '/api/mountains' ? [mountain] : detail), {
      status: 200,
    });
  };
  try {
    const course = await loadHikingSelection({ mountainId: 47, courseId: 10 }, controller.signal);
    assert.deepEqual(paths.sort(), ['/api/courses/10', '/api/mountains']);
    assert.equal(course.mountainId, '47');
    assert.equal(course.courseId, '10');
    assert.equal(course.courseName, detail.course.name);
    assert.deepEqual(course.path[1], { lat: 37.66, lng: 126.98 });
    const pendingSignals: AbortSignal[] = [];
    globalThis.fetch = async (_path, init) => {
      assert.equal(init?.credentials, 'include');
      pendingSignals.push(init!.signal!);
      return new Promise(() => {});
    };
    const pending = loadHikingSelection({ mountainId: 47, courseId: 10 }, controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(pendingSignals.length, 2);
    assert.ok(pendingSignals.every(signal => signal.aborted));
  } finally {
    globalThis.fetch = original;
  }
});

test('missing mountain, wrong course, cross-mountain course and unusable coordinates are rejected', async () => {
  const original = globalThis.fetch;
  try {
    for (const [list, candidate] of [
      [[], detail],
      [[mountain], { ...detail, course: { ...detail.course, id: 11 } }],
      [[mountain], { ...detail, course: { ...detail.course, mountainId: 99 } }],
      [[{ ...mountain, lat: 100 }], detail],
      [[mountain], { ...detail, path: [] }],
    ]) {
      globalThis.fetch = async (path) =>
        new Response(JSON.stringify(String(path) === '/api/mountains' ? list : candidate), {
          status: 200,
        });
      await assert.rejects(loadHikingSelection({ mountainId: 47, courseId: 10 }));
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('invalid IDs never request an API and server failures retain their status', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response('{}', { status: 404 });
  };
  try {
    await assert.rejects(loadHikingSelection({ mountainId: 0, courseId: 10 }));
    assert.equal(called, false);
    for (const status of [401, 404, 500]) {
      globalThis.fetch = async () => new Response('{"message":"조회 실패"}', { status });
      await assert.rejects(
        loadHikingSelection({ mountainId: 47, courseId: 10 }),
        (error: { status: number }) => error.status === status,
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
