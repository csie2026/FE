import { memberResponse } from './fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialSession,
  pauseSession,
  completeSession,
  draftFromSession,
  sessionFromDraft,
  readRecovery,
  writeRecovery,
  recoveryKey,
  MAX_RECOVERY_BYTES,
  type Session,
} from '../src/components/hiking/services/sessionRecovery.ts';
import {
  assertTrackingCapacity,
  RecoveryCapacityError,
  recordTrackPoint,
  resumeSession,
} from '../src/components/hiking/services/sessionTracking.ts';
import {
  isValidActivityInput,
  jsonBytes,
} from '../src/components/hiking/services/activityValidation.ts';
import {
  submitPendingActivity,
  ActivitySaveFailure,
} from '../src/components/hiking/services/activitySave.ts';
import type { GpsPoint, HikingCourse } from '../src/components/hiking/types.ts';

const course: HikingCourse = {
  mountainId: '1',
  courseId: '2',
  mountainName: 'Test',
  courseName: 'Test',
  startPoint: { lat: 37, lng: 127 },
  summitPoint: { lat: 37.01, lng: 127 },
  path: [],
};
class Store {
  data = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, text: string) {
    if (this.failWrites) throw new Error('quota');
    this.data.set(key, text);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  get length() {
    return this.data.size;
  }
}
function running(count: number, now: number, rich = false): Session {
  const lat = rich ? 37.12345678912345 : 37;
  const lng = rich ? 127.12345678912345 : 127;
  const point: GpsPoint = {
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    accuracy: rich ? 49.12345678912345 : 5,
    timestamp: now - 5000,
    altitude: rich ? Number.MAX_VALUE : null,
    speed: rich ? Number.MAX_VALUE : null,
  };
  return {
    ...initialSession(),
    state: 'TRACKING',
    startedAt: now - 60000,
    activeSince: now - 10000,
    accumulatedMs: 1000,
    clientRequestId: crypto.randomUUID(),
    segments: [Array.from({ length: count }, () => ({ ...point }))],
  };
}
function nextPoint(session: Session, now: number): GpsPoint {
  const p = session.segments.at(-1)!.at(-1)!;
  return { ...p, lat: p.lat + 0.0001, latitude: p.lat + 0.0001, timestamp: now - 2000 };
}
function setup(session: Session, now: number) {
  const store = new Store(),
    owner = crypto.randomUUID();
  let last = session;
  const persist = (next: Session, mode: 'create' | 'update' = 'update') => {
    assertTrackingCapacity(next, course, 1, owner, now);
    const draft = draftFromSession(next, course, 1, owner, now);
    writeRecovery(draft, mode, store);
    last = sessionFromDraft(draft);
  };
  persist(session, 'create');
  return { store, owner, persist, last: () => last };
}

test('9999 to 10000 commits the last sample then stops; further collection and resume are blocked', () => {
  const now = Date.now(),
    current = running(9999, now),
    h = setup(current, now);
  const result = recordTrackPoint(
    current,
    nextPoint(current, now),
    course,
    h.persist,
    h.last(),
    now,
  );
  assert.equal(result.error, undefined);
  assert.equal(result.session.state, 'PAUSED');
  assert.equal(result.session.activeSince, null);
  assert.equal(result.session.trackingStopReason, 'point-limit');
  assert.equal(result.session.segments[0].length, 10000);
  assert.equal(result.session.clientRequestId, current.clientRequestId);
  let writes = 0;
  assert.equal(
    recordTrackPoint(
      result.session,
      nextPoint(current, now),
      course,
      () => {
        writes++;
      },
      h.last(),
      now,
    ).session,
    result.session,
  );
  assert.equal(writes, 0);
  assert.equal(resumeSession(result.session, now + 1000), result.session);
  const loaded = readRecovery(1, now, h.store);
  assert.equal(loaded.kind, 'ready');
  if (loaded.kind !== 'ready') return;
  assert.deepEqual(sessionFromDraft(loaded.draft), h.last());
  assert.equal(sessionFromDraft(loaded.draft).trackingStopReason, 'point-limit');
});

test('a tracking session already at 10000 never appends the next sample and can end with a valid BE body', () => {
  const now = Date.now(),
    current = running(10000, now),
    h = setup(current, now);
  const result = recordTrackPoint(
    current,
    nextPoint(current, now),
    course,
    h.persist,
    h.last(),
    now,
  );
  assert.deepEqual(result.session.segments, current.segments);
  const ended = completeSession(result.session, course, now);
  h.persist(ended);
  assert.equal(ended.state, 'COMPLETED');
  assert.equal(isValidActivityInput(ended.pendingInput, now), true);
  assert.equal(ended.pendingInput!.gpsSegments![0].length, 10000);
  assert.deepEqual(
    sessionFromDraft(draftFromSession(ended, course, 1, h.owner, now)).pendingInput,
    ended.pendingInput,
  );
});

test('byte capacity stops collection below 10000 while reserving a durable completion summary', () => {
  const now = Date.now(),
    owner = crypto.randomUUID();
  let low = 1,
    high = 9999;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    try {
      assertTrackingCapacity(running(mid, now, true), course, 1, owner, now);
      low = mid;
    } catch (error) {
      assert.ok(error instanceof RecoveryCapacityError);
      high = mid - 1;
    }
  }
  assert.ok(low < 9999);
  const current = running(low, now, true),
    h = setup(current, now);
  const result = recordTrackPoint(
    current,
    nextPoint(current, now),
    course,
    h.persist,
    h.last(),
    now,
  );
  assert.equal(result.session.trackingStopReason, 'capacity-limit');
  assert.equal(result.session.state, 'PAUSED');
  assert.deepEqual(result.session.segments, h.last().segments);
  assert.deepEqual(result.session.segments, current.segments);
  assert.equal(result.session.accumulatedMs, h.last().accumulatedMs);
  const ended = completeSession(result.session, course, now + 60000);
  const finalDraft = draftFromSession(ended, course, 1, h.owner, now + 60000);
  assert.ok(jsonBytes(finalDraft) <= MAX_RECOVERY_BYTES);
  // writeRecovery는 실제 현재 시각을 사용하므로 종료 시각을 현재로 지정해 동일한 GPS 증거를 저장한다.
  h.persist(completeSession(result.session, course, now));
  const loaded = readRecovery(1, now, h.store);
  assert.equal(loaded.kind, 'ready');
  if (loaded.kind !== 'ready') return;
  assert.equal(isValidActivityInput(sessionFromDraft(loaded.draft).pendingInput, now), true);
});

test('quota failure keeps exact last checkpoint evidence, summit flag and elapsed time; retry can end', () => {
  const now = Date.now(),
    current = running(2, now),
    h = setup(current, now);
  const before = h.store.getItem(recoveryKey(1));
  const last = h.last();
  h.store.failWrites = true;
  const result = recordTrackPoint(
    current,
    nextPoint(current, now),
    course,
    h.persist,
    last,
    now + 1000,
  );
  assert.equal(result.session.state, 'PAUSED');
  assert.equal(result.session.trackingStopReason, 'storage-error');
  assert.ok(result.error);
  assert.deepEqual(result.session.segments, last.segments);
  assert.equal(result.session.accumulatedMs, last.accumulatedMs);
  assert.equal(result.session.reachedSummit, last.reachedSummit);
  assert.equal(result.session.clientRequestId, last.clientRequestId);
  assert.equal(h.store.getItem(recoveryKey(1)), before);
  const loaded = readRecovery(1, now, h.store);
  assert.equal(loaded.kind, 'ready');
  if (loaded.kind !== 'ready') return;
  assert.deepEqual(sessionFromDraft(loaded.draft).segments, result.session.segments);
  assert.equal(sessionFromDraft(loaded.draft).accumulatedMs, result.session.accumulatedMs);
  h.store.failWrites = false;
  h.persist(completeSession(result.session, course, now));
  assert.equal(h.last().state, 'COMPLETED');
});

test('ordinary pause, resume, gap boundaries and completion retain existing filters and timing', () => {
  const now = Date.now(),
    current = running(2, now),
    h = setup(current, now);
  const normal = recordTrackPoint(
    current,
    nextPoint(current, now),
    course,
    h.persist,
    h.last(),
    now,
  ).session;
  assert.equal(normal.state, 'TRACKING');
  assert.equal(normal.segments[0].length, 3);
  const paused = pauseSession(normal, now);
  assert.equal(paused.accumulatedMs, 11000);
  const resumed = resumeSession(paused, now + 1000);
  assert.equal(resumed.state, 'TRACKING');
  assert.deepEqual(
    resumed.segments.map((s) => s.length),
    [3, 0],
  );
  const ended = completeSession(resumed, course, now + 2000);
  assert.equal(ended.accumulatedMs, 12000);
  assert.equal(ended.trackingStopReason, undefined);
  const filtered = recordTrackPoint(
    current,
    { ...nextPoint(current, now), accuracy: 51 },
    course,
    () => assert.fail('invalid sample persisted'),
    h.last(),
    now,
  );
  assert.equal(filtered.session, current);
});

test('after limit stop, failed server save and serialized reload retry use identical UUID and GPS', async () => {
  const now = Date.now(),
    current = running(9999, now),
    h = setup(current, now);
  const stopped = recordTrackPoint(
    current,
    nextPoint(current, now),
    course,
    h.persist,
    h.last(),
    now,
  ).session;
  const ended = completeSession(stopped, course, now);
  h.persist(ended);
  const bodies: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/api/csrf')
      return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' });
    if (String(url) === '/api/users/me') return Response.json(memberResponse(1));
    bodies.push(init!.body as string);
    if (bodies.length === 1) throw new TypeError('response lost');
    return Response.json({
      ...ended.pendingInput,
      id: 1,
      mountainName: 'Test',
      hikingDate: new Date(now).toISOString().slice(0, 10),
      journalId: null,
      completed: false,
    });
  };
  try {
    await assert.rejects(
      submitPendingActivity(ended.pendingInput!, 1),
      (error) => error instanceof ActivitySaveFailure && error.kind === 'uncertain',
    );
    const loaded = readRecovery(1, now, h.store);
    assert.equal(loaded.kind, 'ready');
    if (loaded.kind !== 'ready') return;
    const restored = sessionFromDraft(loaded.draft);
    assert.equal((await submitPendingActivity(restored.pendingInput!, 1)).id, 1);
    assert.equal(bodies[0], bodies[1]);
    assert.equal(restored.clientRequestId, current.clientRequestId);
  } finally {
    globalThis.fetch = original;
  }
});
