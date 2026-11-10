import { memberResponse } from './fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, api, subscribeSessionExpiry } from '../src/api.ts';
import { withdrawAccount } from '../src/services/withdrawal.ts';

async function mock(
  run: (calls: { path: string; init?: RequestInit }[]) => Promise<void>,
  reply: (path: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const original = globalThis.fetch,
    calls: { path: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    calls.push({ path, init });
    return reply(path, init);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}
const csrf = () => Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test-token' });
test('withdrawal requires explicit confirmation and a valid member before any request', async () => {
  await mock(
    async (calls) => {
      for (const [id, text] of [
        [0, '탈퇴'],
        [1, ''],
        [1, '탈퇴 '],
        [1.5, '탈퇴'],
      ] as const)
        await assert.rejects(withdrawAccount(id, text));
      assert.equal(calls.length, 0);
    },
    () => {
      throw Error('unexpected request');
    },
  );
});
test('withdrawal uses session CSRF, rechecks account and sends only explicit intent to self endpoint', async () => {
  await mock(
    async (calls) => {
      await withdrawAccount(41, '탈퇴');
      assert.deepEqual(
        calls.map((c) => c.path),
        ['/api/csrf', '/api/users/me', '/api/users/me'],
      );
      const request = calls[2].init!;
      assert.equal(request.method, 'DELETE');
      assert.equal(request.credentials, 'include');
      assert.equal(request.cache, 'no-store');
      assert.equal((request.headers as Record<string, string>)['X-CSRF-TOKEN'], 'test-token');
      assert.deepEqual(JSON.parse(request.body as string), {
        expectedUserId: 41,
        confirmation: '탈퇴',
      });
    },
    (path, init) =>
      path === '/api/csrf'
        ? csrf()
        : init?.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : Response.json(memberResponse(41)),
  );
});
test('account switch during CSRF never deletes the new account', async () => {
  await mock(
    async (calls) => {
      await assert.rejects(
        withdrawAccount(41, '탈퇴'),
        (e) => e instanceof ApiError && e.status === 409,
      );
      assert.equal(
        calls.some((c) => c.init?.method === 'DELETE'),
        false,
      );
    },
    (path) => (path === '/api/csrf' ? csrf() : Response.json(memberResponse(42))),
  );
});
test('CSRF failure and session expiry stop before destructive mutation', async () => {
  await mock(
    async (calls) => {
      await assert.rejects(
        withdrawAccount(41, '탈퇴'),
        (e) => e instanceof ApiError && e.status === 403,
      );
      assert.equal(calls.length, 1);
    },
    () => Response.json({ error: 'invalid_csrf' }, { status: 403 }),
  );
});
test('rejection and lost response remain errors rather than false completed withdrawal', async () => {
  for (const status of [400, 403, 409, 500]) {
    await mock(
      async () => {
        await assert.rejects(
          withdrawAccount(41, '탈퇴'),
          (e) => e instanceof ApiError && e.status === status,
        );
      },
      (path, init) =>
        path === '/api/csrf'
          ? csrf()
          : init?.method === 'DELETE'
            ? Response.json({ message: 'not completed' }, { status })
            : Response.json(memberResponse(41)),
    );
  }
  await mock(
    async () => {
      await assert.rejects(
        withdrawAccount(41, '탈퇴'),
        (error) =>
          error instanceof ApiError && error.status === 0 && error.code === 'network_error',
      );
    },
    (path, init) => {
      if (path === '/api/csrf') return csrf();
      if (init?.method === 'DELETE') throw TypeError('response lost');
      return Response.json(memberResponse(41));
    },
  );
});
test('unexpected successful JSON cannot confirm deletion', async () => {
  for (const body of [{}, null, { deleted: true }])
    await mock(
      async () => {
        await assert.rejects(withdrawAccount(41, '탈퇴'), /완료 응답/);
      },
      (path, init) =>
        path === '/api/csrf'
          ? csrf()
          : init?.method === 'DELETE'
            ? Response.json(body)
            : Response.json(memberResponse(41)),
    );
});
test('cancellation before send prevents DELETE', async () => {
  const controller = new AbortController();
  await mock(
    async (calls) => {
      await assert.rejects(withdrawAccount(41, '탈퇴', controller.signal), { name: 'AbortError' });
      assert.equal(
        calls.some((c) => c.init?.method === 'DELETE'),
        false,
      );
    },
    (path) => {
      if (path === '/api/csrf') {
        controller.abort();
        return csrf();
      }
      return Response.json(memberResponse(41));
    },
  );
});
test('revoked session identifies its retired owner on a fresh page while ordinary expiry does not', async () => {
  const events: unknown[] = [];
  const unsubscribe = subscribeSessionExpiry((code, userId) => events.push({ code, userId }));
  try {
    await mock(
      async () => {
        await assert.rejects(api('/api/users/me'));
      },
      () => Response.json({ error: 'account_unavailable', userId: 41 }, { status: 401 }),
    );
    await mock(
      async () => {
        await assert.rejects(api('/api/users/me'));
      },
      () => Response.json({ error: 'unauthorized' }, { status: 401 }),
    );
    assert.deepEqual(events, [
      { code: 'account_unavailable', userId: 41 },
      { code: 'unauthorized', userId: undefined },
    ]);
  } finally {
    unsubscribe();
  }
});
test('stale revoked-session response cannot clear a newly active account', async () => {
  let finish: ((response: Response) => void) | undefined;
  const events: string[] = [];
  const old = subscribeSessionExpiry(() => events.push('old'));
  await mock(
    async () => {
      const pending = api('/api/users/me');
      old();
      const current = subscribeSessionExpiry(() => events.push('new'));
      finish!(Response.json({ error: 'account_unavailable', userId: 41 }, { status: 401 }));
      try {
        await assert.rejects(pending);
        assert.deepEqual(events, []);
      } finally {
        current();
      }
    },
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
});
