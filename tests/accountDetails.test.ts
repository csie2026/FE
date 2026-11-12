import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatJoinedDate, loginProviderLabel } from '../src/services/accountDetails.ts';

test('account join date uses the saved instant in Korea across day and year boundaries', () => {
  assert.equal(formatJoinedDate('2026-11-08T14:59:59Z'), '2026년 11월 08일');
  assert.equal(formatJoinedDate('2026-11-08T15:00:00Z'), '2026년 11월 09일');
  assert.equal(formatJoinedDate('2026-12-31T15:00:00Z'), '2027년 01월 01일');
  assert.equal(formatJoinedDate('2026-11-09T00:00:00+09:00'), '2026년 11월 09일');
});
test('missing and unusable join dates stay unknown without invented current dates', () => {
  for (const value of [
    null,
    undefined,
    '',
    'invalid',
    '2026-11-09T00:00:00',
    '2026-99-99T00:00:00Z',
  ])
    assert.equal(formatJoinedDate(value), '가입일 정보 없음');
});
test('login provider uses supported labels without exposing raw identifiers', () => {
  assert.equal(loginProviderLabel('google'), '구글');
  assert.equal(loginProviderLabel('kakao'), '카카오');
  for (const provider of [null, undefined, '', 'untrusted-value'])
    assert.equal(loginProviderLabel(provider), '확인 불가');
});
