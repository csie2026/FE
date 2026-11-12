export const OAUTH_FAILURE_MESSAGE = '로그인이 취소되었거나 실패했습니다. 다시 로그인해주세요.';

// 서버의 정해진 오류 코드만 안내에 사용하며 공급자 메시지나 복귀 URL은 해석하지 않는다.
export function readOAuthFailure(href: string) {
  const url = new URL(href);
  if (url.searchParams.get('oauth') !== 'failed') return null;
  url.searchParams.delete('oauth');
  return { message: OAUTH_FAILURE_MESSAGE, cleanUrl: url.href };
}
