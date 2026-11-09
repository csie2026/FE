import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, subscribeSessionExpiry } from '../src/api.ts';

const csrf = () => Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test-token' });

async function withFetch(
  reply: (path: string, init?: RequestInit) => Response | Promise<Response>,
  run: (paths: string[]) => Promise<void>,
) {
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    paths.push(String(input));
    return reply(String(input), init);
  };
  try {
    await run(paths);
  } finally {
    globalThis.fetch = original;
  }
}

test('조회·CSRF 조회·프로필 저장의 네트워크 실패를 한글로 안내하고 자동 재전송하지 않는다', async () => {
  for (const stage of ['read', 'csrf', 'write']) {
    await withFetch(
      (path) => {
        if (stage === 'write' && path === '/api/csrf') return csrf();
        throw new TypeError('Failed to fetch');
      },
      async (paths) => {
        const pending =
          stage === 'read'
            ? api('/api/users/me')
            : api('/api/users/me/profile', 'PATCH', { nickname: '등산객', birthYear: 2003 });
        await assert.rejects(
          pending,
          (error) =>
            error instanceof ApiError &&
            error.status === 0 &&
            error.code === 'network_error' &&
            error.message ===
              '서버에 연결할 수 없습니다. 네트워크 연결을 확인하고 다시 시도해주세요.',
        );
        assert.deepEqual(
          paths,
          stage === 'read'
            ? ['/api/users/me']
            : stage === 'csrf'
              ? ['/api/csrf']
              : ['/api/csrf', '/api/users/me/profile'],
        );
      },
    );
  }
});

test('서버 영문 오류와 HTML 오류 응답은 상태별 한글 안내로 바뀐다', async () => {
  const cases = [
    [400, /입력/],
    [401, /로그인/],
    [403, /권한/],
    [404, /찾을 수/],
    [405, /지원하지 않는 요청/],
    [408, /시간이 초과/],
    [409, /충돌/],
    [413, /용량/],
    [415, /형식/],
    [422, /입력/],
    [429, /너무 많/],
    [500, /다시 시도/],
    [502, /다시 시도/],
    [503, /다시 시도/],
    [504, /다시 시도/],
  ] as const;
  for (const [status, expected] of cases) {
    for (const html of [false, true]) {
      await withFetch(
        () =>
          html
            ? new Response('<html>Internal Server Error</html>', { status })
            : Response.json({ error: 'server_error', message: 'must not be null' }, { status }),
        async () => {
          await assert.rejects(
            api('/api/users/me'),
            (error) =>
              error instanceof ApiError && error.status === status && expected.test(error.message),
          );
        },
      );
    }
  }
});

test('서버의 한글 안내와 오류 코드는 충돌 처리를 위해 보존한다', async () => {
  const message = '이미 저장된 기록입니다. 기존 기록을 확인해주세요.';
  await withFetch(
    () => Response.json({ error: 'duplicate_hiking_activity', message }, { status: 409 }),
    async () => {
      await assert.rejects(
        api('/api/users/me/hiking-records'),
        (error) =>
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === 'duplicate_hiking_activity' &&
          error.message === message,
      );
    },
  );
});

test('비정상 오류 본문도 파싱 예외나 영문 문구 대신 원래 HTTP 상태의 한글 안내를 제공한다', async () => {
  for (const body of [
    null,
    [],
    'Internal Server Error',
    { message: 123 },
    { message: {} },
    { message: '' },
  ]) {
    await withFetch(
      () => Response.json(body, { status: 400 }),
      async () => {
        await assert.rejects(
          api('/api/users/me'),
          (error) =>
            error instanceof ApiError && error.status === 400 && /입력/.test(error.message),
        );
      },
    );
  }
});

test('CSRF 오류의 코드와 탈퇴 회원 식별 정보가 세션 만료 처리에 전달된다', async () => {
  const events: unknown[] = [];
  const unsubscribe = subscribeSessionExpiry((code, userId) => events.push({ code, userId }));
  try {
    await withFetch(
      () =>
        Response.json(
          { error: 'account_unavailable', message: 'Account unavailable', userId: 41 },
          { status: 401 },
        ),
      async (paths) => {
        await assert.rejects(
          api('/api/users/me/profile', 'PATCH', {}),
          (error) =>
            error instanceof ApiError &&
            error.status === 401 &&
            error.code === 'account_unavailable' &&
            /계정/.test(error.message),
        );
        assert.deepEqual(paths, ['/api/csrf']);
        assert.deepEqual(events, [{ code: 'account_unavailable', userId: 41 }]);
      },
    );
  } finally {
    unsubscribe();
  }
});

test('빈 401 응답도 인증 만료로 처리하고 네트워크 실패로 오인하지 않는다', async () => {
  let expired = 0;
  const unsubscribe = subscribeSessionExpiry(() => expired++);
  try {
    await withFetch(
      () => new Response(null, { status: 401 }),
      async () => {
        await assert.rejects(
          api('/api/users/me'),
          (error) =>
            error instanceof ApiError && error.status === 401 && /로그인/.test(error.message),
        );
        assert.equal(expired, 1);
      },
    );
  } finally {
    unsubscribe();
  }
});

test('정상 상태 코드여도 JSON이 손상되면 한글 오류를 반환하고 저장 성공으로 간주하지 않는다', async () => {
  for (const stage of ['csrf', 'write']) {
    await withFetch(
      (path) =>
        stage === 'write' && path === '/api/csrf'
          ? csrf()
          : new Response('<html>Unexpected response</html>', { status: 200 }),
      async (paths) => {
        await assert.rejects(
          api('/api/users/me/profile', 'PATCH', {}),
          (error) =>
            error instanceof ApiError &&
            error.status === 200 &&
            error.code === 'invalid_response' &&
            /응답/.test(error.message),
        );
        assert.equal(paths.length, stage === 'csrf' ? 1 : 2);
      },
    );
  }
});

test('CSRF 토큰이나 헤더가 누락·손상되면 계정 확인과 변경 요청을 전송하지 않는다', async () => {
  for (const body of [
    null,
    [],
    {},
    { headerName: 'X-CSRF-TOKEN' },
    { headerName: 'X-CSRF-TOKEN', token: ' ' },
    { headerName: 'X-CSRF-TOKEN', token: 123 },
    { headerName: 'bad\r\nheader', token: 'token' },
    { headerName: 'X-CSRF-TOKEN', token: 'bad\r\ntoken' },
  ]) {
    let beforeSend = 0;
    await withFetch(
      () => Response.json(body),
      async (paths) => {
        await assert.rejects(
          api('/api/users/me/profile', 'PATCH', {}, undefined, async () => {
            beforeSend++;
          }),
          (error) =>
            error instanceof ApiError &&
            error.code === 'invalid_csrf_response' &&
            /인증/.test(error.message),
        );
        assert.deepEqual(paths, ['/api/csrf']);
        assert.equal(beforeSend, 0);
      },
    );
  }
});

test('사용자 취소와 화면 이탈은 네트워크 오류로 바꾸지 않는다', async () => {
  for (const stage of ['read', 'csrf', 'body']) {
    const cancelled = new DOMException('The operation was aborted.', 'AbortError');
    await withFetch(
      () => {
        if (stage === 'body') {
          const response = Response.json({});
          response.json = async () => {
            throw cancelled;
          };
          return response;
        }
        throw cancelled;
      },
      async () => {
        await assert.rejects(
          api('/api/users/me', stage === 'csrf' ? 'PATCH' : 'GET'),
          (error) => error === cancelled && !(error instanceof ApiError),
        );
      },
    );
  }
});

test('시간 초과는 네트워크 단절이나 성공으로 처리하지 않고 한글로 안내한다', async () => {
  for (const stage of ['fetch', 'body']) {
    await withFetch(
      () => {
        const timeout = new DOMException('The operation timed out.', 'TimeoutError');
        if (stage === 'body') {
          const response = Response.json({});
          response.json = async () => {
            throw timeout;
          };
          return response;
        }
        throw timeout;
      },
      async () => {
        await assert.rejects(
          api('/api/users/me'),
          (error) =>
            error instanceof ApiError &&
            error.code === 'request_timeout' &&
            /시간이 초과/.test(error.message),
        );
      },
    );
  }
});

test('네트워크 복원 후 같은 프로필 값으로 수동 재시도할 수 있다', async () => {
  let offline = true;
  let savedBody: unknown;
  const input = { nickname: '등산객', birthYear: 2003 };
  await withFetch(
    (path, init) => {
      if (offline) throw new TypeError('Failed to fetch');
      if (path === '/api/csrf') return csrf();
      savedBody = JSON.parse(init!.body as string);
      return Response.json({ ...input, profileCompleted: true });
    },
    async (paths) => {
      await assert.rejects(api('/api/users/me/profile', 'PATCH', input));
      assert.deepEqual(input, { nickname: '등산객', birthYear: 2003 });
      offline = false;
      assert.deepEqual(await api('/api/users/me/profile', 'PATCH', input), {
        ...input,
        profileCompleted: true,
      });
      assert.deepEqual(savedBody, input);
      assert.deepEqual(paths, ['/api/csrf', '/api/csrf', '/api/users/me/profile']);
    },
  );
});

test('CSRF 토큰 거절은 권한 오류와 구분하고 한글 안내 및 오류 코드를 보존한다', async () => {
  await withFetch(
    () => Response.json({ error: 'invalid_csrf', message: 'Invalid CSRF token' }, { status: 403 }),
    async (paths) => {
      await assert.rejects(
        api('/api/users/me/profile', 'PATCH', {}),
        (error) =>
          error instanceof ApiError &&
          error.status === 403 &&
          error.code === 'invalid_csrf' &&
          /인증/.test(error.message),
      );
      assert.deepEqual(paths, ['/api/csrf']);
    },
  );
});
