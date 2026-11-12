import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, type PublicProfileDetails } from '../src/api.ts';
import { getPublicProfileView, getPublicProfileSummary } from '../src/services/publicProfile.ts';
import { journalResponse } from './fixtures.ts';

const profile = (overrides: Partial<PublicProfileDetails> = {}): PublicProfileDetails => ({
  userId: 7,
  nickname: 'Writer',
  profileImageUrl: null,
  score: null,
  totalHikeCount: 3,
  completedHikeCount: 2,
  ...overrides,
});
const invalid = (error: unknown) => error instanceof ApiError && error.code === 'invalid_response';

async function withFetch(mock: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('public profile uses authenticated public APIs and shows saved GPS totals independently of journal count', async () => {
  const paths: string[] = [];
  const entry = journalResponse({ userId: 7, isPublic: true });
  await withFetch(
    async (path, options) => {
      paths.push(String(path));
      assert.equal(options?.credentials, 'include');
      assert.equal(options?.cache, 'no-store');
      return Response.json(String(path).endsWith('/profile') ? profile() : [entry]);
    },
    async () => {
      assert.deepEqual(await getPublicProfileView(7), { profile: profile(), journals: [entry] });
      assert.deepEqual(paths.sort(), ['/api/users/7/journals', '/api/users/7/profile']);
    },
  );
});

test('empty public journals do not erase hiking totals and null score remains distinct from zero', async () => {
  let score: number | null = null;
  await withFetch(
    async (path) => Response.json(String(path).endsWith('/profile') ? profile({ score }) : []),
    async () => {
      const first = await getPublicProfileView(7);
      assert.equal(first.profile.totalHikeCount, 3);
      assert.equal(first.profile.score, null);
      score = 0;
      const next = await getPublicProfileView(7);
      assert.equal(next.profile.score, 0);
      assert.deepEqual(next.journals, []);
    },
  );
});

test('missing, coerced, negative, noninteger and inconsistent counts fail instead of displaying zero', async () => {
  for (const key of ['totalHikeCount', 'completedHikeCount']) {
    for (const value of [undefined, null, '0', -1, 1.5]) {
      await withFetch(
        async (path) =>
          Response.json(String(path).endsWith('/profile') ? { ...profile(), [key]: value } : []),
        async () => {
          await assert.rejects(getPublicProfileView(7), invalid);
        },
      );
    }
  }
  await withFetch(
    async (path) =>
      Response.json(
        String(path).endsWith('/profile')
          ? profile({ totalHikeCount: 1, completedHikeCount: 2 })
          : [],
      ),
    async () => {
      await assert.rejects(getPublicProfileView(7), invalid);
    },
  );
});

test('another member profile, foreign journals and private journals are rejected before rendering', async () => {
  for (const [member, journals] of [
    [profile({ userId: 8 }), []],
    [profile(), [journalResponse({ userId: 8, isPublic: true })]],
    [profile(), [journalResponse({ userId: 7, isPublic: false })]],
  ] as const) {
    await withFetch(
      async (path) => Response.json(String(path).endsWith('/profile') ? member : journals),
      async () => {
        await assert.rejects(getPublicProfileView(7), invalid);
      },
    );
  }
});

test('invalid profile identifiers never request any API', async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls++;
      throw new Error('must not request');
    },
    async () => {
      for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
        await assert.rejects(
          getPublicProfileView(id),
          (error: unknown) => error instanceof ApiError && error.status === 400,
        );
      assert.equal(calls, 0);
    },
  );
});

test('missing profile, expired session and one failed public-journal request never become empty successful profiles', async () => {
  for (const status of [401, 403, 404, 500]) {
    await withFetch(
      async (path) =>
        String(path).endsWith('/profile')
          ? Response.json({ message: 'Unavailable' }, { status })
          : Response.json([]),
      async () => {
        await assert.rejects(
          getPublicProfileView(7),
          (error: unknown) => error instanceof ApiError && error.status === status,
        );
      },
    );
  }
  await withFetch(
    async (path) =>
      String(path).endsWith('/profile')
        ? Response.json(profile())
        : Response.json({ message: 'Unavailable' }, { status: 500 }),
    async () => {
      await assert.rejects(
        getPublicProfileView(7),
        (error: unknown) => error instanceof ApiError && error.status === 500,
      );
    },
  );
});

test('new profile reads observe changed counts and score rather than cached results', async () => {
  let current = profile();
  await withFetch(
    async (path) => Response.json(String(path).endsWith('/profile') ? current : []),
    async () => {
      assert.equal((await getPublicProfileView(7)).profile.completedHikeCount, 2);
      current = profile({ totalHikeCount: 4, completedHikeCount: 3, score: 320 });
      assert.deepEqual((await getPublicProfileView(7)).profile, current);
    },
  );
});

test('navigation cancellation aborts both profile and public journal requests', async () => {
  const controller = new AbortController();
  let cancelled = 0;
  await withFetch(
    async (_path, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          'abort',
          () => {
            cancelled++;
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true },
        );
      }),
    async () => {
      const request = getPublicProfileView(7, controller.signal);
      controller.abort();
      await assert.rejects(
        request,
        (error: unknown) => error instanceof Error && error.name === 'AbortError',
      );
      assert.equal(cancelled, 2);
    },
  );
});

test('journal author thumbnail reads only public metadata and preserves the uploaded image revision', async () => {
  const paths: string[] = [];
  const src = '/api/users/7/images/profile?v=uploaded-revision';
  await withFetch(
    async (path) => {
      paths.push(String(path));
      return Response.json(profile({ profileImageUrl: src }));
    },
    async () => {
      assert.equal((await getPublicProfileSummary(7)).profileImageUrl, src);
      assert.deepEqual(paths, ['/api/users/7/profile']);
    },
  );
});

test('journal author thumbnail rejects another members metadata before using its photo', async () => {
  await withFetch(
    async () => Response.json(profile({ userId: 8 })),
    async () => {
      await assert.rejects(getPublicProfileSummary(7), invalid);
    },
  );
});
