import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkedNativeStatus,
  mergeNativePage,
  nativeCheckpoint,
  sessionWithNativeStatus,
  synchronizeNativeSession,
  updateNativeSession,
  stopNativeForDiscard,
  nativePoint,
  latestNativeDisplayPosition,
} from '../src/components/hiking/services/nativeTracking.ts';
import {
  initialSession,
  draftFromSession,
  sessionFromDraft,
  writeRecovery,
  readRecovery,
  completeSession,
  validateDraft,
  type Session,
} from '../src/components/hiking/services/sessionRecovery.ts';
import {
  RecoveryCapacityError,
  recordTrackPoint,
} from '../src/components/hiking/services/sessionTracking.ts';
import {
  acceptTrackPoint,
  distanceMeters,
  isUsablePoint,
  trackDistance,
} from '../src/components/hiking/trackUtils.ts';
import {
  gpsReception,
  gpsReceptionWarning,
} from '../src/components/hiking/services/gpsReception.ts';
import type { HikingCourse } from '../src/components/hiking/types.ts';
import type {
  BackgroundLocationPlugin,
  NativeLocationPoint,
  NativeLocationStatus,
} from '../src/native/backgroundLocation.ts';

const course: HikingCourse = {
  mountainId: '1',
  courseId: '2',
  mountainName: 'Test',
  courseName: 'Test',
  startPoint: { lat: 37, lng: 127 },
  summitPoint: { lat: 37.0001, lng: 127 },
  path: [],
};
const base = Date.now() - 120_000;
const owner = crypto.randomUUID();
function session(): Session {
  return {
    ...initialSession(),
    startedAt: base,
    state: 'PAUSED',
    clientRequestId: crypto.randomUUID(),
    segments: [[]],
    native: nativeCheckpoint(),
  };
}
function point(sequence: number, options: Partial<NativeLocationPoint> = {}): NativeLocationPoint {
  return {
    sequence,
    segment: 0,
    latitude: 37 + sequence * 0.0001,
    longitude: 127,
    timestamp: base + sequence * 10_000,
    accuracy: 5,
    altitude: null,
    speed: null,
    ...options,
  };
}
function status(
  current: Session,
  options: Partial<NonNullable<NativeLocationStatus['session']>> = {},
): NativeLocationStatus {
  return {
    authorization: 'whenInUse',
    servicesEnabled: true,
    precise: true,
    session: {
      userId: 7,
      clientRequestId: current.clientRequestId!,
      state: 'recording',
      startedAt: base + 1000,
      activeSince: base + 1000,
      accumulatedMs: 0,
      segment: 0,
      stoppedAt: null,
      lastRecordedAt: null,
      pointCount: 0,
      lastSequence: 0,
      errorCode: null,
      ...options,
    },
  };
}
function page(points: NativeLocationPoint[]) {
  return { points, nextSequence: points.at(-1)?.sequence ?? 0, hasMore: false };
}
class StorageMock implements Storage {
  data = new Map<string, string>();
  fail = false;
  get length() {
    return this.data.size;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw new Error('quota');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
}
function harness(initial: Session, rows: NativeLocationPoint[] = []) {
  let current = initial;
  let native = status(initial, {
    pointCount: rows.length,
    lastSequence: rows.at(-1)?.sequence ?? 0,
    lastRecordedAt: rows.at(-1)?.timestamp ?? null,
  });
  const events: string[] = [];
  const store = new StorageMock();
  writeRecovery(draftFromSession(initial, course, 7, owner), 'create', store);
  const commit = (next: Session) => {
    writeRecovery(draftFromSession(next, course, 7, owner), 'update', store);
    events.push(next.pendingInput ? 'commit-completed' : `commit-${next.native?.cursor}`);
    current = next;
  };
  const client: BackgroundLocationPlugin = {
    requestPermissions: async () => ({
      authorization: 'whenInUse',
      servicesEnabled: true,
      precise: true,
    }),
    getStatus: async () => {
      events.push('status');
      return native;
    },
    start: async () => {
      events.push('start');
      return native;
    },
    pause: async () => {
      events.push('pause');
      native = status(initial, {
        ...native.session!,
        state: 'paused',
        activeSince: null,
        accumulatedMs: 60_000,
      });
      return native;
    },
    resume: async () => {
      events.push('resume');
      native = status(initial, {
        ...native.session!,
        state: 'recording',
        activeSince: Date.now(),
        accumulatedMs: 60_000,
        segment: native.session!.segment + 1,
      });
      return native;
    },
    stop: async () => {
      events.push('stop');
      native = status(initial, {
        ...native.session!,
        state: 'stopped',
        activeSince: null,
        accumulatedMs: 60_000,
        stoppedAt: Date.now(),
      });
      return native;
    },
    readPoints: async (options) => {
      events.push(`read-${options.afterSequence}`);
      const remaining = rows.filter((p) => p.sequence > (options.afterSequence ?? 0));
      const points = remaining.slice(0, 2);
      return {
        ...page(points),
        nextSequence: points.at(-1)?.sequence ?? options.afterSequence ?? 0,
        hasMore: remaining.length > 2,
      };
    },
  };
  return {
    client,
    commit,
    current: () => current,
    store,
    events,
    setStatus: (value: NativeLocationStatus) => {
      native = value;
    },
  };
}

test('historical native positions bypass freshness only; browser rejects the same old position', () => {
  const initial = session();
  const merged = mergeNativePage(initial, page([point(1), point(2)]), course);
  assert.equal(merged.segments.flat().length, 2);
  assert.equal(merged.reachedSummit, true);
  assert.ok(trackDistance(merged.segments) > 5);
  const oldPoint = merged.segments.flat()[0];
  assert.equal(acceptTrackPoint(oldPoint), false);
  assert.equal(
    recordTrackPoint(
      { ...initial, state: 'TRACKING', activeSince: base },
      oldPoint,
      course,
      () => assert.fail('stale web sample persisted'),
      initial,
    ).session.segments.flat().length,
    0,
  );
});

test('sequence consumption rejects stale insertions, reversed/equal measurement times and invalid samples', () => {
  const first = mergeNativePage(session(), page([point(1), point(2)]), course);
  const next = mergeNativePage(
    first,
    page([
      point(3, { timestamp: point(1).timestamp }), // 늦게 삽입된 좌표를 과거 경로에 끼워 넣지 않는다.
      point(4, { timestamp: point(2).timestamp }),
      point(5, { accuracy: 51, timestamp: base + 25_000 }),
      point(6, { latitude: 38, timestamp: base + 30_000 }), // 같은 구간에서 허용할 수 없는 속도로 이동한 표본
      point(7, { latitude: 37.0003, timestamp: base + 40_000 }),
    ]),
    course,
  );
  assert.deepEqual(
    next.segments.flat().map((p) => p.timestamp),
    [point(1).timestamp, point(2).timestamp, base + 40_000],
  );
  assert.equal(next.native!.cursor, 7);
  assert.equal(first.native!.cursor, 2);
  assert.throws(() => mergeNativePage(next, page([point(7)]), course), /sequence/);
});

test('native pause segments and long gaps never add connecting distance', () => {
  const merged = mergeNativePage(
    session(),
    page([
      point(1),
      point(2),
      point(3, { segment: 1, latitude: 38 }),
      point(4, { segment: 1, latitude: 38.0001 }),
    ]),
    course,
  );
  assert.equal(merged.segments.length, 2);
  assert.ok(trackDistance(merged.segments) < 30);
});

test('invalid bridge identity, state, clock, cursor and pagination fail without altering the input', () => {
  const initial = session();
  for (const bad of [
    { userId: 8 },
    { clientRequestId: crypto.randomUUID() },
    { activeSince: null },
    { accumulatedMs: Infinity },
    { lastSequence: -1 },
    { startedAt: base - 1 },
  ])
    assert.throws(() => checkedNativeStatus(status(initial, bad), initial, 7));
  assert.throws(() => mergeNativePage(initial, { ...page([point(1)]), nextSequence: 2 }, course));
  assert.throws(() => mergeNativePage(initial, page([point(2), point(1)]), course));
  assert.equal(initial.native!.cursor, 0);
  assert.equal(initial.segments.flat().length, 0);
});

test('failed local persistence never advances the durable sequence; reload safely replays all rows', async () => {
  const initial = session();
  const h = harness(initial, [point(1), point(2), point(3)]);
  h.store.fail = true;
  await assert.rejects(synchronizeNativeSession(initial, 7, course, owner, h.commit, h.client));
  const recovery = readRecovery(7, Date.now(), h.store);
  assert.equal(recovery.kind, 'ready');
  if (recovery.kind !== 'ready') return;
  assert.equal(recovery.draft.native!.cursor, 0);
  assert.equal(h.current(), initial);
  h.store.fail = false;
  const restored = sessionFromDraft(recovery.draft);
  await synchronizeNativeSession(restored, 7, course, owner, h.commit, h.client);
  assert.equal(h.current().native!.cursor, 3);
  assert.equal(h.current().segments.flat().length, 3);
  await synchronizeNativeSession(h.current(), 7, course, owner, h.commit, h.client);
  assert.equal(h.current().segments.flat().length, 3);
});

test('ownership transfer during an awaited read prevents stale commits and retains the claimed draft', async () => {
  const initial = session();
  const h = harness(initial, [point(1)]);
  const read = h.client.readPoints;
  const newOwner = crypto.randomUUID();
  h.client.readPoints = async (options) => {
    const draft = draftFromSession(initial, course, 7, newOwner);
    writeRecovery(draft, 'claim', h.store);
    return read(options);
  };
  await assert.rejects(
    synchronizeNativeSession(initial, 7, course, owner, h.commit, h.client),
    /다른 창/,
  );
  const recovery = readRecovery(7, Date.now(), h.store);
  assert.equal(recovery.kind, 'ready');
  if (recovery.kind === 'ready') {
    assert.equal(recovery.draft.ownerToken, newOwner);
    assert.equal(recovery.draft.native!.cursor, 0);
  }
});

test('start cannot publish TRACKING before native acknowledgment and failure leaves the draft paused', async () => {
  const initial = session();
  const h = harness(initial);
  h.setStatus({ authorization: 'whenInUse', servicesEnabled: true, precise: true, session: null });
  let acknowledge!: () => void;
  h.client.start = async () => {
    await new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    const running = status(initial);
    h.setStatus(running);
    return running;
  };
  const pending = updateNativeSession('start', initial, 7, course, owner, h.commit, h.client);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.current().state, 'PAUSED');
  assert.equal(
    h.events.some((e) => e.startsWith('commit')),
    false,
  );
  acknowledge();
  await pending;
  assert.equal(h.current().state, 'TRACKING');
  const denied = harness(initial);
  denied.client.start = async () => {
    throw { code: 'PERMISSION_DENIED' };
  };
  await assert.rejects(
    updateNativeSession('start', initial, 7, course, owner, denied.commit, denied.client),
  );
  assert.equal(denied.current().state, 'PAUSED');
});

test('explicit pause/resume keep the UUID and use native active time, not time spent paused', async () => {
  const initial = session();
  const h = harness(initial, [point(1)]);
  await updateNativeSession('pause', initial, 7, course, owner, h.commit, h.client);
  assert.equal(h.current().state, 'PAUSED');
  assert.equal(h.current().accumulatedMs, 60_000);
  await updateNativeSession('resume', h.current(), 7, course, owner, h.commit, h.client);
  assert.equal(h.current().state, 'TRACKING');
  assert.equal(h.current().accumulatedMs, 60_000);
  assert.equal(h.current().clientRequestId, initial.clientRequestId);
  const interrupted = sessionWithNativeStatus(
    h.current(),
    status(initial, {
      state: 'interrupted',
      activeSince: null,
      accumulatedMs: 20_000,
      errorCode: 'SERVICE_INTERRUPTED',
      lastSequence: 1,
      pointCount: 1,
      lastRecordedAt: point(1).timestamp,
    }),
    7,
  );
  assert.equal(interrupted.state, 'PAUSED');
  assert.equal(interrupted.accumulatedMs, 20_000);
});

test('completion stops before reading all pages and freezing the exact final request', async () => {
  const initial = session();
  const h = harness(initial, [point(1), point(2), point(3)]);
  await updateNativeSession('complete', initial, 7, course, owner, h.commit, h.client);
  const completed = h.current();
  assert.equal(h.events[0], 'stop');
  assert.ok(h.events.indexOf('read-2') < h.events.indexOf('commit-completed'));
  assert.equal(completed.state, 'COMPLETED');
  assert.equal(completed.native!.cursor, 3);
  assert.equal(completed.pendingInput!.gpsSegments!.flat().length, 3);
  const frozen = JSON.stringify(completed.pendingInput);
  const restored = sessionFromDraft(draftFromSession(completed, course, 7, owner));
  await updateNativeSession(
    'complete',
    restored,
    7,
    course,
    owner,
    () => assert.fail('must not rewrite'),
    h.client,
  );
  assert.equal(JSON.stringify(restored.pendingInput), frozen);
  assert.equal(restored.clientRequestId, initial.clientRequestId);
});

test('stop/read/final persistence failures cannot create a durable pendingInput', async () => {
  for (const step of ['stop', 'read', 'final-write']) {
    const initial = session();
    const h = harness(initial, [point(1)]);
    if (step === 'stop')
      h.client.stop = async () => {
        throw new Error('stop failed');
      };
    if (step === 'read')
      h.client.readPoints = async () => {
        throw new Error('read failed');
      };
    await assert.rejects(
      updateNativeSession(
        'complete',
        initial,
        7,
        course,
        owner,
        (next) => {
          if (step === 'final-write' && next.pendingInput) throw new Error('quota');
          h.commit(next);
        },
        h.client,
      ),
    );
    const recovery = readRecovery(7, Date.now(), h.store);
    assert.equal(recovery.kind, 'ready');
    if (recovery.kind === 'ready') assert.equal(recovery.draft.pendingInput, null);
  }
});

test('byte capacity rejection is durable and consumes the row without inventing route evidence', () => {
  const initial = session();
  const next = mergeNativePage(initial, page([point(1), point(2)]), course, Date.now(), () => {
    throw new RecoveryCapacityError('budget');
  });
  assert.equal(next.native!.cursor, 2);
  assert.equal(next.trackingStopReason, 'capacity-limit');
  assert.equal(next.segments.flat().length, 0);
  assert.equal(next.reachedSummit, false);
});

test('legacy web drafts remain unchanged and native metadata is validated on recovery', () => {
  const initial = session();
  const web = { ...initial, native: undefined };
  const draft = draftFromSession(web, course, 7, owner);
  assert.equal('native' in draft, false);
  assert.equal(validateDraft(draft, 7), true);
  const native = draftFromSession(initial, course, 7, owner);
  assert.equal(validateDraft({ ...native, native: { ...native.native!, cursor: -1 } }, 7), false);
  assert.equal(
    validateDraft({ ...native, native: { ...native.native!, lastTimestamp: Infinity } }, 7),
    false,
  );
  const ended = completeSession(web, course);
  assert.equal('native' in ended.pendingInput!, false);
});

test('a partially committed backlog resumes after its durable page and never duplicates accepted points', async () => {
  const initial = session();
  const h = harness(initial, [point(1), point(2), point(3)]);
  let fail = true;
  await assert.rejects(
    synchronizeNativeSession(
      initial,
      7,
      course,
      owner,
      (next) => {
        if (next.native!.cursor === 3 && fail) throw new Error('quota on second page');
        h.commit(next);
      },
      h.client,
    ),
  );
  assert.equal(h.current().native!.cursor, 2);
  fail = false;
  await synchronizeNativeSession(h.current(), 7, course, owner, h.commit, h.client);
  assert.equal(h.current().segments.flat().length, 3);
  assert.equal(h.current().native!.cursor, 3);
});

test('permission loss while a page is awaited is rechecked before publishing the final state', async () => {
  const initial = session();
  const h = harness(initial, [point(1)]);
  const read = h.client.readPoints;
  h.client.readPoints = async (options) => {
    h.setStatus(
      status(initial, {
        state: 'error',
        activeSince: null,
        accumulatedMs: 60_000,
        errorCode: 'PERMISSION_DENIED',
        lastSequence: 1,
        pointCount: 1,
        lastRecordedAt: point(1).timestamp,
      }),
    );
    return read(options);
  };
  const result = await synchronizeNativeSession(initial, 7, course, owner, h.commit, h.client);
  assert.equal(result.session.state, 'PAUSED');
  assert.equal(result.status.session!.errorCode, 'PERMISSION_DENIED');
  assert.equal(result.session.native!.cursor, 1);
});

test('ownership lost during permission/status awaits prevents native start, not just the later local write', async () => {
  const initial = session();
  const h = harness(initial);
  let owned = true;
  let starts = 0;
  h.client.getStatus = async () => {
    owned = false;
    return { authorization: 'whenInUse', servicesEnabled: true, precise: true, session: null };
  };
  h.client.start = async () => {
    starts++;
    return status(initial);
  };
  await assert.rejects(
    updateNativeSession('start', initial, 7, course, owner, h.commit, h.client, () => {
      if (!owned) throw new Error('ownership changed');
    }),
    /ownership changed/,
  );
  assert.equal(starts, 0);
  assert.equal(h.current().state, 'PAUSED');
});

test('a bounded sequence snapshot does not consume newly arriving rows until the next sync', async () => {
  const initial = session();
  const h = harness(initial, [point(1), point(2)]);
  h.setStatus(
    status(initial, { pointCount: 1, lastSequence: 1, lastRecordedAt: point(1).timestamp }),
  );
  await synchronizeNativeSession(initial, 7, course, owner, h.commit, h.client);
  assert.equal(h.current().native!.cursor, 1);
  h.setStatus(
    status(initial, { pointCount: 2, lastSequence: 2, lastRecordedAt: point(2).timestamp }),
  );
  await synchronizeNativeSession(h.current(), 7, course, owner, h.commit, h.client);
  assert.equal(h.current().native!.cursor, 2);
  assert.equal(h.current().segments.flat().length, 2);
});

test('the 10000-point boundary pauses native collection and durably rejects the remaining sequence rows', async () => {
  const initial = session();
  const old = {
    lat: 37,
    lng: 127,
    latitude: 37,
    longitude: 127,
    timestamp: base + 10_000,
    accuracy: 5,
    altitude: null,
    speed: null,
  };
  initial.segments = [Array.from({ length: 9999 }, () => ({ ...old }))];
  initial.native = {
    ...nativeCheckpoint(),
    cursor: 9999,
    lastTimestamp: old.timestamp,
    segment: 0,
  };
  const rows = [
    point(10000, { timestamp: base + 20_000, latitude: 37.0001 }),
    point(10001, { timestamp: base + 30_000, latitude: 37.0002 }),
    point(10002, { timestamp: base + 40_000, latitude: 37.0003 }),
  ];
  const h = harness(initial, rows);
  await synchronizeNativeSession(initial, 7, course, owner, h.commit, h.client);
  assert.equal(h.current().state, 'PAUSED');
  assert.equal(h.current().trackingStopReason, 'point-limit');
  assert.equal(h.current().native!.cursor, 10002);
  assert.equal(h.current().segments.flat().length, 10000);
  assert.ok(h.events.includes('pause'));
  await updateNativeSession('complete', h.current(), 7, course, owner, h.commit, h.client);
  assert.equal(h.current().state, 'COMPLETED');
  assert.equal(h.current().pendingInput!.gpsSegments!.flat().length, 10000);
});

test('discard requires a stopped native identity and rechecks ownership before allowing web deletion', async () => {
  const initial = session();
  const draft = draftFromSession(initial, course, 7, owner);
  const h = harness(initial);
  let current = draft;
  const stop = h.client.stop;
  h.client.stop = async (key) => {
    const reply = await stop(key);
    current = { ...draft, ownerToken: crypto.randomUUID() };
    return reply;
  };
  await assert.rejects(
    stopNativeForDiscard(draft, 7, () => current, h.client),
    /소유권/,
  );
  h.events.length = 0;
  await assert.rejects(
    stopNativeForDiscard(draft, 7, () => current, h.client),
    /소유권/,
  );
  assert.equal(h.events.includes('stop'), false); // 소유권을 잃은 호출자는 중지 요청도 보내지 못한다.
  current = draft;
  h.client.stop = async () => status(initial);
  await assert.rejects(
    stopNativeForDiscard(draft, 7, () => current, h.client),
    /종료/,
  );
  h.client.stop = stop;
  await stopNativeForDiscard(draft, 7, () => current, h.client);
  const stillStored = readRecovery(7, Date.now(), h.store);
  assert.equal(stillStored.kind, 'ready'); // 이 함수는 네이티브 원본과 웹 임시 기록을 모두 삭제하지 않는다.
});

test('an inconsistent final sequence after stop never freezes a completion request', async () => {
  const initial = session();
  const h = harness(initial, [point(1)]);
  const getStatus = h.client.getStatus;
  let reads = 0;
  h.client.getStatus = async (key) => {
    const reply = await getStatus(key);
    reads++;
    return reads === 2 ? { ...reply, session: { ...reply.session!, lastSequence: 2 } } : reply;
  };
  await assert.rejects(
    updateNativeSession('complete', initial, 7, course, owner, h.commit, h.client),
    /마지막 기록/,
  );
  assert.equal(h.current().pendingInput, null);
});

test('a legacy web route supplies the native timestamp floor during explicit handoff', () => {
  const initial = session();
  initial.accumulatedMs = 20_000;
  initial.native = nativeCheckpoint(20_000);
  initial.segments = [
    [
      {
        lat: 37,
        lng: 127,
        latitude: 37,
        longitude: 127,
        timestamp: base + 20_000,
        accuracy: 5,
        altitude: null,
        speed: null,
      },
    ],
  ];
  const next = mergeNativePage(initial, page([point(1), point(2), point(3)]), course);
  assert.deepEqual(
    next.segments.flat().map((p) => p.timestamp),
    [base + 20_000, base + 30_000],
  );
  assert.equal(next.native!.cursor, 3);
  assert.equal(next.native!.baseElapsedMs, 20_000);
});

test('fresh stationary native fixes update display and summit distance without adding route distance', async () => {
  const now = Date.now();
  const initial = session();
  const old = nativePoint(point(1, { latitude: 37, timestamp: now - 20_000 }));
  initial.segments = [[old]];
  initial.native = { ...nativeCheckpoint(), cursor: 1, lastTimestamp: old.timestamp, segment: 0 };
  const h = harness(initial, [
    point(2, { latitude: 37, timestamp: now - 10_000 }),
    point(3, { latitude: 37.00001, timestamp: now }), // 5m 미만의 GPS 흔들림
  ]);
  const result = await synchronizeNativeSession(initial, 7, course, owner, h.commit, h.client);
  assert.equal(result.session.segments.flat().length, 1);
  assert.equal(trackDistance(result.session.segments), 0);
  assert.equal(result.session.native!.cursor, 3);
  assert.equal(result.position!.timestamp, now);
  assert.equal(result.position!.lat, 37.00001);
  assert.equal(isUsablePoint(old, now), false); // 기존 UI는 이 오래된 경로 좌표를 표시용 위치로 잘못 사용했다.
  const display = latestNativeDisplayPosition(null, [result.position!], now);
  assert.ok(display);
  const remaining = display ? distanceMeters(display, course.summitPoint) : null;
  assert.ok(remaining !== null && Number.isFinite(remaining));
  const reception = gpsReception(initial.startedAt, result.status.session!.lastRecordedAt, now);
  assert.equal(reception, 'receiving');
  assert.equal(gpsReceptionWarning('TRACKING', reception), null);
  const recovery = readRecovery(7, Date.now(), h.store);
  assert.equal(recovery.kind, 'ready');
  if (recovery.kind === 'ready') {
    assert.equal(recovery.draft.native!.cursor, 3);
    assert.equal('position' in recovery.draft, false);
    assert.equal('nativePosition' in recovery.draft, false);
    assert.equal(recovery.draft.pendingInput, null);
  }
  // 새 표본이 없는 조회는 표시용 위치를 바꾸거나 해당 수신 시각을 갱신하지 않는다.
  const reads = h.events.filter((event) => event.startsWith('read-')).length;
  const repeated = await synchronizeNativeSession(
    result.session,
    7,
    course,
    owner,
    h.commit,
    h.client,
  );
  assert.equal(repeated.position, null);
  assert.equal(h.events.filter((event) => event.startsWith('read-')).length, reads);
  const held = latestNativeDisplayPosition(display, [], now + 1000);
  assert.equal(held, display);
  assert.equal(held!.timestamp, now);
  const silentAt = now + 15_001;
  assert.equal(latestNativeDisplayPosition(held, [], silentAt), null);
  assert.equal(
    gpsReception(initial.startedAt, repeated.status.session!.lastRecordedAt, silentAt),
    'stale',
  );
  assert.ok(gpsReceptionWarning('TRACKING', 'stale'));
  assert.equal(repeated.session.native!.cursor, 3);
});

test('native display rejects stale, future, inaccurate and invalid fixes and never rewinds measurement time', () => {
  const now = Date.now();
  const previous = nativePoint(point(1, { timestamp: now - 1000 }));
  const invalid = [
    { ...previous, timestamp: now - 15_001 },
    { ...previous, timestamp: now + 1 },
    { ...previous, timestamp: now, accuracy: 50.001 },
    { ...previous, timestamp: now, accuracy: -1 },
    { ...previous, timestamp: now, accuracy: NaN },
    { ...previous, timestamp: now, lat: 91 },
    { ...previous, timestamp: now, lng: 181 },
    { ...previous, timestamp: NaN },
  ];
  for (const candidate of invalid) {
    assert.equal(latestNativeDisplayPosition(null, [candidate], now), null);
    assert.equal(latestNativeDisplayPosition(previous, [candidate], now), previous);
  }
  const newest = { ...previous, timestamp: now, accuracy: 50 };
  const older = { ...previous, timestamp: now - 500 };
  assert.equal(latestNativeDisplayPosition(previous, [newest, older], now), newest);
  assert.equal(latestNativeDisplayPosition(newest, [{ ...older, timestamp: now }], now), newest);
  assert.equal(latestNativeDisplayPosition(previous, [], now + 15_001), null);
});

test('historical native route recovery does not present old coordinates as current location', async () => {
  const initial = session();
  const h = harness(initial, [point(1), point(2)]);
  const result = await synchronizeNativeSession(initial, 7, course, owner, h.commit, h.client);
  assert.equal(result.session.segments.flat().length, 2);
  assert.equal(result.session.native!.cursor, 2);
  assert.equal(result.position, null);
  assert.equal(
    gpsReception(initial.startedAt, result.status.session!.lastRecordedAt, Date.now()),
    'stale',
  );
});

test('fresh stationary display fixes bypass movement only and cannot change frozen completion evidence', async () => {
  const now = Date.now();
  const initial = session();
  const h = harness(initial, [
    point(1, { timestamp: now - 5000 }),
    point(2, { latitude: 37.0001, timestamp: now }),
  ]);
  const result = await updateNativeSession(
    'complete',
    initial,
    7,
    course,
    owner,
    h.commit,
    h.client,
  );
  assert.equal(result.session.segments.flat().length, 1);
  assert.equal(result.position!.timestamp, now);
  const frozen = JSON.stringify(result.session.pendingInput);
  const cursor = result.session.native!.cursor;
  latestNativeDisplayPosition(result.position, [], now + 15_001);
  assert.equal(JSON.stringify(result.session.pendingInput), frozen);
  assert.equal(result.session.native!.cursor, cursor);
  assert.equal('position' in result.session.pendingInput!, false);
});
