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
    // 빠른 중복 클릭은 한 번의 로그아웃 요청과 하나의 화면 상태 변경으로 합친다.
    if (pending) return;
    pending = true;
    onPending(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await request(controller.signal);
      // AbortSignal을 무시하는 요청 구현도 시간 초과 뒤 성공으로 처리하지 않는다.
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
