import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HikingActivity } from '../src/api.ts';
import {
  distanceKmText,
  koreanMonthBounds,
  summarizeHikingActivities,
} from '../src/services/hikingStatistics.ts';
const NOW = Date.parse('2026-11-05T00:00:00Z');
const a = (
  id: number,
  start: string,
  meters: number,
  completed = false,
  mountainId = 1,
): HikingActivity => ({
  id,
  mountainId,
  mountainName: '검증 산',
  courseId: null,
  startedAt: start,
  endedAt: start,
  hikingDate: '1999-01-01',
  distanceMeters: meters,
  elapsedMs: 1200000,
  completed,
  journalId: null,
  gpsValidationVersion: 1,
  scoring: {
    status: 'CERTIFIED',
    certificationDate: '2026-11-01',
    visitPoints: 200,
    summitPoints: completed ? 70 : 0,
    policyVersion: 'visit-general-or-verified-summit-multi-v2',
  },
});

test('saved distance and active time determine counts independently of score certification', () => {
  const records = [
    a(1, '2026-11-01T00:00:00Z', 0),
    a(2, '2026-11-02T00:00:00Z', 500),
    a(3, '2026-10-01T00:00:00Z', 1234.5),
  ];
  const s = summarizeHikingActivities(records, NOW).statistics;
  assert.deepEqual(s, {
    month: '2026-11',
    totalHikeCount: 2,
    monthlyHikeCount: 1,
    totalDistanceMeters: 1734.5,
    monthlyDistanceMeters: 500,
    completedHikeCount: 0,
    completedMountainCount: 0,
  });
});

test('unverified short test-course records remain outside hike and summit counts', () => {
  const records = [1, 2, 3].map((id) => ({
    ...a(id, `2026-11-05T00:0${id}:00Z`, 90, true, 142),
    courseId: 421,
    gpsValidationVersion: null,
    elapsedMs: 73000,
    scoring: {
      status: 'BELOW_MINIMUM' as const,
      certificationDate: '2026-11-05',
      visitPoints: 0,
      summitPoints: 0,
      policyVersion: 'visit-500m-20m-daily1-v1',
    },
  }));
  const { statistics } = summarizeHikingActivities(records, NOW);
  assert.equal(statistics.totalHikeCount, 0);
  assert.equal(statistics.completedHikeCount, 0);
  assert.equal(statistics.completedMountainCount, 0);
  assert.equal(records.filter((record) => String(record.scoring.status) === 'CERTIFIED').length, 0);
  assert.equal(
    records.reduce(
      (sum, record) => sum + record.scoring.visitPoints + record.scoring.summitPoints,
      0,
    ),
    0,
  );
});

test('repeated summits increase completed count but unique mountain count stays separate from all hikes', () => {
  const result = summarizeHikingActivities(
    [
      a(1, '2026-11-01T00:00:00Z', 1000, true, 47),
      a(2, '2026-11-02T00:00:00Z', 2000, true, 47),
      a(3, '2026-11-03T00:00:00Z', 3000, true, 55),
      a(4, '2026-11-04T00:00:00Z', 4000, false, 60),
    ],
    NOW,
  );
  assert.equal(result.statistics.totalHikeCount, 4);
  assert.equal(result.statistics.completedHikeCount, 3);
  assert.equal(result.statistics.completedMountainCount, 2);
  assert.deepEqual([...result.mountainIds], ['47', '55']);
});

test('month boundaries use KST start instants with inclusive start and exclusive next-month start', () => {
  const s = summarizeHikingActivities(
    [
      a(1, '2026-10-31T14:59:59.999Z', 100, true),
      a(2, '2026-10-31T15:00:00.000Z', 200, true),
      a(3, '2026-11-30T14:59:59.999Z', 300, true),
      a(4, '2026-11-30T15:00:00.000Z', 400, true),
    ],
    NOW,
  ).statistics;
  assert.equal(s.totalHikeCount, 4);
  assert.equal(s.monthlyHikeCount, 2);
  assert.equal(s.totalDistanceMeters, 1000);
  assert.equal(s.monthlyDistanceMeters, 500);
});

test('cross-month hikes belong to the start month regardless of end, hikingDate or journal linkage', () => {
  const record = {
    ...a(1, '2026-10-31T14:00:00Z', 2000, true),
    endedAt: '2026-10-31T16:00:00Z',
    hikingDate: '2026-11-01',
    journalId: 123,
  };
  assert.equal(summarizeHikingActivities([record], NOW).statistics.monthlyHikeCount, 0);
  assert.equal(
    summarizeHikingActivities([record], Date.parse('2026-10-15T00:00:00Z')).statistics
      .monthlyHikeCount,
    1,
  );
});

test('KST month keys cover year rollover and leap February, independent of host time zone', () => {
  const january = koreanMonthBounds(Date.parse('2026-12-31T15:00:00Z'));
  assert.deepEqual(january, {
    key: '2027-01',
    start: Date.parse('2026-12-31T15:00:00Z'),
    end: Date.parse('2027-01-31T15:00:00Z'),
  });
  const february = koreanMonthBounds(Date.parse('2028-02-29T00:00:00Z'));
  assert.equal(february.end - february.start, 29 * 86400000);
});

test('changing or removing journal links and publication state cannot change hiking statistics', () => {
  const records = [a(1, '2026-11-01T00:00:00Z', 1234, true), a(2, '2026-10-01T00:00:00Z', 2000)];
  const before = summarizeHikingActivities(records, NOW);
  const linked = records.map((record) => ({ ...record, journalId: 100 + record.id }));
  assert.deepEqual(summarizeHikingActivities(linked, NOW), before);
  assert.deepEqual(
    summarizeHikingActivities(
      linked.map((record) => ({ ...record, journalId: null })),
      NOW,
    ),
    before,
  );
});

test('meters are summed before one final km rounding; progress can use unrounded values', () => {
  const s = summarizeHikingActivities(
    [a(1, '2026-11-01T00:00:00Z', 4), a(2, '2026-11-02T00:00:00Z', 4)],
    NOW,
  ).statistics;
  assert.equal(s.totalDistanceMeters, 8);
  assert.equal(distanceKmText(s.totalDistanceMeters), '0.01');
  assert.equal(distanceKmText(0), '0');
  assert.equal(distanceKmText(4.9), '0');
  assert.equal(distanceKmText(5), '0.01');
  assert.equal(distanceKmText(1234), '1.23');
  assert.equal(distanceKmText(1235), '1.24');
  assert.equal(distanceKmText(1234567), '1,234.57');
});

test('empty or different member input cannot retain a previous members totals', () => {
  const first = summarizeHikingActivities([a(1, '2026-11-01T00:00:00Z', 9000, true)], NOW);
  const empty = summarizeHikingActivities([], NOW);
  assert.equal(first.statistics.totalHikeCount, 1);
  assert.equal(empty.statistics.totalHikeCount, 0);
  assert.equal(empty.statistics.monthlyHikeCount, 0);
  assert.equal(empty.statistics.totalDistanceMeters, 0);
  assert.equal(empty.statistics.completedMountainCount, 0);
  const second = summarizeHikingActivities([a(2, '2026-11-02T00:00:00Z', 2000)], NOW);
  assert.equal(second.statistics.totalDistanceMeters, 2000);
  assert.equal(second.statistics.completedHikeCount, 0);
});

test('invalid source data is an error instead of a misleading successful zero or partial sum', () => {
  const valid = a(1, '2026-11-01T00:00:00Z', 1000);
  for (const record of [
    { ...valid, distanceMeters: -1 },
    { ...valid, distanceMeters: NaN },
    { ...valid, distanceMeters: Infinity },
    { ...valid, startedAt: 'invalid' },
    { ...valid, completed: 'true' as unknown as boolean },
    { ...valid, mountainId: 0 },
    { ...valid, elapsedMs: -1 },
    { ...valid, elapsedMs: NaN },
    { ...valid, elapsedMs: Infinity },
  ])
    assert.throws(() => summarizeHikingActivities([valid, record], NOW));
});
