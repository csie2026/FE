import { api } from '../api.ts';

type LogoutOptions = {
  onSuccess: () => void;
  onFailure: () => void;
  onPending: (pending: boolean) => void;
  request?: (signal: AbortSignal) => Promise<unknown>;
  timeoutMs?: number;
};

export function createLogout({
  onSuccess,
  onFailure,
  onPending,
  request = (signal) => api('/api/logout', 'POST', undefined, signal),
  timeoutMs = 15_000,
}: LogoutOptions) {
  let pending = false;
  return async () => {
    if (pending) return;
    pending = true;
    onPending(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await request(controller.signal);
      if (controller.signal.aborted) throw new Error('로그아웃 응답 시간 초과');
      onSuccess();
    } catch {
      onFailure();
    } finally {
      clearTimeout(timer);
      pending = false;
      onPending(false);
    }
  };
}
