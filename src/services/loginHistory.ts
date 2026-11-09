// This is only evidence for an expiry notice, never proof of current authentication.
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
    // Safari may deny storage; the current page still remembers server confirmation.
  }
}

export function forgetLogin() {
  confirmed = false;
  try {
    localStorage.removeItem(key);
    storageFailed = false;
  } catch {
    storageFailed = true;
    // Authentication cleanup must also work without storage.
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
  // These responses themselves prove that a former authenticated session existed.
  return (
    hadConfirmedLogin() || code === 'account_unavailable' || code === 'session_upgrade_required'
  );
}
