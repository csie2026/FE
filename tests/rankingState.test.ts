import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRankingRequest } from '../src/services/ranking.ts';
import { ApiError } from '../src/api.ts';

const summary = (userId: number) => ({
  members: [],
  mine: { userId, nickname: 'Member', profileImageUrl: null, score: 0, rank: 1 },
  totalMembers: 1,
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

for (const lateStatus of [200, 401, 500]) {
  test(`ranking account switch suppresses old ${lateStatus} response even when fetch ignores cancellation`, async () => {
    const original = globalThis.fetch;
    const finishes: ((response: Response) => void)[] = [];
    const events: unknown[] = [];
    globalThis.fetch = async () => new Promise<Response>((resolve) => finishes.push(resolve));
    let stopNew = () => {};
    try {
      const stopOld = startRankingRequest(1, {
        success: (s) => events.push(['old', s]),
        failure: (e) => events.push(['old-error', e]),
      });
      stopOld();
      stopNew = startRankingRequest(2, {
        success: (s) => events.push(['new', s]),
        failure: (e) => events.push(['new-error', e]),
      });
      finishes[0](Response.json(lateStatus === 200 ? summary(1) : {}, { status: lateStatus }));
      await tick();
      assert.deepEqual(events, [], 'old callbacks cannot end the new account loading state');
      finishes[1](Response.json(summary(2)));
      await tick();
      assert.deepEqual(events, [['new', summary(2)]]);
    } finally {
      stopNew();
      globalThis.fetch = original;
    }
  });
}

test('ranking distinguishes valid empty summary, wrong account and invalid DTO', async () => {
  const original = globalThis.fetch;
  try {
    for (const payload of [{ members: [], mine: null, totalMembers: 0 }, summary(2), {}]) {
      globalThis.fetch = async () => Response.json(payload);
      const result = await new Promise<{ data?: unknown; error?: unknown }>((resolve) => {
        startRankingRequest(1, {
          success: (data) => resolve({ data }),
          failure: (error) => resolve({ error }),
        });
      });
      if ('totalMembers' in payload && payload.totalMembers === 0)
        assert.deepEqual(result.data, payload);
      else if ('mine' in payload) assert.ok(result.error instanceof Error);
      else assert.ok(result.error instanceof ApiError && result.error.code === 'invalid_response');
    }
  } finally {
    globalThis.fetch = original;
  }
});
