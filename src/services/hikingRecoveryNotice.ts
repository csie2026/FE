import { readRecovery } from '../components/hiking/services/sessionRecovery.ts';

export type HikingRecoveryNotice = {
  userId: number;
  clientRequestId: string;
  kind: 'pending-save' | 'paused';
  message: string;
};

export function readHikingRecoveryNotice(userId: number, storage?: Storage, now = Date.now()) {
  const result = readRecovery(userId, now, storage);
  if (result.kind !== 'ready') return null;
  const completed = result.draft.state === 'COMPLETED';
  return {
    userId,
    clientRequestId: result.draft.clientRequestId,
    kind: completed ? 'pending-save' : 'paused',
    message: completed
      ? '저장을 기다리는 산행 기록이 있습니다. 기존 기록을 확인하고 저장을 재시도해주세요.'
      : '이어서 진행할 산행 기록이 있습니다. 기존 기록을 복구하거나 종료해 저장할 수 있습니다.',
  } satisfies HikingRecoveryNotice;
}

export function visibleHikingRecoveryNotice(
  notice: HikingRecoveryNotice | null,
  userId: number,
  dismissedRequestId: string | null,
) {
  return notice?.userId === userId && notice.clientRequestId !== dismissedRequestId ? notice : null;
}

// Recheck ownership and existence at click time; the existing hiking page performs recovery.
export function openHikingRecoveryNotice(
  notice: HikingRecoveryNotice,
  currentUserId: number,
  navigate: (screen: 'hikingTracking') => void,
  storage?: Storage,
) {
  if (notice.userId !== currentUserId) return false;
  const current = readHikingRecoveryNotice(currentUserId, storage);
  if (current?.clientRequestId !== notice.clientRequestId) return false;
  navigate('hikingTracking');
  return true;
}
