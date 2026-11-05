import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api';
import {
  EMPTY_GOALS,
  getMonthlyGoals,
  putMonthlyGoals,
  type MonthlyGoals,
  type MonthlyGoalResponse,
} from '../services/monthlyGoals';
export type { MonthlyGoals } from '../services/monthlyGoals';

export function useMonthlyGoals(
  userId: number | null,
  enabled: boolean,
  month: string,
  refreshKey: number,
  onAuthError: (error: unknown) => void,
) {
  const scope = useMemo(() => ({ userId, enabled, month }), [userId, enabled, month]);
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ scope, refreshKey, attempt }), [scope, refreshKey, attempt]);
  const active = useRef<typeof scope | null>(null);
  const writer = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{
    request: typeof request | null;
    data: MonthlyGoalResponse | null;
    error: string;
  }>({ request: null, data: null, error: '' });
  const [write, setWrite] = useState<{
    scope: typeof scope | null;
    pending: boolean;
    error: string;
  }>({ scope: null, pending: false, error: '' });
  const saving = write.scope === scope && write.pending;
  useEffect(() => {
    active.current = scope;
    return () => {
      active.current = null;
      writer.current?.abort();
      writer.current = null;
    };
  }, [scope]);
  useEffect(() => {
    if (userId === null || !enabled || saving) return;
    const controller = new AbortController();
    getMonthlyGoals(userId, month, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ request, data, error: '' });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          request,
          data: null,
          error: cause instanceof Error ? cause.message : '월별 목표를 불러오지 못했습니다.',
        });
        if (cause instanceof ApiError && cause.status === 401) onAuthError(cause);
      });
    return () => controller.abort();
  }, [userId, enabled, month, request, saving, onAuthError]);
  const saveGoals = useCallback(
    async (next: MonthlyGoals) => {
      if (userId === null || !enabled || active.current !== scope || writer.current) return false;
      const controller = new AbortController();
      writer.current = controller;
      setWrite({ scope, pending: true, error: '' });
      try {
        const data = await putMonthlyGoals(userId, month, next, controller.signal);
        if (active.current !== scope || controller.signal.aborted) return false;
        setResult({ request, data, error: '' });
        return true;
      } catch (cause) {
        if (active.current === scope && !controller.signal.aborted) {
          setWrite({
            scope,
            pending: false,
            error:
              cause instanceof Error
                ? cause.message
                : '목표를 저장하지 못했습니다. 다시 시도해주세요.',
          });
          if (cause instanceof ApiError && cause.status === 401) onAuthError(cause);
        }
        return false;
      } finally {
        if (writer.current === controller) writer.current = null;
        if (active.current === scope)
          setWrite((current) =>
            current.scope === scope ? { ...current, pending: false } : current,
          );
      }
    },
    [userId, enabled, month, scope, request, onAuthError],
  );
  const current = enabled && userId !== null && result.request === request;
  const ready = current && result.data !== null;
  return {
    goals: ready ? result.data! : EMPTY_GOALS,
    ready,
    saving,
    loading: enabled && userId !== null && !current,
    error: (current ? result.error : '') || (write.scope === scope ? write.error : ''),
    saveGoals,
    retry: () => setAttempt((value) => value + 1),
  };
}
