// 생명주기 이벤트는 기록을 보존할 뿐 사용자 일시정지를 요청하지 않는다.
export function subscribeWebSessionLifecycle(
  page: EventTarget,
  document: EventTarget,
  checkpoint: () => void,
) {
  const events = ['pagehide', 'pageshow', 'focus'];
  document.addEventListener('visibilitychange', checkpoint);
  events.forEach((event) => page.addEventListener(event, checkpoint));
  return () => {
    document.removeEventListener('visibilitychange', checkpoint);
    events.forEach((event) => page.removeEventListener(event, checkpoint));
  };
}
