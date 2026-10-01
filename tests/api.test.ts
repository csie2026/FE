import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, scoreText } from '../src/api.ts';

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
test('score distinguishes an uncalculated score from zero', () => {
  assert.equal(scoreText(null), '점수 미산정');
  assert.equal(scoreText(0), '0 P');
  assert.equal(scoreText(1250), '1,250 P');
});
