import { useCallback, useEffect, useRef, useState } from 'react';
import { GPS_FILTER } from '../config';
import { acceptTrackPoint, hasReachedSummit, trackDistance } from '../trackUtils';
import type { GpsPoint, HikingCourse, HikingState } from '../types';

type Session = {
  state: HikingState;
  segments: GpsPoint[][];
  activeSince: number | null;
  accumulatedMs: number;
  reachedSummit: boolean;
};
const initialSession = (): Session => ({ state: 'READY', segments: [], activeSince: null, accumulatedMs: 0, reachedSummit: false });
export function useHikingSession(course: HikingCourse) {
  const [session, setSession] = useState<Session>(initialSession);
  const sessionRef = useRef<Session>(session);
  const [now, setNow] = useState(() => Date.now());
  const publish = useCallback((next: Session) => {
    sessionRef.current = next;
    setSession(next);
    setNow(Date.now());
  }, []);
  const onPosition = useCallback((point: GpsPoint) => {
    const current = sessionRef.current;
    if (current.state !== 'TRACKING' || point.timestamp < current.activeSince!) return;
    const lastSegment = current.segments.at(-1) ?? [];
    const previous = lastSegment.at(-1);
    const gap = previous && point.timestamp - previous.timestamp > GPS_FILTER.maxGapMs;
    if (!acceptTrackPoint(point, gap ? undefined : previous)) return;
    const segments = gap ? [...current.segments, [point]] :
      [...current.segments.slice(0, -1), [...lastSegment, point]];
    publish({ ...current, segments, reachedSummit: current.reachedSummit || hasReachedSummit(point, course.summitPoint) });
  }, [course, publish]);
  const start = () => {
    if (sessionRef.current.state !== 'READY') return;
    publish({ ...initialSession(), state: 'TRACKING', activeSince: Date.now(), segments: [[]] });
  };
  const pause = () => {
    const current = sessionRef.current;
    if (current.state !== 'TRACKING') return;
    publish({ ...current, state: 'PAUSED', accumulatedMs: current.accumulatedMs + Date.now() - current.activeSince!, activeSince: null });
  };
  const resume = () => {
    const current = sessionRef.current;
    if (current.state !== 'PAUSED') return;
    publish({ ...current, state: 'TRACKING', activeSince: Date.now(), segments: [...current.segments, []] });
  };
  const complete = () => {
    const current = sessionRef.current;
    if (current.state !== 'TRACKING' && current.state !== 'PAUSED') return;
    publish({ ...current, state: 'COMPLETED', accumulatedMs: current.accumulatedMs +
      (current.activeSince === null ? 0 : Date.now() - current.activeSince), activeSince: null });
  };
  useEffect(() => {
    if (session.state !== 'TRACKING') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session.state]);
  // 화면 비활성화 시 자동 일시정지하여 백그라운드 기록을 전제로 하지 않습니다.
  useEffect(() => {
    const hide = () => {
      const current = sessionRef.current;
      if (document.hidden && current.state === 'TRACKING') {
        publish({ ...current, state: 'PAUSED', accumulatedMs: current.accumulatedMs + Date.now() - current.activeSince!, activeSince: null });
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [publish]);
  const elapsedMs = session.accumulatedMs + (session.activeSince === null ? 0 : Math.max(0, now - session.activeSince));
  const distance = trackDistance(session.segments);
  return { ...session, elapsedMs, distance, averageSpeed: elapsedMs ? distance / elapsedMs * 3600 : 0,
    onPosition, start, pause, resume, complete, reset: () => publish(initialSession()) };
}
