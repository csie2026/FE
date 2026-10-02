import type { HikingState } from './types';
type Props = { state: HikingState; canStart: boolean; start: () => void; pause: () => void; resume: () => void; complete: () => void; reset: () => void };
export default function HikingControls({ state, canStart, start, pause, resume, complete, reset }: Props) {
  return <div className="hiking-controls">
    {state === 'READY' && <button type="button" className="hiking-primary" disabled={!canStart} onClick={start}>등산 시작</button>}
    {state === 'TRACKING' && <button type="button" onClick={pause}>Ⅱ 일시정지</button>}
    {state === 'PAUSED' && <button type="button" onClick={resume}>▶ 계속하기</button>}
    {(state === 'TRACKING' || state === 'PAUSED') && <button type="button" className="hiking-primary" onClick={complete}>등산 완료</button>}
    {state === 'COMPLETED' && <button type="button" onClick={reset}>새 산행 준비</button>}
  </div>;
}
