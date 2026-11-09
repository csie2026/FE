import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { api, subscribeSessionExpiry } from '../src/api.ts';
import {
  confirmLogin,
  forgetLogin,
  shouldNotifySessionExpiry,
} from '../src/services/loginHistory.ts';

test('server-confirmed login and subsequent 401 distinguish anonymous, expiry, invalidation and logout', async () => {
  const original = globalThis.fetch;
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  let notices = 0;
  const unsubscribe = subscribeSessionExpiry((code) => {
    if (!shouldNotifySessionExpiry(code)) return;
    notices++;
    forgetLogin();
  });
  const unauthorized = () => Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    forgetLogin();
    globalThis.fetch = async () => unauthorized();
    await assert.rejects(api('/api/users/me'));
    await assert.rejects(api('/api/mountains'));
    assert.equal(notices, 0); // first visit and anonymous protected API

    for (const reason of ['idle expiry', 'server restart']) {
      globalThis.fetch = async () => Response.json({ userId: 7 });
      await api('/api/users/me');
      confirmLogin();
      assert.equal(notices, reason === 'idle expiry' ? 0 : 1);
      globalThis.fetch = async () => unauthorized();
      await assert.rejects(api('/api/users/me'));
      assert.equal(notices, reason === 'idle expiry' ? 1 : 2);
      await assert.rejects(api('/api/users/me'));
      assert.equal(shouldNotifySessionExpiry(), false); // consumed once
    }

    confirmLogin();
    for (const status of [403, 500, 503]) {
      globalThis.fetch = async () => Response.json({}, { status });
      await assert.rejects(api('/api/users/me'));
      assert.equal(notices, 2);
      assert.equal(shouldNotifySessionExpiry(), true);
    }
    globalThis.fetch = async () => {
      throw new TypeError('offline');
    };
    await assert.rejects(api('/api/users/me'));
    assert.equal(notices, 2);
    assert.equal(shouldNotifySessionExpiry(), true);

    globalThis.fetch = async (path) =>
      String(path) === '/api/csrf'
        ? Response.json({ headerName: 'X-CSRF-TOKEN', token: 'token' })
        : new Response(null, { status: 204 });
    await api('/api/logout', 'POST');
    forgetLogin();
    globalThis.fetch = async () => unauthorized();
    await assert.rejects(api('/api/users/me'));
    assert.equal(notices, 2);

    confirmLogin();
    values.clear(); // explicit logout in another tab
    await assert.rejects(api('/api/users/me'));
    assert.equal(notices, 2);

    forgetLogin();
    values.set('topeak:server-confirmed-login', '1'); // reload retains only notice evidence
    globalThis.fetch = async () => Response.json({ userId: 7 });
    await api('/api/users/me');
    assert.equal(notices, 2); // stored history alone never triggers expiry
    globalThis.fetch = async () => unauthorized();
    await assert.rejects(api('/api/users/me'));
    assert.equal(notices, 3);
  } finally {
    forgetLogin();
    unsubscribe();
    globalThis.fetch = original;
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('storage denial preserves in-memory confirmation and server revocation evidence', () => {
  forgetLogin();
  confirmLogin();
  assert.equal(shouldNotifySessionExpiry(), true);
  forgetLogin();
  assert.equal(shouldNotifySessionExpiry(), false);
  assert.equal(shouldNotifySessionExpiry('account_unavailable'), true);
  assert.equal(shouldNotifySessionExpiry('session_upgrade_required'), true);
});

test('App wires confirmation to server success and cleanup to explicit logout', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /confirmLogin\(\);\s*setMe\(user\)/);
  assert.match(app, /const clearAccount = useCallback\(\(\) => \{[\s\S]*?forgetLogin\(\)/);
  assert.match(app, /onSuccess: \(\) => \{\s*clearAccount\(\)/);
  assert.match(app, /if \(logoutPending.current \|\| !shouldNotifySessionExpiry\(code\)\) return/);
});
