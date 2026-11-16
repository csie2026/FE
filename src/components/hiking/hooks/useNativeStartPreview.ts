import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { nativeLocation } from '../../../native/backgroundLocation';
import { acquireNativeStartPosition } from '../services/startValidation';
import type { GpsPoint, HikingCourse } from '../types';

type Preview = {
  course: HikingCourse;
  userId: number;
  point: GpsPoint | null;
  checking: boolean;
  error: string;
};

// iOS의 시작 버튼 표시용 단발 측정이며 산행 세션이나 경로를 생성하지 않는다.
export function useNativeStartPreview(enabled: boolean, course: HikingCourse, userId: number) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [now, setNow] = useState(Date.now);
  const active = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    let current = true;
    if (!enabled)
      queueMicrotask(() => {
        if (current) setPreview(null);
      });
    return () => {
      current = false;
      active.current?.abort();
      active.current = null;
    };
  }, [enabled, course, userId]);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      setNow(Date.now());
      if (document.hidden) {
        active.current?.abort();
        active.current = null;
        setPreview(null);
      }
    };
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled]);
  const retry = useCallback(async () => {
    if (!enabled || active.current || document.hidden) return;
    const controller = new AbortController();
    active.current = controller;
    setPreview({ course, userId, point: null, checking: true, error: '' });
    try {
      const point = await acquireNativeStartPosition(nativeLocation, controller.signal);
      if (active.current !== controller || controller.signal.aborted) return;
      setNow(Date.now());
      setPreview({ course, userId, point, checking: false, error: '' });
    } catch (cause) {
      if (active.current !== controller || controller.signal.aborted) return;
      setPreview({ course, userId, point: null, checking: false, error: (cause as Error).message });
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, [enabled, course, userId]);
  const current =
    enabled && preview?.course === course && preview.userId === userId ? preview : null;
  return {
    position: current?.point ?? null,
    checking: current?.checking ?? false,
    error: current?.error ?? '',
    now,
    retry,
  };
}
