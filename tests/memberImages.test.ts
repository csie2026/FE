import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, uploadMemberImage, deleteMemberImage } from '../src/api.ts';
const member = (profileImageUrl: string | null = '/api/users/me/images/profile?v=new') => ({
  userId: 1,
  nickname: '이미지 검증',
  profileCompleted: true,
  score: 0,
  profileImageUrl,
  backgroundImageUrl: null,
  birthYear: 2003,
  age: 23,
});
const image = () => new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' });

test('existing upload API keeps multipart and CSRF while checking expected member before mutation', async () => {
  const original = globalThis.fetch,
    calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url) === '/api/csrf')
      return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' });
    if (String(url) === '/api/users/me') return Response.json(member());
    assert.equal(init?.method, 'PUT');
    assert.ok(init!.body instanceof FormData);
    assert.equal((init!.headers as Record<string, string>)['X-CSRF-TOKEN'], 'test');
    assert.equal((init!.headers as Record<string, string>)['Content-Type'], undefined);
    return Response.json(member());
  };
  try {
    assert.deepEqual(await uploadMemberImage('profile', image(), undefined, 1), member());
    assert.deepEqual(calls, ['/api/csrf', '/api/users/me', '/api/users/me/images/profile']);
  } finally {
    globalThis.fetch = original;
  }
});
test('image delete fetches latest OAuth fallback rather than returning the removed revision', async () => {
  const original = globalThis.fetch;
  let deleted = false;
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/api/csrf')
      return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' });
    if (init?.method === 'DELETE') {
      deleted = true;
      return new Response(null, { status: 204 });
    }
    return Response.json(
      member(deleted ? 'https://example.invalid/oauth.png' : '/api/users/me/images/profile?v=old'),
    );
  };
  try {
    assert.equal(
      (await deleteMemberImage('profile', undefined, 1)).profileImageUrl,
      'https://example.invalid/oauth.png',
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('changed session blocks upload and delete before either can affect the new account', async () => {
  const original = globalThis.fetch;
  let mutations = 0;
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'PUT' || init?.method === 'DELETE') mutations++;
    return String(url) === '/api/csrf'
      ? Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' })
      : Response.json({ ...member(), userId: 2 });
  };
  try {
    await assert.rejects(
      uploadMemberImage('profile', image(), undefined, 1),
      (e) => e instanceof ApiError && e.status === 401,
    );
    await assert.rejects(
      deleteMemberImage('profile', undefined, 1),
      (e) => e instanceof ApiError && e.status === 401,
    );
    assert.equal(mutations, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test('image response for another account never becomes current member image state', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url) === '/api/csrf'
      ? Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' })
      : String(url) === '/api/users/me'
        ? Response.json(member())
        : Response.json({ ...member(), userId: 2 });
  try {
    await assert.rejects(
      uploadMemberImage('profile', image(), undefined, 1),
      (e) => e instanceof ApiError && e.status === 401,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('background keeps the existing private upload/delete route and null deletion state', async () => {
  const original = globalThis.fetch;
  const routes: string[] = [];
  globalThis.fetch = async (url, init) => {
    routes.push(String(url));
    if (String(url) === '/api/csrf')
      return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' });
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json(member(null));
  };
  try {
    await uploadMemberImage('background', image(), undefined, 1);
    const result = await deleteMemberImage('background', undefined, 1);
    assert.equal(result.backgroundImageUrl, null);
    assert.ok(routes.includes('/api/users/me/images/background'));
    assert.ok(!routes.some((url) => /users\/\d+\/images/.test(url)));
  } finally {
    globalThis.fetch = original;
  }
});
test('upload limits and server failures remain errors rather than false image-change success', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [400, 401, 413, 500]) {
      globalThis.fetch = async (url) =>
        String(url) === '/api/csrf'
          ? Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' })
          : String(url) === '/api/users/me'
            ? Response.json(member())
            : Response.json({ message: 'image rejected' }, { status });
      await assert.rejects(
        uploadMemberImage('profile', image(), undefined, 1),
        (e) => e instanceof ApiError && e.status === status,
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
