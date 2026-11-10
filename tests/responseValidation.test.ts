import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, subscribeSessionExpiry } from '../src/api.ts';
import { getMonthlyGoals } from '../src/services/monthlyGoals.ts';
import { memberResponse, activityResponse, journalResponse, weatherResponse } from './fixtures.ts';

const mountain = {
  id: 1,
  name: 'Mountain',
  city: 'City',
  height: 0,
  lat: 37,
  lng: 127,
  courseCount: 0,
};
const course = {
  id: 2,
  mountainId: 1,
  name: 'Course',
  startName: 'Start',
  startLat: 37,
  startLng: 127,
  lengthKm: 0,
  upMin: 0,
  downMin: 0,
  difficulty: 'NORMAL',
  risk: null,
  source: 'FOREST',
};
const rank = { userId: 1, nickname: 'Member', profileImageUrl: null, score: 0, rank: 1 };
const hour = {
  time: '2026-11-10T06:00:00',
  temperature: null,
  sky: null,
  pty: null,
  pop: null,
  precipitationMm: 0,
  snowCm: 0,
  windSpeed: null,
  humidity: null,
};
const weather = weatherResponse(1, [
  { date: '2026-11-10', level: null, message: null, notes: [], hours: [hour] },
]);
const cases: [string, unknown][] = [
  ['/api/users/me', memberResponse()],
  ['/api/users/1/profile', { userId: 1, nickname: null, profileImageUrl: null, score: null }],
  ['/api/journals', [journalResponse()]],
  ['/api/users/me/journals', [journalResponse()]],
  ['/api/users/1/journals', [journalResponse()]],
  ['/api/journals/9', journalResponse({ hikingRecordId: null })],
  ['/api/users/me/hiking-records', [activityResponse()]],
  ['/api/rankings/summary', { members: [rank], mine: null, totalMembers: 1 }],
  ['/api/mountains', [mountain]],
  ['/api/mountains/1/courses', [course]],
  [
    '/api/courses/2',
    {
      course,
      path: [
        [127, 37],
        [127.01, 37.01],
      ],
    },
  ],
  ['/api/mountains/1/weather', weather],
  [
    '/api/users/me/monthly-goals/2026-11',
    { userId: 1, month: '2026-11', distanceKm: null, hikeCount: null },
  ],
];

async function withResponse(value: unknown, run: () => Promise<void>, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = async (path) =>
    path === '/api/csrf'
      ? Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' })
      : Response.json(value, { status });
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
const invalid = (cause: unknown) =>
  cause instanceof ApiError && cause.status === 200 && cause.code === 'invalid_response';

for (const [path, valid] of cases) {
  test(`${path}: real DTO permits nullable fields and zero values`, async () => {
    await withResponse(valid, async () => assert.deepEqual(await api(path), valid));
  });
  test(`${path}: null, empty object, missing fields and wrong types fail before rendering`, async () => {
    const malformed: unknown[] = [null, {}, false, 1, 'data'];
    const record = Array.isArray(valid) ? valid[0] : valid;
    for (const key of Object.keys(record as object)) {
      const missing = { ...(record as object) } as Record<string, unknown>;
      delete missing[key];
      // Optional metadata is intentionally compatible with older saved records.
      if (['provider', 'email', 'joinedAt', 'scoring', 'gpsValidationVersion'].includes(key))
        continue;
      malformed.push(Array.isArray(valid) ? [missing] : missing);
      const wrong = { ...(record as object), [key]: { invalid: true } };
      malformed.push(Array.isArray(valid) ? [wrong] : wrong);
      const original = (record as Record<string, unknown>)[key];
      if (
        typeof original === 'number' ||
        typeof original === 'boolean' ||
        typeof original === 'string'
      ) {
        const primitive = {
          ...(record as object),
          [key]: typeof original === 'string' ? 7 : String(original),
        };
        malformed.push(Array.isArray(valid) ? [primitive] : primitive);
      }
    }
    if (Array.isArray(valid)) malformed.push([null], [valid[0], null]);
    for (const payload of malformed)
      await withResponse(payload, async () => assert.rejects(api(path), invalid));
  });
}

test('empty lists remain successful; invalid lists never become successful zero totals', async () => {
  for (const [path, payload] of cases.filter(([, value]) => Array.isArray(value))) {
    await withResponse([], async () => assert.deepEqual(await api(path), []));
    await withResponse({ items: payload }, async () => assert.rejects(api(path), invalid));
  }
});

test('incomplete first-login member with null nickname and unknown personal fields remains valid', async () => {
  const first = memberResponse(1, {
    nickname: null,
    birthYear: null,
    age: null,
    score: null,
    profileCompleted: false,
  });
  await withResponse(first, async () => assert.deepEqual(await api('/api/users/me'), first));
});

test('nested weather, ranking, course and activity corruption fails before React receives it', async () => {
  const malformed: [string, unknown][] = [
    ['/api/rankings/summary', { members: [null], mine: null, totalMembers: 0 }],
    ['/api/rankings/summary', { members: [rank], mine: { ...rank, score: '0' }, totalMembers: 1 }],
    ['/api/mountains/1/weather', { ...weather, days: [null] }],
    [
      '/api/mountains/1/weather',
      weatherResponse(1, [
        { date: '2026-11-10', level: null, message: null, notes: [null as never], hours: [] },
      ]),
    ],
    [
      '/api/mountains/1/weather',
      weatherResponse(1, [
        {
          date: '2026-11-10',
          level: null,
          message: null,
          notes: [],
          hours: [{ ...hour, time: 6 as never }],
        },
      ]),
    ],
    ['/api/courses/2', { course, path: [null] }],
    ['/api/courses/2', { course, path: [['127', 37]] }],
    ['/api/users/me/hiking-records', [activityResponse({ completed: 'false' as never })]],
    ['/api/users/me/hiking-records', [activityResponse({ distanceMeters: '0' as never })]],
    ['/api/users/me/hiking-records', [activityResponse({ scoring: {} as never })]],
    ['/api/journals', [journalResponse({ hikingDate: '2026-02-30' })]],
  ];
  for (const [path, payload] of malformed)
    await withResponse(payload, async () => assert.rejects(api(path), invalid));
});

test('invalid DTO and JSON are not authentication expiry; real 401 still notifies', async () => {
  let expired = 0;
  const unsubscribe = subscribeSessionExpiry(() => {
    expired++;
  });
  const original = globalThis.fetch;
  try {
    await withResponse({}, async () => assert.rejects(api('/api/users/me'), invalid));
    globalThis.fetch = async () => new Response('{');
    await assert.rejects(api('/api/users/me'), invalid);
    assert.equal(expired, 0);
    await withResponse(
      {},
      async () =>
        assert.rejects(api('/api/users/me'), (e) => e instanceof ApiError && e.status === 401),
      401,
    );
    assert.equal(expired, 1);
  } finally {
    globalThis.fetch = original;
    unsubscribe();
  }
});

test('profile and journal write DTOs are checked without changing CSRF or success status', async () => {
  for (const [path, method] of [
    ['/api/users/me/profile', 'PATCH'],
    ['/api/journals', 'POST'],
    ['/api/journals/9', 'PATCH'],
  ])
    await withResponse({}, async () => assert.rejects(api(path, method, {}), invalid));
});

test('malformed monthly goal owner is invalid_response; a valid different owner keeps account guard', async () => {
  await withResponse(null, async () => assert.rejects(getMonthlyGoals(1, '2026-11'), invalid));
  await withResponse({ userId: 2, month: '2026-11', distanceKm: null, hikeCount: null }, async () =>
    assert.rejects(getMonthlyGoals(1, '2026-11'), (e) => e instanceof ApiError && e.status === 401),
  );
});
