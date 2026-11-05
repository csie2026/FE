import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidActivityInput } from '../src/components/hiking/services/activityValidation.ts';
import {
  initialSession,
  completeSession,
  draftFromSession,
  validateDraft,
  sessionFromDraft,
} from '../src/components/hiking/services/sessionRecovery.ts';
import { submitPendingActivity } from '../src/components/hiking/services/activitySave.ts';
import { scoringText } from '../src/components/hiking/services/scoringDisplay.ts';
import type { HikingActivityInput, ActivityScoring } from '../src/api.ts';
const course = { mountainId: '1', courseId: '2', mountainName: 'Test', courseName: 'Test course' };
function ended() {
  const now = Date.now() - 100;
  const raw = {
    lat: 37,
    lng: 127,
    latitude: 37,
    longitude: 127,
    accuracy: 50,
    timestamp: now - 1000,
    altitude: null,
    speed: null,
  };
  return completeSession(
    {
      ...initialSession(),
      state: 'TRACKING',
      startedAt: now - 1200000,
      activeSince: now - 1200000,
      clientRequestId: crypto.randomUUID(),
      segments: [[raw]],
      reachedSummit: false,
    },
    course,
    now,
  );
}
test('score eligibility captures the original accepted GPS sample without inventing distance', () => {
  const result = ended();
  const input = result.pendingInput!;
  assert.deepEqual(input.gpsEvidence, {
    latitude: 37,
    longitude: 127,
    accuracyMeters: 50,
    recordedAt: new Date(result.segments[0][0].timestamp).toISOString(),
  });
  assert.equal(input.distanceMeters, 0);
  assert.equal(input.elapsedMs, 1200000);
  assert.ok(isValidActivityInput(input));
});
test('GPS evidence survives ended recovery and retry as the exact same frozen request', () => {
  const session = ended();
  const draft = draftFromSession(session, course, 1, crypto.randomUUID());
  assert.ok(validateDraft(draft, 1));
  assert.deepEqual(draft.segments, []);
  const retry = draftFromSession(
    sessionFromDraft(JSON.parse(JSON.stringify(draft))),
    course,
    1,
    crypto.randomUUID(),
  );
  assert.deepEqual(retry.pendingInput, session.pendingInput);
});
test('pre-upgrade pending requests without GPS evidence remain recoverable without changing their UUID or body', () => {
  const session = ended();
  const input = { ...session.pendingInput! };
  delete input.gpsEvidence;
  const draft = draftFromSession(
    { ...session, pendingInput: input },
    course,
    1,
    crypto.randomUUID(),
  );
  assert.ok(validateDraft(draft, 1));
  assert.deepEqual(sessionFromDraft(draft).pendingInput, input);
  assert.equal(Object.hasOwn(sessionFromDraft(draft).pendingInput!, 'gpsEvidence'), false);
});
test('malformed or out-of-session GPS evidence is rejected and cannot be recovered as valid', () => {
  const session = ended();
  const input = session.pendingInput!;
  for (const change of [
    { accuracyMeters: 50.01 },
    { accuracyMeters: -1 },
    { latitude: 91 },
    { longitude: 181 },
    { recordedAt: new Date(Date.parse(input.startedAt) - 1).toISOString() },
    { recordedAt: new Date(Date.parse(input.endedAt) + 1).toISOString() },
  ]) {
    const altered = { ...input, gpsEvidence: { ...input.gpsEvidence!, ...change } };
    assert.equal(isValidActivityInput(altered), false);
    assert.equal(
      validateDraft(
        draftFromSession({ ...session, pendingInput: altered }, course, 1, crypto.randomUUID()),
        1,
      ),
      false,
    );
  }
});
test('save forwards frozen evidence and accepts only the matching activity while displaying the BE score', async () => {
  const original = globalThis.fetch;
  const input = ended().pendingInput!;
  let posted: HikingActivityInput | undefined;
  const scoring: ActivityScoring = {
    status: 'BELOW_MINIMUM',
    certificationDate: '2026-11-05',
    visitPoints: 0,
    summitPoints: 0,
    policyVersion: 'visit-500m-20m-daily1-v1',
  };
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/api/csrf')
      return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' });
    if (String(url) === '/api/users/me') return Response.json({ userId: 1 });
    posted = JSON.parse(init?.body as string);
    return Response.json({
      ...input,
      id: 1,
      mountainName: 'Test',
      hikingDate: '2026-11-05',
      journalId: null,
      scoring,
    });
  };
  try {
    const saved = await submitPendingActivity(input, 1);
    assert.deepEqual(posted, input);
    assert.deepEqual(saved.scoring, scoring);
    assert.match(scoringText(saved.scoring), /미충족/);
  } finally {
    globalThis.fetch = original;
  }
});
test('all server certification statuses and legacy missing results have distinct score explanations', () => {
  const base: ActivityScoring = {
    status: 'CERTIFIED',
    certificationDate: '2026-11-05',
    visitPoints: 200,
    summitPoints: 70,
    policyVersion: 'v1',
  };
  assert.match(scoringText(base), /200점.*70점/);
  assert.match(scoringText({ ...base, status: 'GPS_REQUIRED' }), /GPS 근거/);
  assert.match(scoringText({ ...base, status: 'DAILY_LIMIT' }), /해당 날짜/);
  assert.match(scoringText(null), /확인하지 못/);
});
