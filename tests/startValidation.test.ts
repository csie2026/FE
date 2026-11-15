import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  START_RADIUS_METERS,
  START_LOCATION_TIMEOUT_MS,
  validateStartPosition,
  acquireWebStartPosition,
  acquireNativeStartPosition,
  createStartGate,
} from '../src/components/hiking/services/startValidation.ts';
import { GPS_FILTER, SUMMIT_RADIUS_METERS } from '../src/components/hiking/config.ts';
import { distanceMeters } from '../src/components/hiking/trackUtils.ts';
import { createBackgroundLocationClient } from '../src/native/backgroundLocation.ts';
import type { GpsPoint } from '../src/components/hiking/types.ts';

const start = { lat: 0, lng: 0 };
const fix = (meters = 0, now = Date.now()): GpsPoint => ({
  lat: ((meters / 6_371_000) * 180) / Math.PI,
  lng: 0,
  latitude: ((meters / 6_371_000) * 180) / Math.PI,
  longitude: 0,
  accuracy: 50,
  timestamp: now,
  altitude: null,
  speed: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test('start radius has inclusive unrounded 49.999/50/50.001 boundaries, independent of summit radius', () => {
  const now = Date.now();
  assert.equal(START_RADIUS_METERS, 50);
  assert.equal(SUMMIT_RADIUS_METERS, 30);
  assert.deepEqual(GPS_FILTER, {
    maxAccuracyMeters: 50,
    minDistanceMeters: 5,
    maxSpeedMetersPerSecond: 8,
    maxSampleAgeMs: 15000,
    maxGapMs: 30000,
  });
  for (const m of [49.999, 50])
    assert.doesNotThrow(() => validateStartPosition(start, fix(m, now), now, now));
  assert.equal(distanceMeters(start, fix(50, now)), 50);
  assert.throws(() => validateStartPosition(start, fix(50.001, now), now, now), /50m/);
});

test('accuracy, timestamps and DB start coordinates fail closed without path fallback', () => {
  const now = Date.now();
  assert.doesNotThrow(() => validateStartPosition(start, fix(0, now), now, now));
  for (const changes of [
    { accuracy: 50.001 },
    { accuracy: -1 },
    { accuracy: NaN },
    { timestamp: now - 1 },
    { timestamp: now - 15001 },
    { timestamp: now + 1 },
    { lat: NaN },
    { lng: 181 },
  ])
    assert.throws(() => validateStartPosition(start, { ...fix(0, now), ...changes }, now, now));
  for (const bad of [null, undefined, { lat: NaN, lng: 0 }, { lat: 91, lng: 0 }])
    assert.throws(() => validateStartPosition(bad as never, fix(0, now), now, now));
});

test('one pending measurement admits one commit; duplicates create no extra session', async () => {
  const gate = createStartGate(),
    d = deferred<GpsPoint>();
  let commits = 0,
    requests = 0;
  const options = {
    startPoint: start,
    isCurrent: () => true,
    acquire: async () => {
      requests++;
      return d.promise;
    },
    commit: () => {
      commits++;
    },
  };
  const pending = gate.run(options);
  assert.equal(commits, 0);
  assert.equal(await gate.run(options), false);
  d.resolve(fix());
  assert.equal(await pending, true);
  assert.equal(requests, 1);
  assert.equal(commits, 1);
  assert.equal(gate.busy, false);
});

test('course/member/screen/recovery/state changes while awaiting GPS never commit', async () => {
  for (const reason of ['course', 'member', 'screen', 'recovery', 'state']) {
    const gate = createStartGate(),
      d = deferred<GpsPoint>();
    let current = true,
      commits = 0;
    const pending = gate.run({
      startPoint: start,
      isCurrent: () => current,
      acquire: () => d.promise,
      commit: () => {
        commits++;
      },
    });
    current = false;
    d.resolve(fix());
    assert.equal(await pending, false, reason);
    assert.equal(commits, 0, reason);
  }
});

test('cancellation rejects late callbacks and an older request cannot unlock a newer one', async () => {
  const gate = createStartGate(),
    old = deferred<GpsPoint>(),
    next = deferred<GpsPoint>();
  let commits = 0;
  const options = {
    startPoint: start,
    isCurrent: () => true,
    commit: () => {
      commits++;
    },
  };
  const pending = gate.run({ ...options, acquire: () => old.promise });
  gate.cancel();
  const replacement = gate.run({ ...options, acquire: () => next.promise });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(gate.busy, true);
  old.resolve(fix());
  next.resolve(fix());
  assert.equal(await replacement, true);
  assert.equal(commits, 1);
});

test('denial, timeout and invalid fixes cannot run UUID/draft/timer/native-start creation', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  for (const acquire of [
    async () => {
      throw Error('permission denied');
    },
    async () => fix(51),
    async () => ({ ...fix(), accuracy: 51 }),
    async () => fix(0, 1),
  ]) {
    let sideEffects = 0;
    const gate = createStartGate();
    await assert.rejects(
      gate.run({
        startPoint: start,
        isCurrent: () => true,
        acquire,
        commit: () => {
          sideEffects++;
        },
      }),
    );
    assert.equal(sideEffects, 0);
    assert.equal(gate.busy, false);
  }
  const gate = createStartGate();
  let commits = 0;
  const pending = gate.run({
    startPoint: start,
    isCurrent: () => true,
    acquire: () => new Promise(() => {}),
    commit: () => {
      commits++;
    },
  });
  t.mock.timers.tick(START_LOCATION_TIMEOUT_MS);
  await assert.rejects(pending, /시간/);
  assert.equal(commits, 0);
  assert.equal(gate.busy, false);
});

test('web performs a new uncached measurement, maps errors and ignores callbacks after cancel', async () => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const secure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
  let success!: PositionCallback, failure!: PositionErrorCallback;
  let options: PositionOptions | undefined;
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: (s: PositionCallback, e: PositionErrorCallback, o: PositionOptions) => {
          success = s;
          failure = e;
          options = o;
        },
      },
    },
  });
  try {
    const controller = new AbortController();
    const pending = acquireWebStartPosition(controller.signal);
    assert.deepEqual(options, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    success({
      coords: { latitude: 0, longitude: 0, accuracy: 1, altitude: null, speed: null },
      timestamp: Date.now(),
    } as GeolocationPosition);
    for (const [code, message] of [
      [1, /권한/],
      [2, /위치/],
      [3, /시간/],
    ] as const) {
      const failed = acquireWebStartPosition(new AbortController().signal);
      failure({ code } as GeolocationPositionError);
      await assert.rejects(failed, message);
    }
    const valid = acquireWebStartPosition(new AbortController().signal);
    success({
      coords: { latitude: 1, longitude: 2, accuracy: 3, altitude: null, speed: null },
      timestamp: Date.now(),
    } as GeolocationPosition);
    assert.equal((await valid).lat, 1);
  } finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav);
    else Reflect.deleteProperty(globalThis, 'navigator');
    if (secure) Object.defineProperty(globalThis, 'isSecureContext', secure);
    else Reflect.deleteProperty(globalThis, 'isSecureContext');
  }
});

test('native preflight calls only the one-shot bridge; never tracking start or readPoints', async () => {
  const gate = createStartGate(),
    d = deferred<{ lat: number; lng: number; accuracy: number; timestamp: number }>();
  let trackingStarts = 0;
  const pending = gate.run({
    startPoint: start,
    isCurrent: () => true,
    acquire: (signal) => acquireNativeStartPosition({ getStartPosition: () => d.promise }, signal),
    commit: () => {
      trackingStarts++;
    },
  });
  assert.equal(trackingStarts, 0);
  d.resolve(fix());
  await pending;
  assert.equal(trackingStarts, 1);
  await assert.rejects(
    acquireNativeStartPosition(
      {
        getStartPosition: async () => {
          throw { code: 'PERMISSION_DENIED' };
        },
      },
      new AbortController().signal,
    ),
    /권한/,
  );
});

test('web measurement timeout and synchronous denial both release the pending request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const secure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  const geo = { getCurrentPosition: () => {} };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { geolocation: geo },
  });
  try {
    const pending = acquireWebStartPosition(new AbortController().signal);
    t.mock.timers.tick(START_LOCATION_TIMEOUT_MS);
    await assert.rejects(pending, /시간/);
    geo.getCurrentPosition = () => {
      throw { code: 1 };
    };
    await assert.rejects(acquireWebStartPosition(new AbortController().signal), /권한/);
  } finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav);
    else Reflect.deleteProperty(globalThis, 'navigator');
    if (secure) Object.defineProperty(globalThis, 'isSecureContext', secure);
    else Reflect.deleteProperty(globalThis, 'isSecureContext');
  }
});

test('actual native client forwards one-shot fixes and timeout errors, without any session key or tracking call', async () => {
  let measurements = 0;
  const plugin = {
    getStartPosition: async () => {
      measurements++;
      return fix();
    },
  };
  const client = createBackgroundLocationClient({
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    isPluginAvailable: () => true,
    registerPlugin: <T>() => plugin as T,
  });
  assert.equal(
    (await acquireNativeStartPosition(client, new AbortController().signal)).accuracy,
    50,
  );
  assert.equal(measurements, 1);
  plugin.getStartPosition = async () => {
    throw { code: 'TIMEOUT' };
  };
  await assert.rejects(acquireNativeStartPosition(client, new AbortController().signal), /시간/);
});

test('start gate is wired only before new-session creation; resume and recovery keep their own entry points', () => {
  const hook = readFileSync(
    new URL('../src/components/hiking/hooks/useHikingSession.ts', import.meta.url),
    'utf8',
  );
  const resume = hook.slice(hook.indexOf('const resume ='), hook.indexOf('const complete ='));
  assert.doesNotMatch(resume, /startGate|StartPosition|validateStart/);
  const page = readFileSync(
    new URL('../src/components/hiking/HikingPage.tsx', import.meta.url),
    'utf8',
  );
  const restore = page.slice(
    page.indexOf('const restore ='),
    page.indexOf('const autoRestoreAttempted'),
  );
  assert.doesNotMatch(restore, /startGate|StartPosition|validateStart/);
  assert.ok(
    hook.indexOf('await startGate.run') < hook.indexOf('clientRequestId: crypto.randomUUID()'),
  );
  const plugin = readFileSync(
    new URL('../native/ios/BackgroundLocationPlugin.swift', import.meta.url),
    'utf8',
  );
  const oneShot = plugin.slice(plugin.indexOf('private final class StartLocationRequest'));
  assert.doesNotMatch(oneShot, /LocationStore|database|\.start\(|\.resume\(/);
  assert.match(oneShot, /manager.requestLocation\(\)/);
});
