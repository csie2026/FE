import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, API_TIMEOUT_MS, subscribeSessionExpiry } from '../src/api.ts';
import {
  updateProfile,
  isProfileAccountMismatch,
  PROFILE_ACCOUNT_CHANGED,
  ProfileSaveUnconfirmed,
  confirmProfileSave,
} from '../src/services/profileUpdate.ts';
import { createScopedRequest } from '../src/services/scopedRequest.ts';
import { memberResponse } from './fixtures.ts';

const input = (expectedUserId = 1) => ({ expectedUserId, nickname: 'Updated', birthYear: 2003 });
const csrf = () => Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test-token' });
const mismatch = (cause: unknown) =>
  isProfileAccountMismatch(cause) && cause.message.includes('계정');
async function withFetch(mock: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

for (const profileCompleted of [false, true]) {
  test(`profile snapshot, CSRF, account rechecks and normal save preserve initial-completion=${!profileCompleted}`, async () => {
    const paths: string[] = [];
    const snapshot = input();
    const token = deferred<Response>();
    let memberReads = 0;
    await withFetch(
      async (url, init) => {
        const path = String(url);
        paths.push(path);
        assert.equal(init?.credentials, 'include');
        assert.equal(init?.cache, 'no-store');
        if (path === '/api/csrf') return token.promise;
        if (path === '/api/users/me')
          return Response.json(
            memberResponse(1, { profileCompleted: memberReads++ ? true : profileCompleted }),
          );
        assert.equal(path, '/api/users/me/profile');
        assert.equal(init?.method, 'PATCH');
        assert.equal(new Headers(init?.headers).get('X-CSRF-TOKEN'), 'test-token');
        assert.deepEqual(JSON.parse(init!.body as string), input());
        return Response.json(
          memberResponse(1, { nickname: 'Updated', birthYear: 2003, profileCompleted: true }),
        );
      },
      async () => {
        const saving = updateProfile(snapshot, () => true);
        snapshot.expectedUserId = 2;
        snapshot.nickname = 'Another account';
        snapshot.birthYear = 2000;
        token.resolve(csrf());
        const saved = await saving;
        assert.equal(saved.userId, 1);
        assert.equal(saved.profileCompleted, true);
        assert.deepEqual(paths, [
          '/api/csrf',
          '/api/users/me',
          '/api/users/me/profile',
          '/api/users/me',
        ]);
      },
    );
  });
}

test('account changed before write rejects A input before sending PATCH', async () => {
  let patches = 0;
  await withFetch(
    async (url) => {
      if (String(url) === '/api/csrf') return csrf();
      if (String(url) === '/api/users/me') return Response.json(memberResponse(2));
      patches++;
      throw new Error('must not patch');
    },
    async () => {
      await assert.rejects(
        updateProfile(input(), () => true),
        mismatch,
      );
    },
  );
  assert.equal(patches, 0);
});

test('server 409 closes the gap after FE precheck and remains distinct from validation errors', async () => {
  await withFetch(
    async (url, init) => {
      if (String(url) === '/api/csrf') return csrf();
      if (String(url) === '/api/users/me') return Response.json(memberResponse(1));
      assert.equal(JSON.parse(init!.body as string).expectedUserId, 1);
      // 서버는 이제 B 계정의 세션을 사용한다. BE 통합 테스트에서 두 계정 모두 변경되지 않는지 검증한다.
      return Response.json(
        { error: 'profile_account_mismatch', message: PROFILE_ACCOUNT_CHANGED },
        { status: 409 },
      );
    },
    async () => {
      await assert.rejects(
        updateProfile(input(), () => true),
        mismatch,
      );
    },
  );
  assert.equal(
    isProfileAccountMismatch(new ApiError(400, '입력 오류', 'validation_failed')),
    false,
  );
  assert.equal(isProfileAccountMismatch(new ApiError(409, '다른 충돌', 'request_failed')), false);
});

test('B account discovered after delayed A save response prevents success callback', async () => {
  let memberReads = 0,
    successes = 0,
    failures = 0;
  await withFetch(
    async (url) => {
      if (String(url) === '/api/csrf') return csrf();
      if (String(url) === '/api/users/me')
        return Response.json(memberResponse(++memberReads === 1 ? 1 : 2));
      return Response.json(memberResponse(1));
    },
    async () => {
      await createScopedRequest().run(() => updateProfile(input(), () => true), {
        success: () => {
          successes++;
        },
        failure: (cause) => {
          assert.equal(isProfileAccountMismatch(cause), true);
          failures++;
        },
        settled: () => {},
      });
    },
  );
  assert.equal(successes, 0);
  assert.equal(failures, 1);
});

test('unexpected response member is rejected without applying it', async () => {
  await withFetch(
    async (url) => {
      if (String(url) === '/api/csrf') return csrf();
      return Response.json(memberResponse(String(url) === '/api/users/me' ? 1 : 2));
    },
    async () => {
      await assert.rejects(
        updateProfile(input(), () => true),
        mismatch,
      );
    },
  );
});

test('server input validation stays an ordinary error and never becomes account recovery', async () => {
  let reads = 0;
  const snapshot = input();
  await withFetch(
    async (url) => {
      if (String(url) === '/api/csrf') return csrf();
      if (String(url) === '/api/users/me') {
        reads++;
        return Response.json(memberResponse(1));
      }
      return Response.json(
        { error: 'validation_failed', message: '닉네임을 확인해주세요.' },
        { status: 400 },
      );
    },
    async () => {
      await assert.rejects(
        updateProfile(snapshot, () => true),
        (cause: unknown) => {
          assert.equal(isProfileAccountMismatch(cause), false);
          return (
            cause instanceof ApiError && cause.status === 400 && cause.code === 'validation_failed'
          );
        },
      );
    },
  );
  assert.deepEqual(snapshot, input());
  assert.equal(reads, 1);
});

test('late A response cannot update B scope or clear its pending state', async () => {
  const aResponse = deferred<Response>(),
    bResponse = deferred<Response>();
  const aStarted = deferred<void>(),
    bStarted = deferred<void>();
  const save = createScopedRequest();
  let activeMember = 1;
  const events: string[] = [];
  await withFetch(
    async (url, init) => {
      if (String(url) === '/api/csrf') return csrf();
      if (String(url) === '/api/users/me') return Response.json(memberResponse(activeMember));
      const id = JSON.parse(init!.body as string).expectedUserId;
      if (id === 1) {
        aStarted.resolve();
        return aResponse.promise;
      }
      bStarted.resolve();
      return bResponse.promise;
    },
    async () => {
      function start(id: number) {
        const current = save.capture();
        return save.run(() => updateProfile(input(id), () => current() && activeMember === id), {
          success: (user) => {
            events.push(`success:${user.userId}`);
          },
          failure: () => {
            events.push(`failure:${id}`);
          },
          settled: () => {
            events.push(`idle:${id}`);
          },
        });
      }
      const a = start(1);
      await aStarted.promise;
      activeMember = 2;
      save.invalidate();
      const b = start(2);
      await bStarted.promise;
      aResponse.resolve(Response.json(memberResponse(1)));
      await a;
      assert.deepEqual(events, []);
      bResponse.resolve(Response.json(memberResponse(2)));
      await b;
      assert.deepEqual(events, ['success:2', 'idle:2']);
    },
  );
});

test('duplicate clicks send only one profile write', async () => {
  const token = deferred<Response>();
  const save = createScopedRequest();
  let patches = 0;
  await withFetch(
    async (url) => {
      if (String(url) === '/api/csrf') return token.promise;
      if (String(url) === '/api/users/me/profile') patches++;
      return Response.json(memberResponse(1));
    },
    async () => {
      const handlers = {
        success: () => {},
        failure: (cause: unknown) => {
          throw cause;
        },
        settled: () => {},
      };
      const first = save.run(() => updateProfile(input(), () => true), handlers);
      assert.equal(await save.run(() => updateProfile(input(), () => true), handlers), false);
      token.resolve(csrf());
      await first;
      assert.equal(patches, 1);
    },
  );
});

test('expired session notifies expiry and never sends profile write', async () => {
  let notified = 0,
    patches = 0;
  const unsubscribe = subscribeSessionExpiry(() => {
    notified++;
  });
  try {
    await withFetch(
      async (url) => {
        if (String(url) === '/api/csrf') return csrf();
        if (String(url) === '/api/users/me')
          return Response.json({ error: 'unauthorized' }, { status: 401 });
        patches++;
        throw new Error('must not patch');
      },
      async () => {
        await assert.rejects(
          updateProfile(input(), () => true),
          (e: unknown) => e instanceof ApiError && e.status === 401,
        );
      },
    );
    assert.equal(notified, 1);
    assert.equal(patches, 0);
  } finally {
    unsubscribe();
  }
});

test('scope exit during CSRF prevents the account check and write', async () => {
  const token = deferred<Response>();
  let current = true,
    calls = 0;
  await withFetch(
    async () => {
      calls++;
      return token.promise;
    },
    async () => {
      const saving = updateProfile(input(), () => current);
      current = false;
      token.resolve(csrf());
      await assert.rejects(
        saving,
        (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
      );
      assert.equal(calls, 1);
    },
  );
});

for (const failure of ['network', 'server', 'invalid-response'] as const) {
  test(`confirmed PATCH with failed account recheck remains saved: ${failure}`, async () => {
    let reads = 0,
      patches = 0;
    await withFetch(
      async (url) => {
        if (String(url) === '/api/csrf') return csrf();
        if (String(url) === '/api/users/me/profile') {
          patches++;
          return Response.json(
            memberResponse(1, { nickname: 'Updated', birthYear: 2003, profileCompleted: true }),
          );
        }
        if (++reads === 1) return Response.json(memberResponse(1));
        if (failure === 'network') throw new TypeError('Failed to fetch');
        if (failure === 'server') return Response.json({}, { status: 503 });
        return Response.json({});
      },
      async () => {
        await assert.rejects(
          updateProfile(input(), () => true),
          (cause: unknown) => cause instanceof ProfileSaveUnconfirmed && cause.outcome === 'saved',
        );
      },
    );
    assert.equal(patches, 1);
    assert.equal(reads, 2);
  });
}

for (const failure of ['network', 'server', 'invalid-response'] as const) {
  test(`unconfirmed PATCH response never becomes saved: ${failure}`, async () => {
    let reads = 0;
    await withFetch(
      async (url) => {
        if (String(url) === '/api/csrf') return csrf();
        if (String(url) === '/api/users/me') {
          reads++;
          return Response.json(memberResponse(1));
        }
        if (failure === 'network') throw new TypeError('Failed to fetch');
        if (failure === 'server') return Response.json({}, { status: 503 });
        return Response.json({});
      },
      async () => {
        await assert.rejects(
          updateProfile(input(), () => true),
          (cause: unknown) =>
            cause instanceof ProfileSaveUnconfirmed && cause.outcome === 'unknown',
        );
      },
    );
    assert.equal(reads, 1);
  });
}

test('failure during preflight never claims that a PATCH was sent or saved', async () => {
  let patches = 0;
  await withFetch(
    async (url) => {
      if (String(url) === '/api/csrf') return csrf();
      if (String(url) === '/api/users/me') throw new TypeError('Failed to fetch');
      patches++;
      return Response.json(memberResponse(1));
    },
    async () => {
      await assert.rejects(
        updateProfile(input(), () => true),
        (cause: unknown) =>
          cause instanceof ApiError &&
          cause.code === 'network_error' &&
          !(cause instanceof ProfileSaveUnconfirmed),
      );
    },
  );
  assert.equal(patches, 0);
});

test('post-save 401 retains session-expiry handling rather than a successful pending result', async () => {
  let reads = 0,
    expired = 0;
  const unsubscribe = subscribeSessionExpiry(() => {
    expired++;
  });
  try {
    await withFetch(
      async (url) => {
        if (String(url) === '/api/csrf') return csrf();
        if (String(url) === '/api/users/me/profile') return Response.json(memberResponse(1));
        return ++reads === 1
          ? Response.json(memberResponse(1))
          : Response.json({}, { status: 401 });
      },
      async () => {
        await assert.rejects(
          updateProfile(input(), () => true),
          (cause: unknown) => cause instanceof ApiError && cause.status === 401,
        );
      },
    );
    assert.equal(expired, 1);
  } finally {
    unsubscribe();
  }
});

test('confirmation retries only GET and returns the latest same-account server values', async () => {
  const paths: string[] = [];
  let attempt = 0;
  const latest = memberResponse(1, {
    nickname: 'Latest server value',
    birthYear: 2001,
    profileCompleted: true,
  });
  await withFetch(
    async (url, options) => {
      paths.push(String(url));
      assert.equal(options?.method, 'GET');
      if (++attempt === 1) throw new TypeError('Failed to fetch');
      return Response.json(latest);
    },
    async () => {
      await assert.rejects(confirmProfileSave(1, () => true));
      assert.deepEqual(await confirmProfileSave(1, () => true), latest);
    },
  );
  assert.deepEqual(paths, ['/api/users/me', '/api/users/me']);
});

test('confirmation retry detects another account and discards late scoped responses', async () => {
  await withFetch(
    async () => Response.json(memberResponse(2)),
    async () => {
      await assert.rejects(
        confirmProfileSave(1, () => true),
        mismatch,
      );
    },
  );
  const response = deferred<Response>();
  let current = true;
  await withFetch(
    async () => response.promise,
    async () => {
      const confirming = confirmProfileSave(1, () => current);
      current = false;
      response.resolve(Response.json(memberResponse(1)));
      await assert.rejects(
        confirming,
        (cause: unknown) => cause instanceof DOMException && cause.name === 'AbortError',
      );
    },
  );
});

test('normal save returns fresh member values instead of the earlier PATCH response', async () => {
  let reads = 0;
  const latest = memberResponse(1, { nickname: 'Concurrent newer value', birthYear: 2002 });
  await withFetch(
    async (url) => {
      if (String(url) === '/api/csrf') return csrf();
      if (String(url) === '/api/users/me')
        return Response.json(++reads === 1 ? memberResponse(1) : latest);
      return Response.json(memberResponse(1, { nickname: 'Updated' }));
    },
    async () => {
      assert.deepEqual(await updateProfile(input(), () => true), latest);
    },
  );
});

for (const stage of ['patch', 'recheck'] as const) {
  test(`timeout at ${stage} preserves whether the save was confirmed`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const started = deferred<void>();
    let reads = 0;
    await withFetch(
      async (url) => {
        if (String(url) === '/api/csrf') return csrf();
        if (String(url) === '/api/users/me' && ++reads === 1)
          return Response.json(memberResponse(1));
        if (stage === 'recheck' && String(url) === '/api/users/me/profile')
          return Response.json(memberResponse(1));
        started.resolve();
        return new Promise<Response>(() => {});
      },
      async () => {
        const saving = updateProfile(input(), () => true);
        await started.promise;
        t.mock.timers.tick(API_TIMEOUT_MS);
        await assert.rejects(
          saving,
          (cause: unknown) =>
            cause instanceof ProfileSaveUnconfirmed &&
            cause.outcome === (stage === 'patch' ? 'unknown' : 'saved'),
        );
      },
    );
  });
}
