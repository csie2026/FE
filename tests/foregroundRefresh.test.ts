import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscribeForegroundRefresh } from '../src/services/foregroundRefresh.ts';

class PageDocument extends EventTarget {
  hidden = false;
}

test('lock and app switch refresh once regardless of focus/visibility ordering', () => {
  for (const focusFirst of [true, false]) {
    const page = new EventTarget(),
      document = new PageDocument();
    let calls = 0;
    const unsubscribe = subscribeForegroundRefresh(page, document, () => calls++);
    page.dispatchEvent(new Event('focus'));
    page.dispatchEvent(new Event('pageshow'));
    assert.equal(calls, 0);
    for (let cycle = 1; cycle <= 3; cycle++) {
      document.hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      page.dispatchEvent(new Event('blur'));
      page.dispatchEvent(new Event('focus'));
      assert.equal(calls, cycle - 1);
      document.hidden = false;
      if (focusFirst) page.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      page.dispatchEvent(new Event('focus'));
      page.dispatchEvent(new Event('pageshow'));
      assert.equal(calls, cycle);
    }
    unsubscribe();
    page.dispatchEvent(new Event('blur'));
    page.dispatchEvent(new Event('focus'));
    assert.equal(calls, 3);
  }
});

test('browser focus and bfcache return revalidate without visibility events', () => {
  const page = new EventTarget(),
    document = new PageDocument();
  let calls = 0;
  const unsubscribe = subscribeForegroundRefresh(page, document, () => calls++);
  page.dispatchEvent(new Event('blur'));
  page.dispatchEvent(new Event('focus'));
  page.dispatchEvent(new Event('focus'));
  assert.equal(calls, 1);
  page.dispatchEvent(new Event('pagehide'));
  page.dispatchEvent(new Event('pageshow'));
  page.dispatchEvent(new Event('focus'));
  assert.equal(calls, 2);
  unsubscribe();
});
