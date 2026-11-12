// 잠금·앱 전환 뒤 focus/visibilitychange가 함께 발생해도 한 번만 재조회한다.
// 최초 진입이나 단순 중복 focus는 새 화면 초기화로 취급하지 않는다.
export function subscribeForegroundRefresh(
  page: EventTarget,
  document: EventTarget & { readonly hidden: boolean },
  refresh: () => void,
) {
  let away = document.hidden;
  const leave = () => {
    away = true;
  };
  const enter = () => {
    if (document.hidden || !away) return;
    away = false;
    refresh();
  };
  const visibility = () => {
    if (document.hidden) leave();
    else enter();
  };
  page.addEventListener('blur', leave);
  page.addEventListener('pagehide', leave);
  page.addEventListener('focus', enter);
  page.addEventListener('pageshow', enter);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    page.removeEventListener('blur', leave);
    page.removeEventListener('pagehide', leave);
    page.removeEventListener('focus', enter);
    page.removeEventListener('pageshow', enter);
    document.removeEventListener('visibilitychange', visibility);
  };
}
