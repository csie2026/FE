import { subscribeWebSessionLifecycle } from '../services/webSessionLifecycle';
import { getErrorMessage } from '../../../utils/errorMessages';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GpsPoint, HikingCourse } from '../types';
import { isNativeIOS, nativeLocation } from '../../../native/backgroundLocation';
import {
  nativeCheckpoint,
  latestNativeDisplayPosition,
  sessionWithNativeStatus,
  updateNativeSession,
  type NativeAction,
} from '../services/nativeTracking';
import {
  assertTrackingCapacity,
  recordTrackPoint,
  resumeSession,
  stopTracking,
} from '../services/sessionTracking';
import {
  initialSession,
  sessionStatistics,
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
  const nativeIOS = isNativeIOS();
  const [session, setSession] = useState<Session>(() =>
    recovery ? sessionFromDraft(recovery.draft) : initialSession(),
  );
  const sessionRef = useRef(session);
  const lastCommitted = useRef(
    pauseSession(session, recovery?.draft.updatedAt ?? session.activeSince ?? 0),
  );
  const [ownerToken] = useState(() => recovery?.ownerToken ?? crypto.randomUUID());
  const retired = useRef(false);
  const [storageError, setStorageError] = useState('');
  const [isDurable, setDurable] = useState(recovery?.draft.state === 'COMPLETED');
  const [now, setNow] = useState(Date.now);
  const lastCheckpoint = useRef(now);
  const mounted = useRef(true);
  const nativeBusyRef = useRef(false);
  const [nativeBusy, setNativeBusy] = useState(false);
  const [nativeKnown, setNativeKnown] = useState(!nativeIOS || !recovery?.draft.native);
  const [nativeError, setNativeError] = useState('');
  const [nativeLastReceivedAt, setNativeLastReceivedAt] = useState<number | null>(null);
  const [nativePosition, setNativePosition] = useState<GpsPoint | null>(null);
  const hasNativePosition = nativePosition !== null;
  const ownsSession = useCallback(
    (requestId: string) => {
      const stored = readRecovery(userId);
      return (
        stored.kind === 'ready' &&
        stored.draft.clientRequestId === requestId &&
        stored.draft.ownerToken === ownerToken
      );
    },
    [userId, ownerToken],
  );
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
      try {
        sessionStorage.setItem(recoveryKey(userId), ownerToken);
      } catch {
        /* 탭 저장소 접근 실패 시 자동 복구만 제한한다. */
      }
      lastCommitted.current = pauseSession(sessionFromDraft(draft), timestamp);
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
      if (nativeIOS) return;
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
    [course, publish, persist, nativeIOS],
  );
  const runNative = useCallback(
    async (action: NativeAction) => {
      if (nativeBusyRef.current || retired.current) return false;
      const current = sessionRef.current;
      if (!current.clientRequestId || current.state === 'COMPLETED') return false;
      if (!ownsSession(current.clientRequestId)) {
        onRecoveryRequired();
        return false;
      }
      nativeBusyRef.current = true;
      setNativeBusy(true);
      if (action !== 'sync') setNativeError('');
      const assertOwnership = () => {
        // 각 await 이후 소유권을 다시 확인해 이전 화면이 새 소유자의 임시 기록을 덮어쓰지 못하게 한다.
        if (!mounted.current || !ownsSession(current.clientRequestId!))
          throw new Error('산행 화면 또는 소유권이 변경되었습니다.');
      };
      const commit = (next: Session) => {
        assertOwnership();
        persist(next);
        publish(next);
      };
      try {
        const result = await updateNativeSession(
          action,
          current,
          userId,
          course,
          ownerToken,
          commit,
          nativeLocation,
          assertOwnership,
        );
        setNativeLastReceivedAt(result.status?.session?.lastRecordedAt ?? null);
        const receivedAt = Date.now();
        setNativePosition((previous) =>
          latestNativeDisplayPosition(
            previous,
            result.position ? [result.position] : [],
            receivedAt,
          ),
        );
        setNativeKnown(true);
        const code = result.status?.session?.errorCode;
        if (code && code !== 'LOCATION_UNAVAILABLE')
          setNativeError(`GPS 수집 중단 (${code}). 기록은 보존되었습니다.`);
        return true;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : '네이티브 GPS 상태 확인에 실패했습니다.';
        setNativeError(message);
        setNativeKnown(false);
        // 오류 시 수집 중지를 시도하되 네이티브 확인 전에는 PAUSED로 확정하지 않는다.
        if (ownsSession(current.clientRequestId)) {
          try {
            const status = await nativeLocation.pause({
              userId,
              clientRequestId: current.clientRequestId,
            });
            if (status.session === null && current.native?.cursor === 0) {
              commit({ ...sessionRef.current, state: 'PAUSED', activeSince: null });
              setNativeKnown(true);
              return false;
            }
            const paused = sessionWithNativeStatus(lastCommitted.current, status, userId);
            if (paused.state === 'TRACKING')
              throw new Error('GPS 중지 상태를 확인하지 못했습니다.');
            try {
              commit(paused);
            } catch {
              publish(paused);
              setStorageError(message);
              setDurable(false);
            }
            setNativeKnown(true);
          } catch {
            // 상태 미확인을 화면에 표시하고 완료·재시작을 차단하며 웹 GPS로 대체하지 않는다.
          }
        }
        return false;
      } finally {
        nativeBusyRef.current = false;
        setNativeBusy(false);
        if (!mounted.current && ownsSession(current.clientRequestId)) {
          // 시작·재개 요청이 진행되는 동안 화면을 이동한 경우에도 수집 상태를 정리한다.
          void nativeLocation
            .pause({ userId, clientRequestId: current.clientRequestId })
            .catch(() => {});
        }
      }
    },
    [course, userId, ownerToken, ownsSession, persist, publish, onRecoveryRequired],
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
      state: nativeIOS ? 'PAUSED' : 'TRACKING',
      activeSince: nativeIOS ? null : startedAt,
      startedAt,
      clientRequestId: crypto.randomUUID(),
      segments: [[]],
      ...(nativeIOS ? { native: nativeCheckpoint() } : {}),
    };
    if (checkpoint(next, 'create')) {
      if (nativeIOS) setNativePosition(null);
      publish(next);
      if (nativeIOS) void runNative('start');
    }
  };
  const pause = useCallback(() => {
    if (nativeIOS) {
      void runNative('pause');
      return;
    }
    const current = sessionRef.current;
    if (current.state !== 'TRACKING') return;
    const next = pauseSession(current);
    if (checkpoint(next)) publish(next);
    else publish(stopTracking(lastCommitted.current, 'storage-error'));
  }, [publish, checkpoint, nativeIOS, runNative]);
  const resume = () => {
    if (nativeIOS) {
      const current = sessionRef.current;
      if (current.state !== 'PAUSED' || current.trackingStopReason || nativeBusyRef.current) return;
      if (!current.native) {
        const migrated = { ...current, native: nativeCheckpoint(current.accumulatedMs) };
        if (!checkpoint(migrated)) return;
        publish(migrated);
      }
      void runNative('resume');
      return;
    }
    const current = sessionRef.current;
    const next = resumeSession(current);
    if (next === current) return;
    if (checkpoint(next)) publish(next);
  };
  const complete = () => {
    if (nativeIOS && sessionRef.current.native) {
      void runNative('complete');
      return;
    }
    const current = sessionRef.current;
    if (current.state !== 'TRACKING' && current.state !== 'PAUSED') return;
    const next = completeSession(current, course);
    publish(next);
    checkpoint(next);
  };
  useEffect(() => {
    if (session.state !== 'TRACKING' && !(nativeIOS && hasNativePosition)) return;
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (nativeIOS)
        setNativePosition((previous) => latestNativeDisplayPosition(previous, [], timestamp));
      if (
        !nativeIOS &&
        Date.now() - lastCheckpoint.current >= 5000 &&
        !checkpoint(sessionRef.current)
      )
        publish(stopTracking(lastCommitted.current, 'storage-error'));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session.state, checkpoint, publish, nativeIOS, hasNativePosition]);
  useEffect(() => {
    if (!nativeIOS) return;
    mounted.current = true;
    const sync = () => {
      if (!document.hidden && sessionRef.current.native) {
        // 브리지·저장소 작업을 기다리지 않고 백그라운드 진입 전 표시용 위치를 즉시 만료시킨다.
        const timestamp = Date.now();
        setNow(timestamp);
        setNativePosition((previous) => latestNativeDisplayPosition(previous, [], timestamp));
        if (sessionRef.current.state !== 'COMPLETED')
          void runNative(recovery?.finishRequested ? 'complete' : 'sync');
      }
    };
    sync();
    const timer = window.setInterval(sync, 2000);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
      queueMicrotask(() => {
        const current = sessionRef.current;
        if (
          mounted.current ||
          !current.native ||
          !current.clientRequestId ||
          current.state === 'COMPLETED' ||
          nativeBusyRef.current ||
          !ownsSession(current.clientRequestId)
        )
          return;
        void nativeLocation
          .pause({ userId, clientRequestId: current.clientRequestId })
          .then((status) => {
            if (!mounted.current && ownsSession(current.clientRequestId!)) {
              persist(sessionWithNativeStatus(current, status, userId));
            }
          })
          .catch(() => {
            /* 이후 상태 대조를 위해 임시 기록과 네이티브 원본을 보존한다. */
          });
      });
    };
  }, [nativeIOS, runNative, recovery?.finishRequested, ownsSession, userId, persist]);
  useEffect(() => {
    // 화면 잠금은 사용자 일시정지가 아니다. 상태를 보존하고 복귀 시 시계를 갱신한다.
    const checkpointWeb = () => {
      if (nativeIOS || retired.current || !sessionRef.current.clientRequestId) return;
      setNow(Date.now());
      if (!checkpoint(sessionRef.current))
        publish(stopTracking(lastCommitted.current, 'storage-error'));
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
    const unsubscribe = nativeIOS
      ? () => {}
      : subscribeWebSessionLifecycle(window, document, checkpointWeb);
    window.addEventListener('storage', ownership);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', ownership);
      const current = sessionRef.current;
      if (!nativeIOS && !retired.current && current.clientRequestId) {
        try {
          persist(current);
        } catch {
          /* 마지막 저장 성공 기록을 유지하고 화면이 열려 있으면 저장 오류를 표시한다. */
        }
      }
    };
  }, [userId, ownerToken, checkpoint, publish, persist, onRecoveryRequired, nativeIOS]);
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
      setNativePosition(null);
      publish(initialSession());
      return true;
    } catch {
      setStorageError('임시 기록을 정리하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해주세요.');
      return false;
    }
  };
  return {
    ...session,
    ...sessionStatistics(session, now),
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
      if (
        nativeIOS &&
        sessionRef.current.native &&
        !retired.current &&
        sessionRef.current.state !== 'COMPLETED'
      ) {
        void runNative('sync');
        return false;
      }
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
    nativeIOS,
    nativeBusy,
    nativeKnown,
    nativeError,
    nativeLastReceivedAt,
    nativePosition,
    receptionNow: now,
    retryNative: () => {
      void runNative('sync');
    },
  };
}
