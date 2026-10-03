import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, deleteJournal, getJournal, scoreText } from '../src/api.ts';

test('profile write sends session cookies and server CSRF token', async () => {
  const original = globalThis.fetch;
  const calls: [string, RequestInit | undefined][] = [];
  globalThis.fetch = async (input, init) => {
    calls.push([String(input), init]);
    return new Response(
      JSON.stringify(
        calls.length === 1
          ? { headerName: 'X-CSRF-TOKEN', token: 'csrf' }
          : { profileCompleted: true },
      ),
      { status: 200 },
    );
  };
  try {
    const result = await api<{ profileCompleted: boolean }>('/api/users/me/profile', 'PATCH', {
      nickname: 'user',
      birthYear: 2003,
    });
    assert.equal(result.profileCompleted, true);
    assert.equal(calls[0][0], '/api/csrf');
    const write = calls[1][1];
    assert.ok(write);
    assert.equal(write.credentials, 'include');
    assert.equal((write.headers as Record<string, string>)['X-CSRF-TOKEN'], 'csrf');
    assert.deepEqual(JSON.parse(write.body as string), { nickname: 'user', birthYear: 2003 });
  } finally {
    globalThis.fetch = original;
  }
});
test('unauthorized session and validation errors retain HTTP status', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 400, 403]) {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ message: 'failed' }), { status });
      await assert.rejects(
        api('/api/users/me'),
        (e) => e instanceof ApiError && e.status === status && e.message === 'failed',
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
test('logout accepts an empty response and uses CSRF', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input) === '/api/csrf'
      ? new Response(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      : new Response(null, { status: 204 });
  try {
    assert.equal(await api('/api/logout', 'POST'), undefined);
  } finally {
    globalThis.fetch = original;
  }
});
test('journal deletion sends DELETE with session and CSRF and accepts no content', async () => {
  const original = globalThis.fetch;
  const calls: [string, RequestInit | undefined][] = [];
  globalThis.fetch = async (input, init) => {
    calls.push([String(input), init]);
    return String(input) === '/api/csrf'
      ? new Response(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      : new Response(null, { status: 204 });
  };
  try {
    assert.equal(await deleteJournal(42), undefined);
    assert.equal(calls[1][0], '/api/journals/42');
    const deletion = calls[1][1];
    assert.ok(deletion);
    assert.equal(deletion.method, 'DELETE');
    assert.equal(deletion.credentials, 'include');
    assert.equal((deletion.headers as Record<string, string>)['X-CSRF-TOKEN'], 'csrf');
    assert.equal(deletion.body, undefined);
  } finally {
    globalThis.fetch = original;
  }
});
test('failed journal deletion preserves the server error', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input) === '/api/csrf'
      ? new Response(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }))
      : new Response(JSON.stringify({ message: '삭제 요청 실패' }), { status: 404 });
  try {
    await assert.rejects(deleteJournal(42), (cause) =>
      cause instanceof ApiError && cause.status === 404 && cause.message === '삭제 요청 실패');
  } finally {
    globalThis.fetch = original;
  }
});
test('journal detail fetches the full record with session credentials', async () => {
  const original = globalThis.fetch;
  const journal = { id: 42, userId: 7, nickname: '작성자', mountainName: '소래산', title: '산행', content: '첫째 줄\n둘째 줄', hikingDate: '2020-01-01', isPublic: false };
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), '/api/journals/42');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.credentials, 'include');
    return new Response(JSON.stringify(journal));
  };
  try {
    assert.deepEqual(await getJournal(42), journal);
  } finally {
    globalThis.fetch = original;
  }
});
test('inaccessible journal detail preserves the server rejection', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: '조회할 수 없습니다.' }), { status: 404 });
  try {
    await assert.rejects(getJournal(42), (cause) => cause instanceof ApiError && cause.status === 404);
  } finally {
    globalThis.fetch = original;
  }
});
test('score distinguishes an uncalculated score from zero', () => {
  assert.equal(scoreText(null), '점수 미산정');
  assert.equal(scoreText(0), '0 P');
  assert.equal(scoreText(1250), '1,250 P');
});
