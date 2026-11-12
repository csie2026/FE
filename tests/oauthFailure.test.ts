import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOAuthFailure, OAUTH_FAILURE_MESSAGE } from '../src/services/oauthFailure.ts';

test('OAuth cancellation/failure yields a fixed safe notice and removes its query without losing other state', () => {
  assert.deepEqual(readOAuthFailure('https://topeak.invalid/?view=login&oauth=failed#journals/2'), {
    message: OAUTH_FAILURE_MESSAGE, cleanUrl: 'https://topeak.invalid/?view=login#journals/2',
  });
});
test('provider text and return URLs cannot become the displayed message or a navigation target', () => {
  const result = readOAuthFailure('https://topeak.invalid/?oauth=failed&message=secret&redirect=https://attacker.invalid');
  assert.equal(result?.message, OAUTH_FAILURE_MESSAGE);
  assert.equal(new URL(result!.cleanUrl).origin, 'https://topeak.invalid');
});
test('successful login, ordinary startup and unknown codes retain their existing flow', () => {
  for (const href of ['https://topeak.invalid/', 'https://topeak.invalid/?oauth=success', 'https://topeak.invalid/?oauth=secret'])
    assert.equal(readOAuthFailure(href),null);
});
