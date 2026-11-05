import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialSession,
  pauseSession,
  completeSession,
  draftFromSession,
  sessionFromDraft,
  validateDraft,
  readRecovery,
  writeRecovery,
  removeRecovery,
  recoveryKey,
  MAX_RECOVERY_POINTS,
  MAX_RECOVERY_BYTES,
  RECOVERY_TTL_MS,
  type Session,
} from "../src/components/hiking/services/sessionRecovery.ts";
import type { HikingCourse } from "../src/components/hiking/types.ts";

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  failWrites = false;
  failReads = false;
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    if (this.failReads) throw new Error("denied");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("quota");
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}
const course: HikingCourse = {
  mountainId: "47",
  courseId: "10",
  mountainName: "북한산",
  courseName: "우이동 코스",
  startPoint: { lat: 37, lng: 127 },
  summitPoint: { lat: 37.01, lng: 127 },
  path: [
    { lat: 37, lng: 127 },
    { lat: 37.01, lng: 127 },
  ],
};
function running(now = Date.now()): Session {
  const point = (lat: number, timestamp: number) => ({
    lat,
    lng: 127,
    latitude: lat,
    longitude: 127,
    timestamp,
    accuracy: 5,
    altitude: null,
    speed: null,
  });
  return {
    ...initialSession(),
    startedAt: now - 120_000,
    state: "TRACKING",
    activeSince: now - 15_000,
    accumulatedMs: 5000,
    clientRequestId: crypto.randomUUID(),
    reachedSummit: true,
    segments: [[point(37, now - 10_000), point(37.0001, now - 5000)]],
  };
}
test("checkpoints restore paused with exact IDs, raw points, distance and no offline time", () => {
  const now = Date.now(),
    session = running(now),
    owner = crypto.randomUUID();
  const draft = draftFromSession(session, course, 1, owner, now);
  assert.equal(validateDraft(draft, 1, now), true);
  assert.equal(draft.accumulatedMs, 20_000);
  const restored = sessionFromDraft(draft);
  assert.equal(restored.state, "PAUSED");
  assert.equal(restored.activeSince, null);
  assert.deepEqual(restored.segments, session.segments);
  assert.equal(restored.clientRequestId, session.clientRequestId);
  assert.equal(pauseSession(restored, now + 3_600_000).accumulatedMs, 20_000);
  assert.ok(draft.distanceMeters > 11 && draft.distanceMeters < 12);
  assert.equal(restored.reachedSummit, true);
});
test("pause checkpoints are idempotent and resuming a new segment never connects an offline gap", () => {
  const now = Date.now();
  const paused = pauseSession(running(now), now);
  assert.equal(
    pauseSession(paused, now + 100_000).accumulatedMs,
    paused.accumulatedMs,
  );
  const draft = draftFromSession(
    {
      ...paused,
      segments: [
        ...paused.segments,
        [{ ...paused.segments[0][0], lat: 38, latitude: 38, timestamp: now }],
      ],
    },
    course,
    1,
    crypto.randomUUID(),
    now,
  );
  assert.ok(draft.distanceMeters < 12);
});
test("ended recovery retains immutable scoring evidence and the precise GPS route", () => {
  const now = Date.now();
  const ended = completeSession(running(now), course, now);
  const draft = draftFromSession(ended, course, 1, crypto.randomUUID(), now);
  assert.equal(validateDraft(draft, 1, now), true);
  assert.equal(draft.segments[0].length, 2);
  const restored = sessionFromDraft(draft);
  const retry = draftFromSession(
    restored,
    course,
    1,
    crypto.randomUUID(),
    now + 60_000,
  );
  assert.deepEqual(sessionFromDraft(retry).pendingInput, ended.pendingInput);
  assert.equal(retry.distanceMeters, draft.distanceMeters);
  assert.equal(retry.endedAt, now);
  assert.equal(
    validateDraft(
      {
        ...draft,
        pendingInput: {
          ...draft.pendingInput!,
          elapsedMs: draft.accumulatedMs + 1,
        },
      },
      1,
      now,
    ),
    false,
  );
  assert.equal(completeSession(restored, course, now + 90_000), restored);
});
test("member-specific keys do not recover another member or legacy completion IDs", () => {
  const store = new MemoryStorage();
  const draft = draftFromSession(running(), course, 1, crypto.randomUUID());
  writeRecovery(draft, "create", store);
  store.setItem("topeak.completedMountainIds", '["47"]');
  assert.equal(readRecovery(2, Date.now(), store).kind, "none");
  store.setItem(recoveryKey(2), JSON.stringify(draft));
  assert.equal(readRecovery(2, Date.now(), store).kind, "error");
  assert.equal(readRecovery(1, Date.now(), store).kind, "ready");
});
test("a new session cannot overwrite an existing one; an old writer cannot overwrite a claimed session", () => {
  const store = new MemoryStorage();
  const draft = draftFromSession(running(), course, 1, crypto.randomUUID());
  writeRecovery(draft, "create", store);
  assert.throws(() =>
    writeRecovery(
      draftFromSession(running(), course, 1, crypto.randomUUID()),
      "create",
      store,
    ),
  );
  const claimed = { ...draft, ownerToken: crypto.randomUUID() };
  writeRecovery(claimed, "claim", store);
  assert.throws(() => writeRecovery(draft, "update", store));
  assert.throws(() =>
    removeRecovery(1, draft.clientRequestId, draft.ownerToken, store),
  );
  assert.equal(
    (readRecovery(1, Date.now(), store) as { draft: { ownerToken: string } })
      .draft.ownerToken,
    claimed.ownerToken,
  );
});
test("successful-save cleanup only removes its own draft and keeps favorites", () => {
  const store = new MemoryStorage();
  const draft = draftFromSession(running(), course, 1, crypto.randomUUID());
  store.setItem("topeak.favoriteMountainIds", '["47"]');
  writeRecovery(draft, "create", store);
  assert.throws(() =>
    removeRecovery(1, crypto.randomUUID(), draft.ownerToken, store),
  );
  removeRecovery(1, draft.clientRequestId, draft.ownerToken, store);
  assert.equal(readRecovery(1, Date.now(), store).kind, "none");
  assert.equal(store.getItem("topeak.favoriteMountainIds"), '["47"]');
});
test("expired drafts are cleaned on read without clearing other browser data", () => {
  const store = new MemoryStorage(),
    now = Date.now();
  const draft = draftFromSession(
    running(now),
    course,
    1,
    crypto.randomUUID(),
    now,
  );
  writeRecovery(draft, "create", store);
  store.setItem("other", "keep");
  assert.equal(readRecovery(1, now + RECOVERY_TTL_MS + 1, store).kind, "error");
  assert.ok(store.getItem(recoveryKey(1)));
  assert.equal(store.getItem("other"), "keep");
});
test("malformed or inconsistent snapshots are rejected instead of inventing session values", () => {
  const now = Date.now(),
    draft = draftFromSession(running(now), course, 1, crypto.randomUUID(), now);
  for (const invalid of [
    { ...draft, accumulatedMs: -1 },
    { ...draft, distanceMeters: 500 },
    { ...draft, version: 3 },
    { ...draft, ownerToken: "bad" },
    { ...draft, mountainId: 0 },
    { ...draft, segments: [[[91, 127, now, 5, null, null]]] },
    { ...draft, updatedAt: now + 60_000 },
  ]) {
    assert.equal(validateDraft(invalid, 1, now), false);
  }
  const store = new MemoryStorage();
  store.setItem(recoveryKey(1), "{");
  assert.equal(readRecovery(1, now, store).kind, "error");
});
test("denied storage and quota errors are explicit and retain the previous valid checkpoint", () => {
  const store = new MemoryStorage();
  const draft = draftFromSession(running(), course, 1, crypto.randomUUID());
  writeRecovery(draft, "create", store);
  const before = store.getItem(recoveryKey(1));
  store.failWrites = true;
  assert.throws(() => writeRecovery(draft, "update", store), /자동 복구 저장/);
  assert.equal(store.getItem(recoveryKey(1)), before);
  store.failReads = true;
  assert.equal(readRecovery(1, Date.now(), store).kind, "error");
});
test("point limits do not silently truncate distance; ending stores a compact immutable summary", () => {
  const now = Date.now(),
    session = running(now);
  const p = session.segments[0][0];
  session.segments = [
    Array.from({ length: MAX_RECOVERY_POINTS + 1 }, () => ({ ...p })),
  ];
  const draft = draftFromSession(session, course, 1, crypto.randomUUID(), now);
  assert.equal(validateDraft(draft, 1, now), false);
  const ended = draftFromSession(
    completeSession(session, course, now),
    course,
    1,
    crypto.randomUUID(),
    now,
  );
  assert.equal(validateDraft(ended, 1, now), false);
  assert.equal(ended.segments[0].length, MAX_RECOVERY_POINTS + 1);
});
test("the serialized byte budget is enforced without a partial write", () => {
  const now = Date.now(),
    session = running(now),
    store = new MemoryStorage();
  const p = {
    ...session.segments[0][0],
    lat: 37.12345678912345,
    latitude: 37.12345678912345,
    lng: 127.12345678912345,
    longitude: 127.12345678912345,
    accuracy: 49.12345678912345,
    altitude: Number.MAX_VALUE,
    speed: Number.MAX_VALUE,
  };
  session.segments = [
    Array.from({ length: MAX_RECOVERY_POINTS }, () => ({ ...p })),
  ];
  const draft = draftFromSession(session, course, 1, crypto.randomUUID(), now);
  assert.equal(validateDraft(draft, 1, now), true);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(draft)).length > MAX_RECOVERY_BYTES,
  );
  assert.throws(() => writeRecovery(draft, "create", store), /용량 한도/);
  assert.equal(store.getItem(recoveryKey(1)), null);
});

test("GPS segments preserve boundaries and exact samples through completed reload and failed retry", () => {
  const now = Date.now(),
    session = running(now);
  session.segments.push([], [{ ...session.segments[0][1], timestamp: now }]);
  const ended = completeSession(session, course, now);
  const draft = draftFromSession(ended, course, 1, crypto.randomUUID(), now);
  assert.equal("gpsSegments" in draft.pendingInput!, false);
  const restored = sessionFromDraft(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(restored.pendingInput, ended.pendingInput);
  assert.deepEqual(
    restored.pendingInput!.gpsSegments!.map((s) => s.length),
    [2, 0, 1],
  );
  assert.equal(restored.pendingInput!.gpsSegments![0][0].accuracyMeters, 5);
  assert.equal(
    Object.isFrozen(restored.pendingInput!.gpsSegments![0][0]),
    true,
  );
});
test("legacy paused evidence migrates, legacy ended evidence stays absent for UUID lookup", () => {
  const now = Date.now(),
    session = running(now),
    owner = crypto.randomUUID();
  const oldPaused = {
    ...draftFromSession(session, course, 1, owner, now),
    version: 1 as const,
  };
  assert.equal(validateDraft(oldPaused, 1, now), true);
  const migrated = draftFromSession(
    sessionFromDraft(oldPaused),
    course,
    1,
    owner,
    now,
  );
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.segments, oldPaused.segments);
  const oldEnded = {
    ...draftFromSession(
      completeSession(session, course, now),
      course,
      1,
      owner,
      now,
    ),
    version: 1 as const,
    segments: [],
  };
  assert.equal(validateDraft(oldEnded, 1, now), true);
  const restored = sessionFromDraft(oldEnded);
  assert.equal(restored.pendingInput!.gpsSegments, undefined);
  assert.equal(restored.clientRequestId, session.clientRequestId);
  assert.equal(draftFromSession(restored, course, 1, owner, now).version, 1);
});
