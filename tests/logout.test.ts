import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, api, subscribeSessionExpiry } from '../src/api.ts';
import { createLogout } from '../src/services/logout.ts';

test('서버 응답 전에는 계정을 유지하고 중복 로그아웃을 보내지 않는다', async () => {
  let resolve!: () => void;
  let requests = 0;
  const events: string[] = [];
  const logout = createLogout({
    request: async () => {
      requests++;
      await new Promise<void>((done) => {
        resolve = done;
      });
    },
    onSuccess: () => events.push('계정 초기화'),
    onFailure: () => events.push('실패'),
    onPending: (pending) => events.push(`대기 ${pending}`),
  });
  const first = logout();
  await logout();
  assert.equal(requests, 1);
  assert.deepEqual(events, ['대기 true']);
  resolve();
  await first;
  assert.deepEqual(events, ['대기 true', '계정 초기화', '대기 false']);
});

test('서버 오류와 네트워크 오류는 계정을 지우지 않고 재시도할 수 있다', async () => {
  for (const failure of [
    new ApiError(500, '실패'),
    new ApiError(401, '만료'),
    new ApiError(403, '토큰'),
    new TypeError('네트워크'),
  ]) {
    let attempts = 0,
      successes = 0,
      failures = 0;
    const logout = createLogout({
      request: async () => {
        if (++attempts === 1) throw failure;
      },
      onSuccess: () => {
        successes++;
      },
      onFailure: () => {
        failures++;
      },
      onPending: () => {},
    });
    await logout();
    assert.equal(successes, 0);
    assert.equal(failures, 1);
    await logout();
    assert.equal(successes, 1);
    assert.equal(attempts, 2);
  }
});

test('로그아웃 응답 시간 초과는 실패로 처리하고 요청을 취소한다', async () => {
  let successes = 0,
    failures = 0;
  const logout = createLogout({
    timeoutMs: 5,
    request: (signal) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('시간 초과'))),
      ),
    onSuccess: () => {
      successes++;
    },
    onFailure: () => {
      failures++;
    },
    onPending: () => {},
  });
  await logout();
  assert.equal(successes, 0);
  assert.equal(failures, 1);
});

test('실제 로그아웃 API는 쿠키와 CSRF를 전달하고 204 확인 후 계정을 비운다', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.credentials, 'include');
    if (String(url) === '/api/csrf')
      return Response.json({ headerName: 'X-CSRF-TOKEN', token: '테스트' });
    assert.equal(init?.method, 'POST');
    assert.ok(init);
    assert.equal((init.headers as Record<string, string>)['X-CSRF-TOKEN'], '테스트');
    return new Response(null, { status: 204 });
  };
  try {
    const logout = createLogout({
      onPending: () => {},
      onSuccess: () => calls.push('계정 초기화'),
      onFailure: () => assert.fail('성공 응답'),
    });
    await logout();
    assert.deepEqual(calls, ['/api/csrf', '/api/logout', '계정 초기화']);
  } finally {
    globalThis.fetch = original;
  }
});

test('401은 화면 공통으로 세션 만료를 알리고 403과 로그아웃 실패는 구분한다', async () => {
  const original = globalThis.fetch;
  let expired = 0,
    status = 401;
  const unsubscribe = subscribeSessionExpiry(() => {
    expired++;
  });
  globalThis.fetch = async (url) =>
    String(url) === '/api/csrf'
      ? Response.json({ headerName: 'X-CSRF-TOKEN', token: '테스트' })
      : Response.json({ message: '거부' }, { status });
  try {
    await assert.rejects(api('/api/mountains'));
    assert.equal(expired, 1);
    status = 403;
    await assert.rejects(api('/api/users/me'));
    assert.equal(expired, 1);
    status = 401;
    await assert.rejects(api('/api/logout', 'POST'));
    assert.equal(expired, 1);
    globalThis.fetch = async () => Response.json({}, { status: 401 });
    await assert.rejects(api('/api/logout', 'POST'));
    assert.equal(expired, 1);
    await assert.rejects(api('/api/users/me/profile', 'PATCH', {}));
    assert.equal(expired, 2);
  } finally {
    unsubscribe();
    globalThis.fetch = original;
  }
});

test('이전 계정의 늦은 401은 새 계정 세션을 초기화하지 않는다', async () => {
  const original = globalThis.fetch;
  let resolve!: (response: Response) => void;
  let expired = 0;
  let unsubscribe = subscribeSessionExpiry(() => {
    expired++;
  });
  globalThis.fetch = () =>
    new Promise<Response>((done) => {
      resolve = done;
    });
  try {
    const pending = api('/api/users/me');
    unsubscribe();
    unsubscribe = subscribeSessionExpiry(() => {
      expired++;
    });
    resolve(Response.json({}, { status: 401 }));
    await assert.rejects(pending);
    assert.equal(expired, 0);
  } finally {
    unsubscribe();
    globalThis.fetch = original;
  }
});
