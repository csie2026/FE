import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import { getMountains } from '../components/hiking/services/courseApi';
import { toExploreMountain } from '../services/exploreMountains';
import type { Mountain } from '../data/exploreRegions';

export function useExploreMountains(userId: number | null) {
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ userId, attempt }), [userId, attempt]);
  const [result, setResult] = useState<{
    request: typeof request | null;
    items: Mountain[];
    loading: boolean;
    error: string;
  }>({ request: null, items: [], loading: false, error: '' });
  useEffect(() => {
    if (userId === null) return;
    const controller = new AbortController();
    getMountains(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted)
          setResult({ request, items: items.map(toExploreMountain), loading: false, error: '' });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          request,
          items: [],
          loading: false,
          error:
            cause instanceof ApiError && cause.status === 401
              ? '로그인 세션이 만료되었습니다. 다시 로그인해주세요.'
              : '산 목록을 불러오지 못했습니다. 다시 시도해주세요.',
        });
      });
    return () => controller.abort();
  }, [userId, request]);
  // 계정 전환 중에는 이전 회원의 조회 결과를 노출하지 않는다.
  const current = userId !== null && result.request === request;
  return {
    items: current ? result.items : [],
    loading: userId !== null && (!current || result.loading),
    error: current ? result.error : '',
    retry: () => setAttempt((value) => value + 1),
  };
}
