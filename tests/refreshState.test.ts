import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRefreshState } from '../src/services/refreshState.ts';
import { subscribeForegroundRefresh } from '../src/services/foregroundRefresh.ts';

test('first load waits for a response; foreground revalidation preserves the same successful data', () => {
  const scope = { userId: 1, screen: 'profile' };
  const first = { scope },
    next = { scope };
  assert.deepEqual(readRefreshState(true, first, { request: null, data: null, error: '' }), {
    data: null,
    loading: true,
    refreshing: true,
    error: '',
  });
  const data = { activities: [1, 2], goal: 10 };
  const snapshot = { request: first, data, error: '' };
  const pending = readRefreshState(true, next, snapshot);
  assert.equal(pending.loading, false);
  assert.equal(pending.refreshing, true);
  assert.equal(pending.data, data);
  assert.equal(readRefreshState(true, next, { request: next, data, error: '' }).refreshing, false);
});

test('new account, different page and disabled scope never expose an old result', () => {
  const scope = { userId: 1, screen: 'profile' },
    first = { scope };
  const result = { request: first, data: ['private'], error: '' };
  for (const next of [
    { scope: { userId: 2, screen: 'profile' } },
    { scope: { userId: 1, screen: 'conquered' } },
  ]) {
    const view = readRefreshState(true, next, result);
    assert.equal(view.data, null);
    assert.equal(view.loading, true);
  }
  assert.equal(readRefreshState(false, first, result).data, null);
});

test('a completed error remains visible instead of silently retaining a successful result', () => {
  const scope = 1,
    request = { scope };
  for (const error of ['세션 만료', '네트워크 오류', '잘못된 응답']) {
    assert.deepEqual(readRefreshState(true, request, { request, data: null, error }), {
      data: null,
      loading: false,
      refreshing: false,
      error,
    });
  }
});

test('foreground events retain profile, collection, monthly goal and ranking snapshots while requests run', () => {
  for (const screen of ['profile', 'conquered', 'monthly-goals', 'ranking']) {
    const page = new EventTarget(),
      document = Object.assign(new EventTarget(), { hidden: false });
    const scope = { userId: 1, screen },
      first = { scope };
    let request = first;
    const data = { selectedTab: 'saved', rows: [1, 2] };
    const result = { request: first, data, error: '' };
    let requests = 0;
    const unsubscribe = subscribeForegroundRefresh(page, document, () => {
      request = { scope };
      requests++;
    });
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    page.dispatchEvent(new Event('focus'));
    assert.equal(requests, 1);
    const view = readRefreshState(true, request, result);
    assert.equal(view.loading, false);
    assert.equal(view.data, data);
    assert.deepEqual(view.data?.rows, [1, 2]);
    unsubscribe();
  }
});
