// 같은 화면·계정 범위의 성공 결과는 재조회 중 유지한다.
// 다른 범위의 결과나 새 요청의 오류를 정상 데이터로 표시하지 않는다.
export function readRefreshState<S, T>(
  enabled: boolean,
  request: { scope: S },
  result: { request: { scope: S } | null; data: T | null; error: string },
) {
  const sameScope = enabled && result.request !== null && result.request.scope === request.scope;
  const current = sameScope && result.request === request;
  const data = sameScope ? result.data : null;
  return {
    data,
    loading: enabled && !current && data === null,
    refreshing: enabled && !current,
    error: current ? result.error : '',
  };
}
