import { useEffect, useMemo, useState } from 'react';
import { ApiError, getHikingRecords, type HikingActivity } from '../api';
import { koreanMonthBounds, summarizeHikingActivities } from '../services/hikingStatistics';
import { readRefreshState } from '../services/refreshState';

// One owned-activity request supplies both the mountain collection and all profile statistics.
export function useCompletedHikes(userId: number | null, enabled: boolean, refreshKey = 0) {
  const [attempt, setAttempt] = useState(0);
  const [month, setMonth] = useState(() => koreanMonthBounds().key);
  const scope = useMemo(() => ({ userId, enabled }), [userId, enabled]);
  const request = useMemo(() => ({ scope, attempt, refreshKey }), [scope, attempt, refreshKey]);
  const [result, setResult] = useState<{
    request: typeof request | null;
    data: HikingActivity[] | null;
    error: string;
  }>({ request: null, data: null, error: '' });
  useEffect(() => {
    if (userId === null || !enabled) return;
    const controller = new AbortController();
    getHikingRecords(controller.signal)
      .then((activities) => {
        if (!controller.signal.aborted) {
          // Reject unusable data instead of displaying a successful zero or partial total.
          summarizeHikingActivities(activities);
          setMonth(koreanMonthBounds().key);
          setResult({ request, data: activities, error: '' });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            request,
            data: null,
            error:
              cause instanceof ApiError && cause.status === 401
                ? '로그인 세션이 만료되었습니다. 다시 로그인해주세요.'
                : 'GPS 산행 통계를 불러오지 못했습니다. 다시 시도해주세요.',
          });
      });
    return () => controller.abort();
  }, [userId, enabled, request]);
  useEffect(() => {
    if (!enabled || userId === null) return;
    let timer: number;
    const schedule = () => {
      // Limit long month timers to avoid the browser's 32-bit timeout overflow.
      const delay = Math.min(86_400_000, Math.max(1, koreanMonthBounds().end - Date.now() + 20));
      timer = window.setTimeout(() => {
        setMonth(koreanMonthBounds().key);
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [enabled, userId]);
  const view = readRefreshState(enabled && userId !== null, request, result);
  const summary = useMemo(
    () => summarizeHikingActivities(view.data ?? [], Date.parse(`${month}-01T00:00:00+09:00`)),
    // The month key invalidates cached totals when the KST month changes on an open page.
    [view.data, month],
  );
  return {
    ...summary,
    count: summary.statistics.completedHikeCount,
    loading: view.loading,
    error: view.error,
    retry: () => setAttempt((value) => value + 1),
  };
}
