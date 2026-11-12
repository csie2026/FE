import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscribeWebSessionLifecycle } from '../src/components/hiking/services/webSessionLifecycle.ts';
import {
  initialSession,
  draftFromSession,
  sessionFromDraft,
  pauseSession,
} from '../src/components/hiking/services/sessionRecovery.ts';

test('lock, app switch, pageshow and focus preserve tracking and account for suspended execution', () => {
  const page = new EventTarget(),
    document = new EventTarget();
  const start = Date.now() - 60000;
  const session = {
    ...initialSession(),
    state: 'TRACKING' as const,
    startedAt: start,
    activeSince: start,
    clientRequestId: crypto.randomUUID(),
  };
  let count = 0;
  const unsubscribe = subscribeWebSessionLifecycle(page, document, () => {
    const draft = draftFromSession(
      session,
      { mountainId: '1', courseId: '1', mountainName: '산', courseName: '코스' },
      1,
      crypto.randomUUID(),
      start + 60000,
    );
    assert.equal(sessionFromDraft(draft).state, 'TRACKING');
    assert.equal(pauseSession(sessionFromDraft(draft), start + 65000).accumulatedMs, 65000);
    count++;
  });
  document.dispatchEvent(new Event('visibilitychange'));
  page.dispatchEvent(new Event('pagehide'));
  document.dispatchEvent(new Event('visibilitychange'));
  page.dispatchEvent(new Event('pageshow'));
  page.dispatchEvent(new Event('focus'));
  assert.equal(count, 5);
  assert.equal(session.state, 'TRACKING');
  unsubscribe();
  page.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(count, 5);
});
