import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, type HikingActivityInput } from '../src/api.ts';
import {
  submitPendingActivity,
  confirmsSavedActivity,
  ActivitySaveFailure,
  describeSaveFailure,
} from '../src/components/hiking/services/activitySave.ts';

const input: HikingActivityInput = Object.freeze({
  clientRequestId: '6c6d4570-7615-4124-a698-4eca1e634919',
  mountainId: 1,
  courseId: 2,
  startedAt: '2026-11-04T01:00:00.000Z',
  endedAt: '2026-11-04T02:00:00.000Z',
  distanceMeters: 123.456,
  elapsedMs: 3600000,
  completed: true,
  gpsSegments: [],
});
const record = {
  ...input,
  id: 70,
  mountainName: '북한산',
  hikingDate: '2026-11-04',
  journalId: null,
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
async function mock(
  run: (posts: HikingActivityInput[]) => Promise<void>,
  reply: (init?: RequestInit) => Promise<Response> | Response,
  member = 1,
) {
  const original = globalThis.fetch;
  const posts: HikingActivityInput[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/api/csrf') return json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' });
    if (String(url) === '/api/users/me') return json({ userId: member });
    posts.push(JSON.parse(init?.body as string));
    return reply(init);
  };
  try {
    await run(posts);
  } finally {
    globalThis.fetch = original;
  }
}
const failure = (kind: string) => (err: unknown) =>
  err instanceof ActivitySaveFailure && err.kind === kind;

test('save confirmation checks the frozen request and accepts equivalent server timestamp formatting', () => {
  assert.ok(confirmsSavedActivity({ ...record, startedAt: '2026-11-04T01:00:00Z' }, input));
  for (const change of [
    { id: null },
    { mountainId: 9 },
    { courseId: 9 },
    { distanceMeters: 124 },
    { elapsedMs: 3 },
    { completed: null },
    { endedAt: '2026-11-04T02:00:01Z' },
    { journalId: -1 },
  ])
    assert.equal(confirmsSavedActivity({ ...record, ...change }, input), false);
  assert.equal(confirmsSavedActivity(undefined, input), false);
});
test('a lost response can retry the identical UUID and body and receive one existing activity', async () => {
  let count = 0;
  const stored = new Map();
  await mock(
    async (posts) => {
      await assert.rejects(submitPendingActivity(input, 1), failure('uncertain'));
      assert.equal((await submitPendingActivity(input, 1)).id, record.id);
      assert.deepEqual(posts, [input, input]);
      assert.equal(stored.size, 1);
    },
    () => {
      stored.set(input.clientRequestId, record);
      if (++count === 1) throw new TypeError('network disconnected after commit');
      return json(stored.get(input.clientRequestId));
    },
  );
});
test('conflicting UUID receives a conflict instead of a new request ID or false success', async () => {
  await mock(
    async (posts) => {
      await assert.rejects(submitPendingActivity(input, 1), failure('conflict'));
      assert.deepEqual(posts, [input]);
    },
    () => json({ message: 'different body' }, 409),
  );
});
test('server failures and malformed or mismatched success responses remain uncertain', async () => {
  for (const reply of [
    () => json({}, 503),
    () => new Response(null, { status: 204 }),
    () => new Response('not-json'),
  ])
    await mock(async () => {
      await assert.rejects(submitPendingActivity(input, 1), failure('uncertain'));
    }, reply);
});
test('authentication failure and a changed account never transmit an activity for the previous member', async () => {
  await mock(
    async (posts) => {
      await assert.rejects(submitPendingActivity(input, 1), failure('authentication'));
      assert.equal(posts.length, 0);
    },
    () => json(record),
    2,
  );
  await mock(
    async () => {
      await assert.rejects(submitPendingActivity(input, 1), failure('authentication'));
    },
    () => json({}, 403),
  );
});
test('account identity is checked after waiting for CSRF and before POST', async () => {
  const original = globalThis.fetch;
  let member = 1;
  const requests: string[] = [];
  globalThis.fetch = async (url) => {
    const path = String(url);
    requests.push(path);
    if (path === '/api/csrf') {
      member = 2;
      return json({ headerName: 'X-CSRF-TOKEN', token: 'new-session' });
    }
    return json({ userId: member });
  };
  try {
    await assert.rejects(submitPendingActivity(input, 1), failure('authentication'));
    assert.deepEqual(requests, ['/api/csrf', '/api/users/me']);
  } finally {
    globalThis.fetch = original;
  }
});
test('save timeout remains uncertain and aborts the request so retry can use the same input', async () => {
  let requestSignal: AbortSignal | null | undefined;
  await mock(
    async (posts) => {
      await assert.rejects(submitPendingActivity(input, 1, undefined, 5), failure('uncertain'));
      assert.ok(requestSignal?.aborted);
      assert.deepEqual(posts, [input]);
    },
    (init) => {
      requestSignal = init?.signal;
      return new Promise(() => {});
    },
  );
});
test('screen exit cancellation prevents a pending preflight from sending POST', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  let posts = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === '/api/csrf') {
      controller.abort();
      return json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' });
    }
    if (String(url) === '/api/users/me') return json({ userId: 1 });
    posts++;
    return json(record);
  };
  try {
    await assert.rejects(submitPendingActivity(input, 1, controller.signal), {
      name: 'AbortError',
    });
    assert.equal(posts, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test('distance/evidence rejection explains preservation without claiming legacy data loss', () => {
  const error = describeSaveFailure(new ApiError(400, 'GPS 경로와 제출 거리가 일치하지 않습니다.'));
  assert.equal(error.kind, 'rejected');
  assert.match(error.message, /거리/);
  assert.match(error.message, /보존/);
  assert.doesNotMatch(error.message, /유실/);
});

test('validation rejection is distinct from a retryable unknown outcome', async () => {
  await mock(
    async () => {
      await assert.rejects(submitPendingActivity(input, 1), failure('rejected'));
    },
    () => json({}, 400),
  );
  await mock(
    async () => {
      await assert.rejects(submitPendingActivity(input, 1), failure('uncertain'));
    },
    () => json({}, 429),
  );
});

test('server completion is authoritative and duplicate 409 is terminal', async () => {
  await mock(
    async () => {
      assert.equal((await submitPendingActivity(input, 1)).completed, false);
    },
    () => json({ ...record, completed: false }),
  );
  await mock(
    async (posts) => {
      await assert.rejects(
        submitPendingActivity(input, 1),
        (err) =>
          err instanceof ActivitySaveFailure &&
          err.kind === 'conflict' &&
          err.message.includes('이미'),
      );
      assert.equal(posts.length, 1);
    },
    () => json({ error: 'duplicate_hiking_activity', message: 'duplicate' }, 409),
  );
});
