import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getErrorMessage,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../src/utils/errorMessages.ts';

test('브라우저별 영문 네트워크 오류가 같은 한글 안내로 표시된다', () => {
  for (const cause of [
    new TypeError('Failed to fetch'),
    new TypeError('Load failed'),
    new TypeError('Network request failed'),
    new TypeError('NetworkError when attempting to fetch resource.'),
    new DOMException('A network error occurred.', 'NetworkError'),
  ]) {
    assert.equal(getErrorMessage(cause), NETWORK_ERROR_MESSAGE);
  }
});

test('저장 공간·접근 권한·파일 읽기 오류도 사용자가 이해할 수 있는 한글로 안내한다', () => {
  const cases = [
    ['QuotaExceededError', /저장 공간/],
    ['SecurityError', /브라우저/],
    ['NotAllowedError', /권한/],
    ['NotReadableError', /파일/],
    ['AbortError', /취소/],
    ['TimeoutError', /시간이 초과/],
  ] as const;
  for (const [name, expected] of cases) {
    const cause = new DOMException('Browser error details', name);
    assert.match(getErrorMessage(cause), expected);
    assert.equal(cause.name, name);
    assert.equal(cause.message, 'Browser error details');
  }
  assert.equal(
    getErrorMessage(new DOMException('Timed out', 'TimeoutError')),
    TIMEOUT_ERROR_MESSAGE,
  );
});

test('구체적인 한글 안내는 유지하고 알 수 없는 영문 오류는 화면별 안내로 대체한다', () => {
  const message = '다른 회원의 사진은 변경할 수 없습니다.';
  assert.equal(getErrorMessage(new Error(message)), message);
  assert.equal(getErrorMessage({ message }), message);
  assert.equal(getErrorMessage(message), message);
  const fallback = '사진을 변경하지 못했습니다. 다시 시도해주세요.';
  for (const cause of [
    new TypeError('Cannot read properties of null'),
    null,
    {},
    123,
    'unknown error',
  ])
    assert.equal(getErrorMessage(cause, fallback), fallback);
});
