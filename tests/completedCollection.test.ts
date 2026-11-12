import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HikingActivity } from '../src/api.ts';
import {
  buildCompletedMountainCollection,
  completedHikeDate,
  summarizeCompletedHikes,
} from '../src/services/completedHikes.ts';
import { summarizeHikingActivities } from '../src/services/hikingStatistics.ts';
const activity = (
  id: number,
  mountainId: number,
  completed: boolean,
  startedAt = '2026-11-01T00:00:00Z',
): HikingActivity => ({
  id,
  mountainId,
  completed,
  startedAt,
  endedAt: startedAt,
  mountainName: '오래된 활동 산 이름',
  courseId: null,
  hikingDate: '1999-01-01',
  distanceMeters: 0,
  elapsedMs: 0,
  journalId: null,
  gpsValidationVersion: 1,
  scoring: { status: 'CERTIFIED', certificationDate: '2026-11-01', visitPoints: 200, summitPoints: completed ? 70 : 0, policyVersion: 'visit-general-or-verified-summit-multi-v2' },
});
const catalog = [
  { id: '1', name: 'DB 산 이름', city: '파주시', region: '북부권역' },
  { id: '2', name: '다른 산', city: '부천시', region: '서부권역' },
];

test('GPS-verified repeat summits enter the collection even under legacy DAILY_LIMIT', () => {
  const repeated = {
    ...activity(2, 1, true, '2026-11-02T00:00:00Z'),
    scoring: {
      status: 'DAILY_LIMIT' as const,
      certificationDate: '2026-11-02',
      visitPoints: 0,
      summitPoints: 0,
      policyVersion: 'v1',
    },
  };
  const summary = summarizeCompletedHikes([activity(1, 1, true), repeated, activity(3, 2, false)]);
  const collection = buildCompletedMountainCollection(catalog, summary.mountains);
  assert.equal(summary.count, 2);
  assert.equal(collection.items.length, 1);
  assert.equal(collection.items[0].completion.completedCount, 2);
  assert.equal(collection.items[0].completion.latestStartedAt, '2026-11-02T00:00:00Z');
});

test('only completed hikes determine the latest completed hike date', () => {
  const result = summarizeCompletedHikes([
    activity(1, 1, true),
    activity(2, 1, false, '2026-11-05T00:00:00Z'),
  ]);
  assert.equal(completedHikeDate(result.mountains.get('1')!.latestStartedAt), '2026.11.01');
});

test('cards use DB mountain ID/name/city; activity text and unrelated catalog entries cannot substitute', () => {
  const summary = summarizeCompletedHikes([activity(1, 1, true)]);
  const collection = buildCompletedMountainCollection(catalog, summary.mountains);
  assert.deepEqual(
    collection.items.map(({ id, name, city }) => ({ id, name, city })),
    [{ id: '1', name: 'DB 산 이름', city: '파주시' }],
  );
  assert.deepEqual(collection.missingIds, []);
});

test('catalog duplicates do not duplicate cards and missing DB metadata is reported without invented cards', () => {
  const summary = summarizeCompletedHikes([activity(1, 1, true), activity(2, 99, true)]);
  const collection = buildCompletedMountainCollection([...catalog, catalog[0]], summary.mountains);
  assert.equal(collection.items.length, 1);
  assert.deepEqual(collection.missingIds, ['99']);
});

test('empty and unfinished source stays empty without modifying favorite state or source data', () => {
  const favorites = ['1', '2'];
  const records = [activity(1, 1, false)];
  const before = JSON.stringify({ favorites, records, catalog });
  assert.equal(
    buildCompletedMountainCollection(catalog, summarizeCompletedHikes([]).mountains).items.length,
    0,
  );
  assert.equal(
    buildCompletedMountainCollection(catalog, summarizeCompletedHikes(records).mountains).items
      .length,
    0,
  );
  assert.equal(JSON.stringify({ favorites, records, catalog }), before);
});

test('completion dates use saved start instants in KST and do not invent missing dates', () => {
  assert.equal(completedHikeDate('2026-10-31T15:00:00Z'), '2026.11.01');
  assert.equal(completedHikeDate('2026-11-01T00:00:00+09:00'), '2026.11.01');
  assert.equal(completedHikeDate('2026-10-31T14:59:59Z'), '2026.10.31');
  assert.equal(completedHikeDate(null), null);
  assert.equal(completedHikeDate('invalid'), null);
});

test('collection and profile share completed counts and unique IDs regardless of activity order', () => {
  const records = [
    activity(1, 1, true, '2026-11-01T00:00:00Z'),
    activity(2, 1, true, '2026-11-02T00:00:00Z'),
    activity(3, 2, true),
    activity(4, 2, false),
  ];
  const profile = summarizeHikingActivities(records, Date.parse('2026-11-05T00:00:00Z'));
  const collection = buildCompletedMountainCollection(catalog, profile.completedMountains);
  assert.equal(collection.items.length, profile.statistics.completedMountainCount);
  assert.equal(
    collection.items.reduce((total, item) => total + item.completion.completedCount, 0),
    profile.statistics.completedHikeCount,
  );
  assert.deepEqual(
    buildCompletedMountainCollection(
      catalog,
      summarizeCompletedHikes([...records].reverse()).mountains,
    ),
    collection,
  );
});
