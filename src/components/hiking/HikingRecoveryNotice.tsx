import { useCallback, useState, useSyncExternalStore } from 'react';
import { recoveryKey } from './services/sessionRecovery';
import {
  openHikingRecoveryNotice,
  readHikingRecoveryNotice,
  visibleHikingRecoveryNotice,
} from '../../services/hikingRecoveryNotice';

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener('focus', listener);
  document.addEventListener('visibilitychange', listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('focus', listener);
    document.removeEventListener('visibilitychange', listener);
  };
}

export default function HikingRecoveryNotice({
  userId,
  visible,
  onNavigate,
}: {
  userId: number;
  visible: boolean;
  onNavigate: (screen: 'hikingTracking') => void;
}) {
  const [dismissedRequestId, setDismissedRequestId] = useState<string | null>(null);
  const snapshot = useCallback(() => {
    try {
      return localStorage.getItem(recoveryKey(userId));
    } catch {
      return null;
    }
  }, [userId]);
  // 같은 탭의 저장은 storage 이벤트를 발생시키지 않으므로 화면 이동 시에도 최신 기록을 읽는다.
  useSyncExternalStore(subscribe, snapshot, () => null);
  const notice = visibleHikingRecoveryNotice(
    readHikingRecoveryNotice(userId),
    userId,
    dismissedRequestId,
  );
  if (!visible || !notice) return null;
  return (
    <aside className="hiking-recovery-notice" role="status" aria-label="산행 임시 기록 안내">
      <p>{notice.message}</p>
      <div>
        <button type="button" onClick={() => openHikingRecoveryNotice(notice, userId, onNavigate)}>
          {notice.kind === 'pending-save' ? '저장 대기 산행 확인' : '산행 복구하기'}
        </button>
        <button
          type="button"
          onClick={() => setDismissedRequestId(notice.clientRequestId)}
          aria-label="산행 임시 기록 안내 닫기"
        >
          닫기
        </button>
      </div>
    </aside>
  );
}
