import type { RecoveryRead } from './sessionRecovery.ts';

export const AUTO_RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// readRecovery가 검증한 기록에만 적용한다. 진행/수동 일시정지 상태는 바꾸지 않는다.
export function canAutoRestoreRecovery(read: RecoveryRead, tabOwner: string | null, now: number) {
  if (read.kind !== 'ready') return false;
  const draft = read.draft;
  return (
    draft.webTracking !== undefined &&
    !draft.native &&
    draft.state === 'PAUSED' &&
    tabOwner === draft.ownerToken &&
    now - draft.updatedAt <= AUTO_RECOVERY_MAX_AGE_MS
  );
}
