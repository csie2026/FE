import { getErrorMessage } from '../../../utils/errorMessages';
import { useCallback, useEffect, useRef, useState } from 'react';
import { trackDistance } from '../trackUtils';
import type { GpsPoint, HikingCourse } from '../types';
import {
  assertTrackingCapacity,
  recordTrackPoint,
  resumeSession,
  stopTracking,
} from '../services/sessionTracking';
import {
  initialSession,
  pauseSession,
  completeSession,
  draftFromSession,
  sessionFromDraft,
  readRecovery,
  writeRecovery,
  removeRecovery,
  recoveryKey,
  type Session,
  type RecoveryContext,
} from '../services/sessionRecovery';

export function useHikingSession(
  course: HikingCourse,
  userId: number,
  recovery: RecoveryContext | null,
  onRecoveryRequired: () => void,
) {
  const [session, setSession] = useState<Session>(() =>
    recovery ? sessionFromDraft(recovery.draft) : initialSession(),
  );
  const sessionRef = useRef(session);
  const lastCommitted = useRef(session);
  const [ownerToken] = useState(() => recovery?.ownerToken ?? crypto.randomUUID());
  const retired = useRef(false);
  const [storageError, setStorageError] = useState('');
  const [isDurable, setDurable] = useState(recovery?.draft.state === 'COMPLETED');
  const [now, setNow] = useState(Date.now);
  const lastCheckpoint = useRef(now);
  const publish = useCallback((next: Session) => {
    sessionRef.current = next;
    setSession(next);
    setNow(Date.now());
  }, []);
  const persist = useCallback(
    (next: Session, mode: 'create' | 'update' = 'update') => {
      if (retired.current || !next.clientRequestId)
        throw new Error('산행 기록이 더 이상 활성 상태가 아닙니다. 현재 기록을 다시 확인해주세요.');
      const timestamp = Date.now();
      assertTrackingCapacity(next, course, userId, ownerToken, timestamp);
      const draft = draftFromSession(next, course, userId, ownerToken, timestamp);
      writeRecovery(draft, mode);
      lastCommitted.current = sessionFromDraft(draft);
      lastCheckpoint.current = timestamp;
      setStorageError('');
      setDurable(next.state === 'COMPLETED');
    },
    [course, userId, ownerToken],
  );
  const checkpoint = useCallback(
    (next: Session, mode: 'create' | 'update' = 'update') => {
      if (retired.current || !next.clientRequestId) return false;
      try {
        persist(next, mode);
        return true;
      } catch (cause) {
        setDurable(false);
        setStorageError(
          getErrorMessage(
            cause,
            '산행 기록을 임시 저장하지 못했습니다. 화면을 닫지 말고 다시 시도해주세요.',
          ),
        );
        return false;
      }
    },
    [persist],
  );
  const onPosition = useCallback(
    (point: GpsPoint) => {
      const result = recordTrackPoint(
        sessionRef.current,
        point,
        course,
        persist,
        lastCommitted.current,
      );
      if (result.session !== sessionRef.current) publish(result.session);
      if (result.error) {
        setStorageError(result.error);
        setDurable(false);
      }
    },
    [course, publish, persist],
  );
  const start = () => {
    if (sessionRef.current.state !== 'READY') return;
    if (readRecovery(userId).kind !== 'none') {
      onRecoveryRequired();
      return;
    }
    const startedAt = Date.now();
    const next: Session = {
      ...initialSession(),
      state: 'TRACKING',
      activeSince: startedAt,
      startedAt,
      clientRequestId: crypto.randomUUID(),
      segments: [[]],
    };
    if (checkpoint(next, 'create')) publish(next);
  };
  const pause = useCallback(() => {
    const current = sessionRef.current;
    if (current.state !== 'TRACKING') return;
    const next = pauseSession(current);
    if (checkpoint(next)) publish(next);
    else publish(stopTracking(lastCommitted.current, 'storage-error'));
  }, [publish, checkpoint]);
  const resume = () => {
    const current = sessionRef.current;
    const next = resumeSession(current);
    if (next === current) return;
    if (checkpoint(next)) publish(next);
  };
  const complete = () => {
    const current = sessionRef.current;
    if (current.state !== 'TRACKING' && current.state !== 'PAUSED') return;
    const next = completeSession(current, course);
    publish(next);
    checkpoint(next);
  };
  useEffect(() => {
    if (session.state !== 'TRACKING') return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() - lastCheckpoint.current >= 5000 && !checkpoint(sessionRef.current))
        publish(stopTracking(lastCommitted.current, 'storage-error'));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session.state, checkpoint, publish]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) pause();
    };
    const ownership = (event: StorageEvent) => {
      if (
        event.key !== recoveryKey(userId) ||
        !sessionRef.current.clientRequestId ||
        retired.current
      )
        return;
      const stored = readRecovery(userId);
      if (stored.kind !== 'ready' || stored.draft.ownerToken !== ownerToken) onRecoveryRequired();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', pause);
    window.addEventListener('beforeunload', pause);
    window.addEventListener('storage', ownership);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('beforeunload', pause);
      window.removeEventListener('storage', ownership);
      const current = sessionRef.current;
      if (!retired.current && current.clientRequestId) {
        try {
          persist(pauseSession(current));
        } catch {
          /* The last successful checkpoint is retained; storage errors are shown while mounted. */
        }
      }
    };
  }, [userId, ownerToken, pause, persist, onRecoveryRequired]);
  const markSaved = useCallback(() => {
    retired.current = true;
    try {
      removeRecovery(userId, sessionRef.current.clientRequestId!, ownerToken);
      setStorageError('');
    } catch {
      setStorageError(
        '서버 저장은 완료됐지만 임시 기록 정리에 실패했습니다. 다시 열면 같은 저장 요청으로 확인합니다.',
      );
    }
  }, [userId, ownerToken]);
  const reset = () => {
    try {
      if (sessionRef.current.clientRequestId)
        removeRecovery(userId, sessionRef.current.clientRequestId, ownerToken);
      retired.current = false;
      setStorageError('');
      setDurable(false);
      publish(initialSession());
      return true;
    } catch {
      setStorageError('임시 기록을 정리하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해주세요.');
      return false;
    }
  };
  const elapsedMs =
    session.accumulatedMs +
    (session.activeSince === null ? 0 : Math.max(0, now - session.activeSince));
  const distance = session.pendingInput?.distanceMeters ?? trackDistance(session.segments);
  return {
    ...session,
    elapsedMs,
    distance,
    averageSpeed: elapsedMs ? (distance / elapsedMs) * 3600 : 0,
    onPosition,
    start,
    pause,
    resume,
    complete,
    reset,
    storageError,
    isDurable,
    markSaved,
    retryCheckpoint: () => {
      if (retired.current) {
        markSaved();
        return true;
      }
      const current = sessionRef.current;
      const next =
        current.trackingStopReason === 'storage-error'
          ? { ...current, trackingStopReason: null }
          : current;
      if (!checkpoint(next)) return false;
      publish(next);
      return true;
    },
  };
}
