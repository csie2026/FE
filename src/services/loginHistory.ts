// 로그인 이력은 만료 안내에만 사용하며 현재 인증 상태의 근거로 사용하지 않는다.
const key = 'topeak:server-confirmed-login';
let confirmed = false;
let storageFailed = false;

export function confirmLogin() {
  confirmed = true;
  try {
    localStorage.setItem(key, '1');
    storageFailed = false;
  } catch {
    storageFailed = true;
    // Safari가 저장소 접근을 거부해도 현재 화면에서는 서버가 확인한 로그인 이력을 기억한다.
  }
}

export function forgetLogin() {
  confirmed = false;
  try {
    localStorage.removeItem(key);
    storageFailed = false;
  } catch {
    storageFailed = true;
    // 저장소에 접근할 수 없어도 메모리의 인증 상태는 정리한다.
  }
}

export function hadConfirmedLogin() {
  if (storageFailed) return confirmed;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return confirmed;
  }
}

export function shouldNotifySessionExpiry(code?: string) {
  // 이 응답들은 이전에 인증된 세션이 있었음을 나타내므로 만료 안내 대상으로 처리한다.
  return (
    hadConfirmedLogin() || code === 'account_unavailable' || code === 'session_upgrade_required'
  );
}
