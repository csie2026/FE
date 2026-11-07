import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/api.ts';
import {
  loadMountainWeather,
  weatherError,
  forecastTime,
  weatherValue,
  skyText,
  precipitationText,
} from '../src/services/mountainWeather.ts';

test('weather uses real mountain ID and shares in-flight and cached requests', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (path, init) => {
    calls++;
    assert.equal(path, '/api/mountains/17001/weather');
    assert.equal(init?.credentials, 'include');
    return new Response(JSON.stringify({ mountainId: 17001, days: [] }));
  };
  try {
    const a = loadMountainWeather(17001);
    const b = loadMountainWeather(17001);
    assert.equal(a, b);
    assert.deepEqual((await a).days, []);
    await loadMountainWeather(17001);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('503 and 502 failures preserve status and allow a fresh retry', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [503, 502]) {
      const id = 17000 + status;
      globalThis.fetch = async () => new Response('{}', { status });
      await assert.rejects(
        loadMountainWeather(id),
        (cause) => cause instanceof ApiError && cause.status === status,
      );
      assert.match(weatherError(new ApiError(status, '')), status === 503 ? /준비되지/ : /기상청/);
      globalThis.fetch = async () => new Response(JSON.stringify({ mountainId: id, days: null }));
      assert.equal((await loadMountainWeather(id)).days, null);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('wrong mountain and malformed responses are rejected, not cached', async () => {
  const original = globalThis.fetch;
  try {
    for (const payload of [null, { mountainId: 1, days: [] }, { mountainId: 17002, days: {} }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(payload));
      await assert.rejects(loadMountainWeather(17002));
    }
    for (const id of [0, -1, NaN, 1.5]) await assert.rejects(loadMountainWeather(id));
  } finally {
    globalThis.fetch = original;
  }
});

test('different mountains and late responses keep their own data', async () => {
  const original = globalThis.fetch;
  let finish!: () => void;
  globalThis.fetch = async (path) => {
    const id = Number(String(path).split('/')[3]);
    if (id === 17003)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    return new Response(JSON.stringify({ mountainId: id, days: [] }));
  };
  try {
    const slow = loadMountainWeather(17003);
    assert.equal((await loadMountainWeather(17004)).mountainId, 17004);
    finish();
    assert.equal((await slow).mountainId, 17003);
  } finally {
    globalThis.fetch = original;
  }
});

test('cache expires and forecast labels keep Korea local time and missing values', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = originalNow();
  let calls = 0;
  Date.now = () => now;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ mountainId: 17005, days: [] }));
  };
  try {
    await loadMountainWeather(17005);
    now += 5 * 60 * 1000 + 1;
    await loadMountainWeather(17005);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
  assert.equal(forecastTime('2026-11-07T09:00:00'), '11/07 09:00');
  assert.equal(forecastTime(null), '시각 미제공');
  assert.equal(weatherValue(0, 'mm'), '0mm');
  assert.equal(weatherValue(null, '℃'), '미제공');
  assert.equal(weatherValue(NaN, '%'), '미제공');
  assert.equal(skyText(4), '흐림');
  assert.equal(skyText(null), '하늘 상태 미제공');
  assert.equal(precipitationText(2), '비/눈');
  assert.equal(precipitationText(undefined), '미제공');
});
