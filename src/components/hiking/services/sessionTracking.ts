import { GPS_FILTER } from '../config.ts';
import { acceptTrackPoint, hasReachedSummit } from '../trackUtils.ts';
import type { GpsPoint, HikingCourse } from '../types.ts';
import {
  completeSession,
  draftFromSession,
  pauseSession,
  MAX_RECOVERY_BYTES,
  MAX_RECOVERY_POINTS,
  type Session,
  type TrackingStopReason,
} from './sessionRecovery.ts';
import { jsonBytes } from './activityValidation.ts';

export class RecoveryCapacityError extends Error {}
const COMPLETION_METADATA_RESERVE_BYTES = 128;

// Reserve the actual completion summary, plus room for later numeric timestamps and stop metadata.
// The on-disk limit remains 1,000,000 UTF-8 bytes; this only gates further collection.
export function assertTrackingCapacity(
  session: Session,
  course: Pick<HikingCourse, 'mountainId' | 'courseId' | 'mountainName' | 'courseName'>,
  userId: number,
  ownerToken: string,
  now = Date.now(),
) {
  if (session.state === 'COMPLETED') return;
  const draft = draftFromSession(session, course, userId, ownerToken, now);
  const ended = draftFromSession(
    { ...completeSession(session, course, now), trackingStopReason: 'capacity-limit' },
    course,
    userId,
    ownerToken,
    now,
  );
  if (
    jsonBytes(draft) > MAX_RECOVERY_BYTES ||
    jsonBytes(ended) + COMPLETION_METADATA_RESERVE_BYTES > MAX_RECOVERY_BYTES
  )
    throw new RecoveryCapacityError('산행 종료 정보를 보존할 저장 공간이 부족합니다.');
}

export function stopTracking(
  session: Session,
  reason: TrackingStopReason,
  now = Date.now(),
): Session {
  return { ...pauseSession(session, now), trackingStopReason: reason };
}

export function resumeSession(session: Session, now = Date.now()): Session {
  if (session.state !== 'PAUSED' || session.trackingStopReason) return session;
  if (session.segments.reduce((n, segment) => n + segment.length, 0) >= MAX_RECOVERY_POINTS)
    return stopTracking(session, 'point-limit', now);
  return { ...session, state: 'TRACKING', activeSince: now, segments: [...session.segments, []] };
}

// Commit to storage before publishing evidence. A rejected sample never enters the session.
export function recordTrackPoint(
  session: Session,
  point: GpsPoint,
  course: HikingCourse,
  persist: (next: Session) => void,
  lastCheckpoint: Session,
  now = Date.now(),
): { session: Session; error?: string } {
  if (
    session.state !== 'TRACKING' ||
    session.trackingStopReason ||
    point.timestamp < session.activeSince!
  )
    return { session };
  const count = session.segments.reduce((n, segment) => n + segment.length, 0);
  let next: Session;
  if (count >= MAX_RECOVERY_POINTS) {
    next = stopTracking(session, 'point-limit', now);
  } else {
    const segment = session.segments.at(-1) ?? [];
    const previous = segment.at(-1);
    const gap = previous && point.timestamp - previous.timestamp > GPS_FILTER.maxGapMs;
    if (!acceptTrackPoint(point, gap ? undefined : previous)) return { session };
    next = {
      ...session,
      segments: gap
        ? [...session.segments, [point]]
        : [...session.segments.slice(0, -1), [...segment, point]],
      reachedSummit: session.reachedSummit || hasReachedSummit(point, course.summitPoint),
    };
    if (count + 1 === MAX_RECOVERY_POINTS) next = stopTracking(next, 'point-limit', now);
  }
  try {
    persist(next);
    return { session: next };
  } catch (cause) {
    const reason = cause instanceof RecoveryCapacityError ? 'capacity-limit' : 'storage-error';
    // Match the last committed evidence AND accumulated time, rather than advancing an unsaved clock.
    const stopped = stopTracking(
      { ...lastCheckpoint, state: 'PAUSED', activeSince: null },
      reason,
      now,
    );
    try {
      persist(stopped);
    } catch {
      /* The previous checkpoint remains untouched. */
    }
    return {
      session: stopped,
      error:
        reason === 'storage-error'
          ? '새 GPS 표본을 저장하지 못해 기록을 중단했습니다. 마지막 저장 시점의 좌표와 시간으로 복원했습니다. 저장 공간을 확인하고 임시 저장을 다시 시도해 주세요.'
          : undefined,
    };
  }
}

export const trackingStopMessages: Record<TrackingStopReason, string> = {
  'point-limit':
    'GPS 표본 10,000개에 도달하여 수집을 중단했습니다. 기존 증거는 보존됩니다. 산행 완료를 눌러 현재 기록을 저장해 주세요.',
  'capacity-limit':
    '임시 기록의 저장 용량 한도에 도달하여 GPS 수집을 중단했습니다. 새 표본은 추가하지 않았으며 기존 증거는 보존됩니다. 산행 완료를 눌러 저장해 주세요.',
  'storage-error':
    '저장 오류로 GPS 수집을 중단했습니다. 마지막으로 저장된 증거를 보존하고 있습니다.',
};
