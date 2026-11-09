import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BackgroundLocationError,
  createBackgroundLocationClient,
  type BackgroundLocationPlugin,
  type LocationRuntime,
  type NativeLocationPage,
} from '../src/native/backgroundLocation.ts';

const key = { userId: 7, clientRequestId: '01975C29-22F8-4A90-BAAB-224E4279139C' };
const canonicalKey = { ...key, clientRequestId: key.clientRequestId.toLowerCase() };

function runtime(native: Partial<BackgroundLocationPlugin> = {}) {
  let registrations = 0;
  const bridge: LocationRuntime = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    isPluginAvailable: () => true,
    registerPlugin<T>(name: string): T {
      assert.equal(name, 'ToPeakBackgroundLocation');
      registrations++;
      return native as T;
    },
  };
  return { bridge, registrations: () => registrations };
}

function failsWith(code: string) {
  return (cause: unknown) => cause instanceof BackgroundLocationError && cause.code === code;
}

test('web and Android calls reject without registering or starting a native plugin', async () => {
  for (const platform of ['web', 'android']) {
    const environment = runtime();
    environment.bridge.getPlatform = () => platform;
    const client = createBackgroundLocationClient(environment.bridge);
    await assert.rejects(client.start(key), failsWith('UNSUPPORTED_PLATFORM'));
    assert.equal(environment.registrations(), 0);
  }
});

test('missing native registration is explicit and does not fall back to browser GPS', async () => {
  const environment = runtime();
  environment.bridge.isPluginAvailable = () => false;
  await assert.rejects(
    createBackgroundLocationClient(environment.bridge).getStatus(key),
    failsWith('PLUGIN_UNAVAILABLE'),
  );
  assert.equal(environment.registrations(), 0);
});

test('native calls preserve user and UUID identity and register only once', async () => {
  const calls: unknown[] = [];
  const status = {
    authorization: 'whenInUse' as const,
    servicesEnabled: true,
    precise: true,
    session: null,
  };
  const environment = runtime({
    start: async (options) => {
      calls.push(['start', options]);
      return status;
    },
    stop: async (options) => {
      calls.push(['stop', options]);
      return status;
    },
    getStatus: async (options) => {
      calls.push(['status', options]);
      return status;
    },
  });
  const client = createBackgroundLocationClient(environment.bridge);
  assert.equal(await client.start(key), status);
  await client.start(key);
  await client.stop(key);
  await client.stop(key);
  await client.getStatus(key);
  assert.deepEqual(calls, [
    ['start', canonicalKey],
    ['start', canonicalKey],
    ['stop', canonicalKey],
    ['stop', canonicalKey],
    ['status', canonicalKey],
  ]);
  assert.equal(environment.registrations(), 1);
  // This checks bridge calls, not native idempotency; the latter requires an iPhone test.
});

test('invalid identities and paging bounds never reach native storage', async () => {
  let calls = 0;
  const environment = runtime({
    readPoints: async () => {
      calls++;
      throw new Error('must not be reached');
    },
  });
  const client = createBackgroundLocationClient(environment.bridge);
  for (const options of [
    { ...key, userId: 0 },
    { ...key, userId: 1.5 },
    { ...key, userId: Number.MAX_SAFE_INTEGER + 1 },
    { ...key, clientRequestId: 'bad' },
    { ...key, afterSequence: -1 },
    { ...key, afterSequence: Infinity },
    { ...key, limit: 0 },
    { ...key, limit: 1001 },
    { ...key, limit: 1.5 },
  ]) {
    await assert.rejects(client.readPoints(options), failsWith('INVALID_ARGUMENT'));
  }
  assert.equal(calls, 0);
});

test('reading is repeatable, does not advance the caller cursor and preserves recorded times', async () => {
  const page: NativeLocationPage = {
    points: [
      {
        sequence: 42,
        timestamp: 1000,
        latitude: 37,
        longitude: 127,
        accuracy: 10,
        altitude: null,
        speed: null,
        segment: 0,
      },
    ],
    nextSequence: 42,
    hasMore: true,
  };
  const requests: unknown[] = [];
  const environment = runtime({
    readPoints: async (options) => {
      requests.push(options);
      return page;
    },
  });
  const client = createBackgroundLocationClient(environment.bridge);
  const options = { ...key, afterSequence: 41, limit: 1 };
  assert.equal(await client.readPoints(options), page);
  assert.equal(await client.readPoints(options), page);
  assert.equal(options.afterSequence, 41);
  assert.deepEqual(requests, [
    { ...canonicalKey, afterSequence: 41, limit: 1 },
    { ...canonicalKey, afterSequence: 41, limit: 1 },
  ]);
  await client.readPoints(key);
  assert.deepEqual(requests[2], { ...canonicalKey, afterSequence: 0, limit: 500 });
});

test('permission, service and storage failures remain distinguishable; unknown errors are wrapped', async () => {
  for (const code of [
    'PERMISSION_DENIED',
    'LOCATION_SERVICES_DISABLED',
    'STORAGE_ERROR',
    'SERVICE_INTERRUPTED',
  ]) {
    const nativeError = { code, message: 'native failure' };
    const environment = runtime({
      start: async () => {
        throw nativeError;
      },
    });
    await assert.rejects(createBackgroundLocationClient(environment.bridge).start(key), (cause) => {
      assert.ok(cause instanceof BackgroundLocationError);
      assert.equal(cause.code, code);
      assert.equal(cause.nativeCause, nativeError);
      return true;
    });
  }
  const environment = runtime({
    requestPermissions: async () => {
      throw null;
    },
  });
  await assert.rejects(
    createBackgroundLocationClient(environment.bridge).requestPermissions(),
    failsWith('NATIVE_ERROR'),
  );
});

test('explicit native pause/resume use the same normalized session key', async () => {
  const calls: unknown[] = [];
  const status = {
    authorization: 'whenInUse' as const,
    servicesEnabled: true,
    precise: true,
    session: null,
  };
  const environment = runtime({
    pause: async (options) => {
      calls.push(['pause', options]);
      return status;
    },
    resume: async (options) => {
      calls.push(['resume', options]);
      return status;
    },
  });
  const client = createBackgroundLocationClient(environment.bridge);
  await client.pause(key);
  await client.resume(key);
  assert.deepEqual(calls, [
    ['pause', canonicalKey],
    ['resume', canonicalKey],
  ]);
  assert.equal(environment.registrations(), 1);
});
