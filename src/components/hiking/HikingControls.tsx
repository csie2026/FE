import type { HikingState } from './types';
import type { TrackingStopReason } from './services/sessionRecovery';
type Props = {
  state: HikingState;
  canStart: boolean;
  trackingStopReason?: TrackingStopReason | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  complete: () => void;
  reset: () => void;
};
export default function HikingControls({
  state,
  canStart,
  trackingStopReason,
  start,
  pause,
  resume,
  complete,
  reset,
}: Props) {
  // 산행 상태마다 허용된 동작만 노출해 시작·재개·완료 요청이 동시에 발생하지 않게 한다.
  return (
    <div className="hiking-controls">
      {state === 'READY' && (
        <button type="button" className="hiking-primary" disabled={!canStart} onClick={start}>
          등산 시작
        </button>
      )}
      {state === 'TRACKING' && (
        <button type="button" onClick={pause}>
          Ⅱ 일시정지
        </button>
      )}
      {state === 'PAUSED' && (
        // 저장 한도 초과 등 자동 중지 사유가 있으면 기존 기록은 완료할 수 있지만 재개할 수 없다.
        <button type="button" onClick={resume} disabled={Boolean(trackingStopReason)}>
          ▶ 계속하기
        </button>
      )}
      {(state === 'TRACKING' || state === 'PAUSED') && (
        <button type="button" className="hiking-primary" onClick={complete}>
          등산 완료
        </button>
      )}
      {state === 'COMPLETED' && (
        <button type="button" onClick={reset}>
          새 산행 준비
        </button>
      )}
    </div>
  );
}
