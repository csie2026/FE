import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, getRankingSummary, scoreText } from '../src/api.ts';

test('ranking snapshot preserves server rank outside top 100 and distinguishes null from zero', async () => {
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
    assert.equal(scoreText(result.mine!.score), '점수 미산정');
    assert.equal(scoreText(result.members[0].score), '0점');
    assert.equal(scoreText(1250), '1,250점');
  } finally { globalThis.fetch = original; }
});

test('fresh ranking requests observe changed totals instead of caching previous responses', async () => {
  const original = globalThis.fetch;
  let score = 50;
  globalThis.fetch = async () => Response.json({ members: [], mine: { userId: 1, nickname: 'mine', profileImageUrl: null, score, rank: 101 }, totalMembers: 101 });
  try {
    assert.equal((await getRankingSummary()).mine!.score, 50);
    score = 0;
    assert.equal((await getRankingSummary()).mine!.score, 0);
    score = 50;
    assert.equal((await getRankingSummary()).mine!.score, 50);
  } finally { globalThis.fetch = original; }
});

test('ranking failures and expired sessions propagate rather than becoming empty or zero scores', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 403, 500]) {
      globalThis.fetch = async () => Response.json({ message: 'ranking failed' }, { status });
      await assert.rejects(getRankingSummary(), (e) => e instanceof ApiError && e.status === status);
    }
  } finally { globalThis.fetch = original; }
});

test('ranking request forwards cancellation on navigation', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.signal, controller.signal);
    return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  };
  try {
    const pending = getRankingSummary(controller.signal);
    controller.abort();
    await assert.rejects(pending, (e: Error) => e.name === 'AbortError');
  } finally { globalThis.fetch = original; }
});
