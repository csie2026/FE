export const OAUTH_FAILURE_MESSAGE = '로그인이 취소되었거나 실패했습니다. 다시 로그인해주세요.';

// Only the fixed server code is displayed. Provider messages and return URLs are never interpreted.
export function readOAuthFailure(href: string) {
  const url = new URL(href);
  if (url.searchParams.get('oauth') !== 'failed') return null;
  url.searchParams.delete('oauth');
  return { message: OAUTH_FAILURE_MESSAGE, cleanUrl: url.href };
}
