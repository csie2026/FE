import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/api.ts';
import {
  getMonthlyGoals,
  putMonthlyGoals,
  validGoals,
  goalProgress,
} from '../src/services/monthlyGoals.ts';
const response = (
  userId = 1,
  month = '2026-11',
  distanceKm: number | null = 10,
  hikeCount: number | null = 4,
) => ({ userId, month, distanceKm, hikeCount });

test('monthly goals read owner/month-scoped server data without legacy localStorage or cache', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), '/api/users/me/monthly-goals/2026-11');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.credentials, 'include');
    return Response.json(response());
  };
  try {
    assert.deepEqual(await getMonthlyGoals(1, '2026-11'), response());
  } finally {
    globalThis.fetch = original;
  }
});

test('goal save sends CSRF and rechecks account before PUT; independent targets and unset remain nullable', async () => {
  const original = globalThis.fetch;
  let putCount = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/api/csrf')
      return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' });
    if (String(url) === '/api/users/me') return Response.json({ userId: 1 });
    assert.equal(init?.method, 'PUT');
    assert.equal((init!.headers as Record<string, string>)['X-CSRF-TOKEN'], 'test');
    putCount++;
    const goals = JSON.parse(init!.body as string);
    return Response.json({ ...response(), ...goals });
  };
  try {
    for (const goals of [
      { distanceKm: 1.005, hikeCount: null },
      { distanceKm: null, hikeCount: 3 },
      { distanceKm: null, hikeCount: null },
    ])
      assert.deepEqual(await putMonthlyGoals(1, '2026-11', goals), { ...response(), ...goals });
    assert.equal(putCount, 3);
  } finally {
    globalThis.fetch = original;
  }
});

test('account change while waiting for CSRF blocks goal PUT rather than writing to another member', async () => {
  const original = globalThis.fetch;
  let puts = 0;
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'PUT') puts++;
    return String(url) === '/api/csrf'
      ? Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' })
      : Response.json({ userId: 2 });
  };
  try {
    await assert.rejects(
      putMonthlyGoals(1, '2026-11', { distanceKm: 10, hikeCount: 4 }),
      (e) => e instanceof ApiError && e.status === 401,
    );
    assert.equal(puts, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('responses for another member/month or malformed targets cannot become displayed goals', async () => {
  const original = globalThis.fetch;
  try {
    for (const data of [
      response(2),
      response(1, '2026-12'),
      { ...response(), distanceKm: '10' },
      { ...response(), hikeCount: -1 },
    ]) {
      globalThis.fetch = async () => Response.json(data);
      await assert.rejects(getMonthlyGoals(1, '2026-11'));
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('month requests and unset values are independent and failures stay distinct from no goals', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    Response.json(response(1, String(url).split('/').at(-1), null, null));
  try {
    assert.deepEqual(await getMonthlyGoals(1, '2026-12'), response(1, '2026-12', null, null));
    globalThis.fetch = async () => Response.json({ message: 'unavailable' }, { status: 500 });
    await assert.rejects(
      getMonthlyGoals(1, '2026-11'),
      (e) => e instanceof ApiError && e.status === 500,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('targets validate ranges, nullable checkboxes, distance precision and whole hike counts', () => {
  assert.ok(validGoals({ distanceKm: null, hikeCount: null }));
  assert.ok(validGoals({ distanceKm: 1.005, hikeCount: 1000 }));
  for (const goals of [
    { distanceKm: 0, hikeCount: 1 },
    { distanceKm: 1000.001, hikeCount: null },
    { distanceKm: 1.0001, hikeCount: null },
    { distanceKm: NaN, hikeCount: 1 },
    { distanceKm: 10, hikeCount: 1.5 },
    { distanceKm: null, hikeCount: 1001 },
  ])
    assert.equal(validGoals(goals), false);
});

test('goal progress uses actual unrounded GPS metrics and reaches 100 only at the true target', () => {
  assert.equal(goalProgress(2.75, 10), 28);
  assert.equal(goalProgress(3, 5), 60);
  assert.equal(goalProgress(0, 1), 0);
  assert.equal(goalProgress(0.9999, 1), 99);
  assert.equal(goalProgress(1, 1), 100);
  assert.equal(goalProgress(10, 1), 100);
  assert.equal(goalProgress(null, 10), null);
  assert.equal(goalProgress(1, null), null);
  assert.equal(goalProgress(1, 0), null);
});

test('goal read cancellation propagates without fabricating an empty target', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async (_url, init) =>
    new Promise((_resolve, reject) =>
      init!.signal!.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      ),
    );
  try {
    const pending = getMonthlyGoals(1, '2026-11', controller.signal);
    controller.abort();
    await assert.rejects(pending, (e: Error) => e.name === 'AbortError');
  } finally {
    globalThis.fetch = original;
  }
});
