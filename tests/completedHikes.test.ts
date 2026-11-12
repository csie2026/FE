import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HikingActivity } from '../src/api.ts';
import { summarizeCompletedHikes } from '../src/services/completedHikes.ts';

const activity = (id: number, mountainId: number, completed: boolean): HikingActivity => ({
  id,
  mountainId,
  completed,
  mountainName: '검증 산',
  courseId: 10,
  startedAt: '2026-01-01T01:00:00Z',
  endedAt: '2026-01-01T02:00:00Z',
  hikingDate: '2026-01-01',
  distanceMeters: 1000,
  elapsedMs: 3600000,
  journalId: null,
  gpsValidationVersion: 1,
  scoring: { status: 'CERTIFIED', certificationDate: '2026-11-01', visitPoints: 200, summitPoints: completed ? 70 : 0, policyVersion: 'visit-general-or-verified-summit-multi-v2' },
});

test('only completed GPS activities count; repeated summits count as activities but list one mountain', () => {
  const result = summarizeCompletedHikes([
    activity(1, 47, true),
    activity(2, 47, true),
    activity(3, 55, false),
    activity(4, 60, true),
  ]);
  assert.equal(result.count, 3);
  assert.deepEqual([...result.mountainIds], ['47', '60']);
});

test('empty or unfinished history cannot create completed mountains', () => {
  for (const records of [[], [activity(1, 47, false)]]) {
    const result = summarizeCompletedHikes(records);
    assert.equal(result.count, 0);
    assert.equal(result.mountainIds.size, 0);
  }
});

test('malformed completion flags and IDs are not accepted as completed activities', () => {
  const result = summarizeCompletedHikes([
    activity(1, 0, true),
    activity(2, -1, true),
    activity(3, 1.5, true),
    { ...activity(4, 47, false), completed: 'true' as unknown as boolean },
  ]);
  assert.equal(result.count, 0);
  assert.equal(result.mountainIds.size, 0);
});
