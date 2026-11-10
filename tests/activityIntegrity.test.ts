import { memberResponse } from './fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HikingActivityInput } from '../src/api.ts';
import { isValidActivityInput } from '../src/components/hiking/services/activityValidation.ts';
import {
  submitPendingActivity,
  ActivitySaveFailure,
} from '../src/components/hiking/services/activitySave.ts';
import {
  completeSession,
  initialSession,
} from '../src/components/hiking/services/sessionRecovery.ts';
import {
  hasReachedSummit,
  acceptTrackPoint,
  distanceMeters,
} from '../src/components/hiking/trackUtils.ts';
import { GPS_FILTER, SUMMIT_RADIUS_METERS } from '../src/components/hiking/config.ts';
import type { GpsPoint } from '../src/components/hiking/types.ts';
const now = Date.parse('2026-11-04T03:00:00Z');
const input: HikingActivityInput = Object.freeze({
  clientRequestId: '6c6d4570-7615-4124-a698-4eca1e634919',
  mountainId: 1,
  courseId: 2,
  startedAt: '2026-11-04T01:00:00.000Z',
  endedAt: '2026-11-04T02:00:00.000Z',
  distanceMeters: 123.456,
  elapsedMs: 3600000,
  completed: true,
  gpsSegments: [],
});

test('integrity guard rejects negative, nonfinite, missing and coerced distance values', () => {
  for (const distanceMeters of [-1, NaN, Infinity, -Infinity, null, undefined, '12'])
    assert.equal(isValidActivityInput({ ...input, distanceMeters }, now), false);
});
test('integrity guard rejects invalid active time, reversed or future instants and invalid calendar dates', () => {
  for (const elapsedMs of [-1, 0.5, Infinity, NaN, 3600001, Number.MAX_SAFE_INTEGER + 1, null, '1'])
    assert.equal(isValidActivityInput({ ...input, elapsedMs }, now), false);
  for (const dates of [
    { endedAt: '2026-11-04T00:59:59Z' },
    { endedAt: '2026-11-04T03:00:00.001Z' },
    { startedAt: '2026-02-30T00:00:00Z' },
    { startedAt: 'not a date' },
    { endedAt: null },
    { startedAt: 0 },
    { endedAt: '2026-11-04' },
  ])
    assert.equal(isValidActivityInput({ ...input, ...dates }, now), false);
});
test('integrity guard rejects malformed IDs, completion flags and request keys', () => {
  for (const change of [
    { mountainId: 0 },
    { mountainId: -1 },
    { mountainId: '1' },
    { mountainId: 1.5 },
    { mountainId: Number.MAX_SAFE_INTEGER + 1 },
    { courseId: 0 },
    { courseId: undefined },
    { completed: 'true' },
    { completed: 1 },
    { completed: null },
    { clientRequestId: '' },
    { clientRequestId: 'legacy' },
  ])
    assert.equal(isValidActivityInput({ ...input, ...change }, now), false);
  assert.equal(isValidActivityInput(null, now), false);
});
test('zero metrics, nullable course and paused time remain allowed without new hike eligibility policies', () => {
  assert.ok(
    isValidActivityInput(
      { ...input, courseId: null, distanceMeters: 0, elapsedMs: 0, endedAt: input.startedAt },
      now,
    ),
  );
  assert.ok(
    isValidActivityInput(
      { ...input, elapsedMs: 5, distanceMeters: 0.01, startedAt: '2026-11-04T01:00:00Z' },
      now,
    ),
  );
  // Well-formed data does not prove a physical hike or summit. This guard is not anti-cheat.
  assert.ok(
    isValidActivityInput({ ...input, distanceMeters: 0, elapsedMs: 0, completed: true }, now),
  );
});
test('invalid pending input is retained unchanged and never reaches even CSRF or member preflight', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const invalid = Object.freeze({ ...input, distanceMeters: -1 });
  const before = JSON.stringify(invalid);
  globalThis.fetch = async () => {
    calls++;
    throw new Error('unexpected fetch');
  };
  try {
    await assert.rejects(
      submitPendingActivity(invalid, 1),
      (err) => err instanceof ActivitySaveFailure && err.kind === 'rejected',
    );
    assert.equal(calls, 0);
    assert.equal(JSON.stringify(invalid), before);
    assert.equal(invalid.clientRequestId, input.clientRequestId);
  } finally {
    globalThis.fetch = original;
  }
});
test('raw accepted GPS reaches the frozen saved completion flag; display position never substitutes for evidence', async () => {
  assert.equal(GPS_FILTER.maxAccuracyMeters, 50);
  assert.equal(SUMMIT_RADIUS_METERS, 30);
  const original = globalThis.fetch;
  const posts: HikingActivityInput[] = [];
  const summit = { lat: 37.65, lng: 126.97 };
  const end = Date.now() - 1000;
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path === '/api/csrf') return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' });
    if (path === '/api/users/me') return Response.json(memberResponse(1));
    const body = JSON.parse(init?.body as string);
    posts.push(body);
    return Response.json({
      ...body,
      id: posts.length,
      mountainName: 'Test',
      hikingDate: '2026-11-04',
      journalId: null,
    });
  };
  try {
    for (const meters of [29, 33]) {
      const lat = summit.lat + ((meters / 6371000) * 180) / Math.PI;
      const raw: GpsPoint = {
        lat,
        lng: summit.lng,
        latitude: lat,
        longitude: summit.lng,
        timestamp: end,
        accuracy: 50,
        altitude: null,
        speed: null,
      };
      assert.ok(acceptTrackPoint(raw));
      assert.ok(Math.abs(distanceMeters(raw, summit) - meters) < 0.01);
      const session = {
        ...initialSession(),
        state: 'TRACKING' as const,
        startedAt: end - 1000,
        activeSince: end - 1000,
        clientRequestId: input.clientRequestId,
        segments: [[raw]],
        reachedSummit: hasReachedSummit(raw, summit),
      };
      const frozen = completeSession(
        session,
        { mountainId: '1', courseId: '2' },
        end,
      ).pendingInput!;
      const saved = await submitPendingActivity(frozen, 1);
      assert.equal(saved.completed, meters <= 30);
      assert.equal(posts.at(-1)?.completed, meters <= 30);
      assert.equal(posts.at(-1)?.clientRequestId, input.clientRequestId);
      assert.equal(frozen.distanceMeters, 0); // A single accepted point adds no distance.
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('GPS structure, ordering and independent point and UTF-8 byte limits follow BE', () => {
  const p = { lat: 37, lng: 127, measuredAt: input.startedAt, accuracyMeters: 51 };
  assert.ok(isValidActivityInput({ ...input, gpsSegments: [] }, now));
  assert.ok(isValidActivityInput({ ...input, gpsSegments: [Array(10000).fill(p)] }, now));
  for (const gpsSegments of [
    undefined,
    null,
    {},
    [null],
    [[null]],
    [[{ ...p, lat: 91 }]],
    [[{ ...p, accuracyMeters: -1 }]],
    [[{ ...p, measuredAt: 'bad' }]],
    [[{ ...p, measuredAt: input.endedAt }], [p]],
    [Array(10001).fill(p)],
    Array(10001).fill([]),
  ])
    assert.equal(isValidActivityInput({ ...input, gpsSegments }, now), false);
  const body = { ...input, gpsSegments: [], extra: '' };
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length;
  body.extra = 'a'.repeat(2 * 1024 * 1024 - bytes);
  assert.ok(isValidActivityInput(body, now));
  body.extra += '?';
  assert.equal(isValidActivityInput(body, now), false);
  assert.ok(isValidActivityInput({ ...input, gpsSegments: undefined }, now, true));
});
