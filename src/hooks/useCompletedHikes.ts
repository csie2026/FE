import { useEffect, useMemo, useState } from 'react';
import { ApiError, getHikingRecords, type HikingActivity } from '../api';
import { summarizeCompletedHikes } from '../services/completedHikes';

export function useCompletedHikes(userId: number | null, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ userId, enabled, attempt }), [userId, enabled, attempt]);
  const [result, setResult] = useState<{
    request: typeof request | null;
    activities: HikingActivity[];
    error: string;
  }>({ request: null, activities: [], error: '' });
  useEffect(() => {
    if (userId === null || !enabled) return;
    const controller = new AbortController();
    getHikingRecords(controller.signal)
      .then((activities) => {
        if (!controller.signal.aborted) setResult({ request, activities, error: '' });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            request,
            activities: [],
            error:
              cause instanceof ApiError && cause.status === 401
                ? '로그인 세션이 만료되었습니다. 다시 로그인해주세요.'
                : 'GPS 완등 기록을 불러오지 못했습니다. 다시 시도해주세요.',
          });
      });
    return () => controller.abort();
  }, [userId, enabled, request]);
  const current = enabled && userId !== null && result.request === request;
  const summary = useMemo(
    () => summarizeCompletedHikes(current ? result.activities : []),
    [current, result.activities],
  );
  return {
    ...summary,
    loading: enabled && userId !== null && !current,
    error: current ? result.error : '',
    retry: () => setAttempt((value) => value + 1),
  };
}
