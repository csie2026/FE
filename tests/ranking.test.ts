import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  getRankings,
  getRankingSummary,
  recalculateScore,
  scoreText,
} from '../src/api.ts';
import { readFileSync } from 'node:fs';

test('ranking snapshot preserves server rank and nullable score while displaying zero points', async () => {
  const original = globalThis.fetch;
  const payload = {
    members: [{ userId: 1, nickname: 'first', profileImageUrl: null, score: 0, rank: 1 }],
    mine: { userId: 105, nickname: 'mine', profileImageUrl: null, score: null, rank: 105 },
    totalMembers: 105,
  };
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), '/api/rankings/summary');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.credentials, 'include');
    return Response.json(payload);
  };
  try {
    const result = await getRankingSummary();
    assert.deepEqual(result, payload);
    assert.equal(scoreText(result.mine!.score), '0점');
    assert.equal(scoreText(result.members[0].score), '0점');
    assert.equal(scoreText(1250), '1,250점');
  } finally {
    globalThis.fetch = original;
  }
});

test('fresh ranking requests observe changed totals instead of caching previous responses', async () => {
  const original = globalThis.fetch;
  let score = 50;
  globalThis.fetch = async () =>
    Response.json({
      members: [],
      mine: { userId: 1, nickname: 'mine', profileImageUrl: null, score, rank: 101 },
      totalMembers: 101,
    });
  try {
    assert.equal((await getRankingSummary()).mine!.score, 50);
    score = 0;
    assert.equal((await getRankingSummary()).mine!.score, 0);
    score = 50;
    assert.equal((await getRankingSummary()).mine!.score, 50);
  } finally {
    globalThis.fetch = original;
  }
});

test('ranking failures and expired sessions propagate rather than becoming empty or zero scores', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 403, 500]) {
      globalThis.fetch = async () => Response.json({ message: 'ranking failed' }, { status });
      await assert.rejects(
        getRankingSummary(),
        (e) => e instanceof ApiError && e.status === status,
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('ranking request forwards cancellation on navigation', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.signal, controller.signal);
    return new Promise((_resolve, reject) =>
      init!.signal!.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      ),
    );
  };
  try {
    const pending = getRankingSummary(controller.signal);
    controller.abort();
    await assert.rejects(pending, (e: Error) => e.name === 'AbortError');
  } finally {
    globalThis.fetch = original;
  }
});

test('R01 returns the existing public ranking list without changing the R02 screen contract', async () => {
  const original = globalThis.fetch;
  const payload = [{ userId: 1, nickname: 'first', profileImageUrl: null, score: 50 }];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), '/api/rankings');
    assert.equal(init?.cache, 'no-store');
    return Response.json(payload);
  };
  try {
    assert.deepEqual(await getRankings(), payload);
  } finally {
    globalThis.fetch = original;
  }
});

test('ranking refresh recalculates the current member score with CSRF before fetching a new summary', async () => {
  const original = globalThis.fetch;
  const requests: { url: string; method: string; headers: Headers }[] = [];
  globalThis.fetch = async (url, init) => {
    const request = {
      url: String(url),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
    };
    requests.push(request);
    if (request.url === '/api/csrf')
      return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'ranking-token' });
    if (request.url === '/api/users/me')
      return Response.json({
        userId: 7,
        nickname: 'mine',
        profileImageUrl: null,
        score: 320,
        backgroundImageUrl: null,
        birthYear: 2000,
        age: 27,
        profileCompleted: true,
      });
    return Response.json({
      totalPoints: 320,
      visitPoints: 200,
      summitPoints: 70,
      publicBonusPoints: 50,
      policyVersion: 'visit-general-or-verified-summit-multi-v2',
    });
  };
  try {
    const result = await recalculateScore(undefined, 7);
    assert.equal(result.totalPoints, 320);
    assert.deepEqual(
      requests.map(({ url, method }) => [url, method]),
      [
        ['/api/csrf', 'GET'],
        ['/api/users/me', 'GET'],
        ['/api/users/me/hiking-records/recalculate-score', 'POST'],
      ],
    );
    assert.equal(requests[2].headers.get('X-CSRF-TOKEN'), 'ranking-token');
  } finally {
    globalThis.fetch = original;
  }
});

test('the existing ranking refresh button runs H04 and R01 before the authoritative R02 requery', () => {
  const page = readFileSync(
    new URL('../src/components/ranking/RankingPage.tsx', import.meta.url),
    'utf8',
  );
  const refresh = page.slice(
    page.indexOf('async function refresh()'),
    page.indexOf('useEffect(() => {', page.indexOf('async function refresh()')),
  );
  assert.ok(refresh.indexOf('await recalculateScore') < refresh.indexOf('void getRankings'));
  assert.ok(refresh.indexOf('void getRankings') < refresh.indexOf('setAttempt'));
  assert.match(page, />\s*새로고침\s*<\/button>/);
  assert.match(page, /disabled=\{scoreRefreshing\}/);
});
