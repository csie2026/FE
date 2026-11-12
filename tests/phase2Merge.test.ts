import { memberResponse } from './fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActivityScoring, HikingActivityInput } from '../src/api.ts';
import type { GpsPoint, HikingCourse } from '../src/components/hiking/types.ts';
import {
  completeSession,
  draftFromSession,
  initialSession,
  sessionFromDraft,
  validateDraft,
  readRecovery,
  writeRecovery,
  type Session,
} from '../src/components/hiking/services/sessionRecovery.ts';
import { isValidActivityInput } from '../src/components/hiking/services/activityValidation.ts';
import { recordTrackPoint } from '../src/components/hiking/services/sessionTracking.ts';
import {
  ActivitySaveFailure,
  submitPendingActivity,
} from '../src/components/hiking/services/activitySave.ts';
import { scoringText } from '../src/components/hiking/services/scoringDisplay.ts';
import { summarizeHikingActivities } from '../src/services/hikingStatistics.ts';
import { summarizeCompletedHikes } from '../src/services/completedHikes.ts';

const course: HikingCourse = {
  mountainId: '1',
  courseId: '2',
  mountainName: 'Test',
  courseName: 'Course',
  path: [],
  startPoint: { lat: 37, lng: 127 },
  summitPoint: { lat: 37.01, lng: 127 },
};
function fixture(now = Date.now() - 1000): { session: Session; now: number } {
  const point = (lat: number, timestamp: number): GpsPoint => ({
    lat,
    lng: 127.12345678912345,
    latitude: lat,
    longitude: 127.12345678912345,
    accuracy: 5,
    timestamp,
    altitude: null,
    speed: null,
  });
  return {
    now,
    session: {
      ...initialSession(),
      state: 'PAUSED',
      startedAt: now - 1_800_000,
      accumulatedMs: 1_200_000,
      clientRequestId: crypto.randomUUID(),
      reachedSummit: true,
      segments: [
        [point(37.12345678912345, now - 1_700_000), point(37.1235, now - 1_600_000)],
        [],
        [point(37.2, now - 10_000)],
      ],
    },
  };
}
function store(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
}

test('integration keeps full segmented evidence and scoring sample frozen through serialized recovery', () => {
  const { session, now } = fixture();
  const ended = completeSession(session, course, now);
  const input = ended.pendingInput!;
  const first = session.segments[0][0];
  assert.deepEqual(input.gpsEvidence, {
    latitude: first.lat,
    longitude: first.lng,
    accuracyMeters: first.accuracy,
    recordedAt: new Date(first.timestamp).toISOString(),
  });
  assert.deepEqual(
    input.gpsSegments!.map((s) => s.length),
    [2, 0, 1],
  );
  assert.ok(input.distanceMeters > 0 && input.distanceMeters < 20); // 일시정지 구간 전후의 경로를 연결하지 않는다.
  assert.equal(input.elapsedMs, 1_200_000);
  assert.ok(Object.isFrozen(input.gpsEvidence));
  assert.ok(Object.isFrozen(input.gpsSegments![0][0]));
  assert.throws(() => {
    input.gpsEvidence!.latitude = 0;
  }, TypeError);
  assert.throws(() => {
    input.gpsSegments![0][0].lat = 0;
  }, TypeError);
  const draft = draftFromSession(ended, course, 1, crypto.randomUUID(), now);
  assert.equal(draft.version, 2);
  assert.equal(Object.hasOwn(draft.pendingInput!, 'gpsSegments'), false); // 저장소에 경로를 중복 보관하지 않는다.
  assert.equal(validateDraft(draft, 1, now), true);
  const restored = sessionFromDraft(JSON.parse(JSON.stringify(draft)));
  assert.equal(JSON.stringify(restored.pendingInput), JSON.stringify(input));
  assert.equal(restored.clientRequestId, ended.clientRequestId);
});

test('integration retains pre-merge ended scoring-only requests exactly without fabricating a route', () => {
  const { session, now } = fixture();
  const legacy = { ...completeSession(session, course, now).pendingInput! };
  delete legacy.gpsSegments;
  const draft = draftFromSession(
    {
      ...session,
      state: 'COMPLETED',
      endedAt: now,
      segments: [],
      pendingInput: legacy,
    },
    course,
    1,
    crypto.randomUUID(),
    now,
  );
  assert.equal(draft.version, 1);
  assert.equal(validateDraft(draft, 1, now), true);
  const restored = sessionFromDraft(JSON.parse(JSON.stringify(draft)));
  assert.equal(JSON.stringify(restored.pendingInput), JSON.stringify(legacy));
  assert.equal(isValidActivityInput(restored.pendingInput, now), false);
  assert.equal(isValidActivityInput(restored.pendingInput, now, true), true);
});

test('integration accepts leader-era route-only recovery without adding a new request field', () => {
  const { session, now } = fixture();
  const input = { ...completeSession(session, course, now).pendingInput! };
  delete input.gpsEvidence;
  const draft = draftFromSession(
    { ...session, state: 'COMPLETED', endedAt: now, pendingInput: input },
    course,
    1,
    crypto.randomUUID(),
    now,
  );
  assert.equal(draft.version, 2);
  assert.equal(validateDraft(draft, 1, now), true);
  const restored = sessionFromDraft(JSON.parse(JSON.stringify(draft)));
  assert.equal(JSON.stringify(restored.pendingInput), JSON.stringify(input));
  assert.equal(Object.hasOwn(restored.pendingInput!, 'gpsEvidence'), false);
});

test('integration validates each evidence format independently including explicit legacy retry', () => {
  const { session, now } = fixture();
  const input = completeSession(session, course, now).pendingInput!;
  const malformedSample = {
    ...input,
    gpsEvidence: { ...input.gpsEvidence!, accuracyMeters: 51 },
  };
  const malformedRoute = {
    ...input,
    gpsSegments: [[{ ...input.gpsSegments![0][0], lat: 91 }]],
  };
  for (const body of [malformedSample, malformedRoute]) {
    assert.equal(isValidActivityInput(body, now), false);
    assert.equal(isValidActivityInput(body, now, true), false);
  }
  assert.equal(
    isValidActivityInput({ ...malformedSample, gpsSegments: undefined }, now, true),
    false,
  );
  assert.equal(
    isValidActivityInput(
      { ...input, gpsSegments: [Array(10_001).fill(input.gpsSegments![0][0])] },
      now,
    ),
    false,
  );
});

test('integration storage failure keeps old evidence and score sample source rather than the unsaved summit', () => {
  const { session, now } = fixture();
  const first = session.segments[0][0];
  const last: Session = {
    ...session,
    state: 'PAUSED',
    reachedSummit: false,
    segments: [[first]],
    accumulatedMs: 1234,
  };
  const tracking: Session = {
    ...last,
    state: 'TRACKING',
    activeSince: now - 1000,
  };
  const point: GpsPoint = {
    ...first,
    ...course.summitPoint,
    latitude: course.summitPoint.lat,
    longitude: course.summitPoint.lng,
    timestamp: now,
  };
  const result = recordTrackPoint(
    tracking,
    point,
    course,
    () => {
      throw Error('quota');
    },
    last,
    now,
  );
  assert.equal(result.session.trackingStopReason, 'storage-error');
  assert.equal(result.session.reachedSummit, false);
  assert.equal(result.session.accumulatedMs, 1234);
  assert.deepEqual(result.session.segments, last.segments);
  const input = completeSession(result.session, course, now).pendingInput!;
  assert.equal(input.completed, false);
  assert.equal(input.gpsSegments![0].length, 1);
  assert.equal(input.gpsEvidence!.recordedAt, new Date(first.timestamp).toISOString());
});

test('integration response-loss retry preserves evidence and separates saved statistics from scoring', async () => {
  const { session, now } = fixture();
  const ended = completeSession(session, course, now);
  const storage = store(),
    owner = crypto.randomUUID();
  writeRecovery(draftFromSession(ended, course, 1, owner), 'create', storage);
  const original = globalThis.fetch,
    posts: string[] = [];
  const scoring: ActivityScoring = {
    status: 'CERTIFIED',
    certificationDate: '2026-11-05',
    visitPoints: 200,
    summitPoints: 0,
    policyVersion: 'server-policy',
  };
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/api/csrf')
      return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' });
    if (String(url) === '/api/users/me') return Response.json(memberResponse(1));
    posts.push(init!.body as string);
    if (posts.length === 1) throw TypeError('response lost after commit');
    const input: HikingActivityInput = JSON.parse(init!.body as string);
    return Response.json({
      ...input,
      id: 99,
      mountainName: 'Test',
      hikingDate: '2026-11-05',
      journalId: null,
      completed: false,
      gpsValidationVersion: 1,
      scoring,
    });
  };
  try {
    await assert.rejects(
      submitPendingActivity(ended.pendingInput!, 1),
      (e) => e instanceof ActivitySaveFailure && e.kind === 'uncertain',
    );
    const read = readRecovery(1, Date.now(), storage);
    assert.equal(read.kind, 'ready');
    if (read.kind !== 'ready') throw Error('missing recovery');
    const saved = await submitPendingActivity(sessionFromDraft(read.draft).pendingInput!, 1);
    assert.equal(posts[0], posts[1]);
    assert.equal(JSON.parse(posts[0]).clientRequestId, ended.clientRequestId);
    assert.deepEqual(JSON.parse(posts[0]).gpsEvidence, ended.pendingInput!.gpsEvidence);
    assert.deepEqual(JSON.parse(posts[0]).gpsSegments, ended.pendingInput!.gpsSegments);
    assert.equal(saved.gpsValidationVersion, 1);
    assert.deepEqual(saved.scoring, scoring);
    assert.match(scoringText(saved.scoring), /200점/);
    const stats = summarizeHikingActivities([saved], now).statistics;
    // 짧은 산행은 CERTIFIED 점수 응답만으로 횟수에 포함하지 않는다.
    assert.equal(stats.totalHikeCount, 0);
    assert.equal(stats.totalDistanceMeters, saved.distanceMeters);
    assert.equal(stats.completedHikeCount, 0);
    assert.equal(summarizeCompletedHikes([saved]).count, 0);
    assert.equal(ended.pendingInput!.completed, true); // 서버 결과로 이미 확정된 요청 본문을 덮어쓰지 않는다.
  } finally {
    globalThis.fetch = original;
  }
});
