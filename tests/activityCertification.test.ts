import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HikingActivity } from '../src/api.ts';
import { summarizeHikingActivities } from '../src/services/hikingStatistics.ts';

test('A-F use saved thresholds or server-verified summits', () => {
  const cases = [
    [200, 5, false, false],
    [700, 25, false, true],
    [800, 30, true, true],
    [250, 8, true, true],
    [600, 10, false, false],
    [300, 25, false, false],
  ] as const;
  const records = cases.map(
    ([distanceMeters, minutes, completed, certified], i): HikingActivity => ({
      id: i + 1,
      mountainId: 142,
      courseId: 421,
      mountainName: 'GPS 테스트산',
      startedAt: `2026-11-12T0${i}:00:00Z`,
      endedAt: `2026-11-12T0${i}:40:00Z`,
      hikingDate: '2026-11-12',
      elapsedMs: minutes * 60000,
      distanceMeters,
      completed,
      gpsValidationVersion: 1,
      journalId: null,
      scoring: {
        status: certified ? 'CERTIFIED' : 'BELOW_MINIMUM',
        certificationDate: '2026-11-12',
        visitPoints: certified ? 100 : 0,
        summitPoints: certified && completed ? 70 : 0,
        policyVersion: 'v2',
      },
    }),
  );
  const result = summarizeHikingActivities(records, Date.parse('2026-11-12T10:00:00Z')).statistics;
  assert.equal(result.totalHikeCount, 3);
  assert.equal(result.monthlyHikeCount, 3);
  assert.equal(result.completedHikeCount, 2);
  assert.equal(result.completedMountainCount, 1);
  assert.equal(records.length, 6);
});

test('missing versions never prove summits, while DAILY_LIMIT cannot suppress verified completion', () => {
  const base = {
    id: 1,
    mountainId: 142,
    courseId: 421,
    mountainName: 'GPS 테스트산',
    startedAt: '2026-11-12T00:00:00Z',
    endedAt: '2026-11-12T00:08:00Z',
    hikingDate: '2026-11-12',
    distanceMeters: 250,
    elapsedMs: 480000,
    completed: true,
    journalId: null,
  };
  const scoring = {
    status: 'CERTIFIED' as const,
    certificationDate: '2026-11-12',
    visitPoints: 200,
    summitPoints: 70,
    policyVersion: 'v1',
  };
  const records: HikingActivity[] = [
    base,
    { ...base, id: 2, scoring },
    {
      ...base,
      id: 3,
      gpsValidationVersion: 1,
      scoring: { ...scoring, status: 'DAILY_LIMIT', visitPoints: 0, summitPoints: 0 },
    },
  ];
  const result = summarizeHikingActivities(records).statistics;
  assert.equal(result.totalHikeCount, 1);
  assert.equal(result.completedHikeCount, 1);
});

test('threshold boundaries, legacy score states and missing ledgers do not gate counts', () => {
  const base: HikingActivity = {
    id: 1,
    mountainId: 142,
    courseId: 421,
    mountainName: 'GPS 테스트산',
    startedAt: '2026-11-12T00:00:00Z',
    endedAt: '2026-11-12T01:00:00Z',
    hikingDate: '2026-11-12',
    distanceMeters: 500,
    elapsedMs: 1200000,
    completed: false,
    journalId: null,
  };
  const cases = [
    { distanceMeters: 500, elapsedMs: 1200000, hike: 1, summit: 0 },
    { distanceMeters: 499.999, elapsedMs: 1200000, hike: 0, summit: 0 },
    { distanceMeters: 500, elapsedMs: 1199999, hike: 0, summit: 0 },
    { distanceMeters: 100, elapsedMs: 1000, hike: 0, summit: 0 },
    {
      distanceMeters: 100,
      elapsedMs: 1000,
      completed: true,
      gpsValidationVersion: 1,
      hike: 1,
      summit: 1,
    },
    {
      distanceMeters: 500,
      elapsedMs: 1200000,
      completed: true,
      gpsValidationVersion: 1,
      hike: 1,
      summit: 1,
    },
    { distanceMeters: 100, elapsedMs: 1000, completed: true, hike: 0, summit: 0 },
    {
      distanceMeters: 100,
      elapsedMs: 1000,
      completed: true,
      gpsValidationVersion: 2,
      hike: 0,
      summit: 0,
    },
  ];
  for (const value of cases) {
    for (const status of [
      undefined,
      'CERTIFIED',
      'DAILY_LIMIT',
      'BELOW_MINIMUM',
      'GPS_REQUIRED',
    ] as const) {
      const activity: HikingActivity = {
        ...base,
        ...value,
        scoring: status
          ? {
              status,
              visitPoints: 0,
              summitPoints: 0,
              certificationDate: '2026-11-12',
              policyVersion: 'legacy',
            }
          : undefined,
      };
      const before = JSON.stringify(activity);
      const result = summarizeHikingActivities([activity]).statistics;
      assert.equal(result.totalHikeCount, value.hike, JSON.stringify({ value, status }));
      assert.equal(result.completedHikeCount, value.summit);
      assert.equal(JSON.stringify(activity), before);
    }
  }
});

test('same-day repeat activities and different mountains count separately with no ledger', () => {
  const records: HikingActivity[] = [142, 142, 143].map((mountainId, i) => ({
    id: i + 1,
    mountainId,
    courseId: 421,
    mountainName: '검증 산',
    startedAt: `2026-11-12T0${i}:00:00Z`,
    endedAt: `2026-11-12T0${i}:30:00Z`,
    hikingDate: '2026-11-12',
    distanceMeters: 100,
    elapsedMs: 1000,
    completed: true,
    gpsValidationVersion: 1,
    journalId: null,
  }));
  const result = summarizeHikingActivities(records).statistics;
  assert.equal(result.totalHikeCount, 3);
  assert.equal(result.completedHikeCount, 3);
  assert.equal(result.completedMountainCount, 2);
});
