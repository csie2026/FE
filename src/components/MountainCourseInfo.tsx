import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import { getCourses, type CourseOption } from './hiking/services/courseApi';
import type { HikingSelection } from './hiking/services/hikingNavigation';

const difficultyLabels: Record<string, string> = { EASY: '쉬움', NORMAL: '보통', HARD: '어려움' };

// Mounted only when a detail is open; stale responses cannot overwrite another mountain.
export default function MountainCourseInfo({
  mountainId,
  onSelectCourse,
}: {
  mountainId: string;
  onSelectCourse?: (selection: HikingSelection) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ mountainId, attempt }), [mountainId, attempt]);
  const [result, setResult] = useState<{
    request: typeof request | null;
    courses: CourseOption[];
    loading: boolean;
    error: string;
  }>({ request: null, courses: [], loading: true, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    getCourses(Number(mountainId), controller.signal)
      .then((courses) => {
        if (courses.some((course) => String(course.mountainId) !== mountainId))
          throw new Error('Course mismatch');
        if (!controller.signal.aborted) setResult({ request, courses, loading: false, error: '' });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            request,
            courses: [],
            loading: false,
            error:
              cause instanceof ApiError && cause.status === 401
                ? '로그인 세션이 만료되었습니다. 다시 로그인해주세요.'
                : '등산로 정보를 불러오지 못했습니다.',
          });
      });
    return () => controller.abort();
  }, [mountainId, request]);
  if (result.request !== request || result.loading)
    return <p role="status">등산로 정보를 불러오는 중…</p>;
  if (result.error)
    return (
      <div role="alert">
        <p>{result.error}</p>
        <button type="button" onClick={() => setAttempt((v) => v + 1)}>
          다시 시도
        </button>
      </div>
    );
  if (!result.courses.length)
    return <p>등록된 등산로가 없습니다. 거리·난이도 정보가 제공되지 않습니다.</p>;
  return (
    <section className="mountain-course-info" aria-label="실제 등산로 정보">
      <h3>등산로 {result.courses.length}개</h3>
      <p>거리와 난이도는 각 코스 기준입니다.</p>
      <ul>
        {result.courses.map((course) => (
          <li key={course.id}>
            <b>{course.name}</b>
            <span>
              {typeof course.lengthKm === 'number' && Number.isFinite(course.lengthKm)
                ? `${course.lengthKm}km`
                : '거리 미제공'}{' '}
              · {difficultyLabels[course.difficulty] ?? '난이도 미제공'}
            </span>
            {onSelectCourse && (
              <button
                type="button"
                className="course-start-button"
                onClick={() =>
                  onSelectCourse({ mountainId: Number(mountainId), courseId: course.id })
                }
                aria-label={`${course.name} 선택하고 GPS 산행 준비`}
              >
                산행 준비
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
