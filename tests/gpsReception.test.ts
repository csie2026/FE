import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gpsReception,
  gpsReceptionWarning,
} from '../src/components/hiking/services/gpsReception.ts';
import { GPS_FILTER } from '../src/components/hiking/config.ts';
import { acceptTrackPoint } from '../src/components/hiking/trackUtils.ts';
import type { GpsPoint } from '../src/components/hiking/types.ts';

test('a recent successful GPS callback reports receiving without a warning', () => {
  assert.equal(gpsReception(1000, 2000, 3000), 'receiving');
  assert.equal(gpsReceptionWarning('TRACKING', 'receiving'), null);
});

test('first GPS reception waits, then warns even if no success callback ever arrives', () => {
  assert.equal(gpsReception(null, null, 1000), 'waiting');
  assert.equal(gpsReception(1000, null, 1001), 'waiting');
  assert.match(gpsReceptionWarning('TRACKING', 'waiting')!, /첫 GPS/);
  assert.equal(gpsReception(1000, null, 1000 + GPS_FILTER.maxSampleAgeMs), 'stale');
});

test('silence becomes stale at exactly fifteen seconds and instructs the user', () => {
  assert.equal(gpsReception(1000, 2000, 16999), 'receiving');
  assert.equal(gpsReception(1000, 2000, 17000), 'stale');
  assert.equal(gpsReception(1000, 2000, 30000), 'stale');
  const warning = gpsReceptionWarning('TRACKING', 'stale')!;
  assert.match(warning, /새 GPS 경로가 기록되지 않고 있습니다/);
  assert.match(warning, /위치 다시 확인/);
  assert.match(warning, /활동 시간은 계속/);
});

test('a new reception clears the stale warning', () => {
  assert.equal(gpsReception(1000, 2000, 30000), 'stale');
  const resumed = gpsReception(1000, 30000, 30000);
  assert.equal(resumed, 'receiving');
  assert.equal(gpsReceptionWarning('TRACKING', resumed), null);
});

test('stationary samples refresh reception even when route filtering rejects movement', () => {
  const now = Date.now();
  const previous: GpsPoint = {
    lat: 37,
    lng: 127,
    latitude: 37,
    longitude: 127,
    accuracy: 10,
    timestamp: now - 1000,
    altitude: null,
    speed: null,
  };
  const stationary = { ...previous, timestamp: now };
  assert.equal(acceptTrackPoint(stationary, previous), false);
  assert.equal(gpsReception(now - 60000, now, now), 'receiving');
});

test('paused, ready and completed sessions do not show an active recording warning', () => {
  for (const state of ['PAUSED', 'READY', 'COMPLETED'] as const) {
    assert.equal(gpsReceptionWarning(state, 'stale'), null);
    assert.equal(gpsReceptionWarning(state, 'waiting'), null);
  }
  assert.notEqual(gpsReceptionWarning('TRACKING', 'stale'), null);
});
