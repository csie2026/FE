import { useEffect, useMemo, useState } from 'react';
import { ApiError, getHikingRecords, type HikingActivity } from '../api';
import { koreanMonthBounds, summarizeHikingActivities } from '../services/hikingStatistics';

// 본인 산행 기록을 한 번 조회해 완등한 산 목록과 프로필 산행 통계에 함께 사용한다.
export function useCompletedHikes(userId: number | null, enabled: boolean, refreshKey = 0) {
  const [attempt, setAttempt] = useState(0);
  const [month, setMonth] = useState(() => koreanMonthBounds().key);
  const request = useMemo(
    () => ({ userId, enabled, attempt, refreshKey }),
    [userId, enabled, attempt, refreshKey],
  );
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
        if (!controller.signal.aborted) {
          // 잘못된 데이터를 정상적인 0이나 일부 합계로 표시하지 않고 오류로 처리한다.
          summarizeHikingActivities(activities);
          setMonth(koreanMonthBounds().key);
          setResult({ request, activities, error: '' });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            request,
            activities: [],
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
      // 월 전환까지 남은 시간이 길어도 브라우저 타이머의 32비트 범위를 넘지 않게 나눠 예약한다.
      const delay = Math.min(86_400_000, Math.max(1, koreanMonthBounds().end - Date.now() + 20));
      timer = window.setTimeout(() => {
        setMonth(koreanMonthBounds().key);
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [enabled, userId]);
  const current = enabled && userId !== null && result.request === request;
  const summary = useMemo(
    () =>
      summarizeHikingActivities(
        current && !result.error ? result.activities : [],
        Date.parse(`${month}-01T00:00:00+09:00`),
      ),
    // 화면이 열린 상태에서 한국 시간 기준 월이 바뀌면 월 키를 갱신해 통계를 다시 계산한다.
    [current, result.activities, result.error, month],
  );
  return {
    ...summary,
    count: summary.statistics.completedHikeCount,
    loading: enabled && userId !== null && !current,
    error: current ? result.error : '',
    retry: () => setAttempt((value) => value + 1),
  };
}
