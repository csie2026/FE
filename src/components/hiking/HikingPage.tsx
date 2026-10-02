import HikingMap from './HikingMap';
import HikingControls from './HikingControls';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api';
import { filterMountains } from './services/mountainSearch';
import {
  getMountains,
  getCourses,
  getCourse,
  toHikingCourse,
  type MountainOption,
  type CourseOption,
} from './services/courseApi';
import { useGeolocation } from './hooks/useGeolocation';
import { useHikingSession } from './hooks/useHikingSession';
import { distanceMeters, formatDuration, isUsablePoint } from './trackUtils';
import type { HikingCourse, LocationStatus } from './types';
import './HikingPage.css';

const messages: Record<LocationStatus, string> = {
  IDLE: '현재 위치 확인 준비',
  REQUESTING: '위치 권한 요청 중 · GPS 수신을 기다립니다',
  AVAILABLE: '현재 위치 수신 중',
  DENIED: '위치 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.',
  UNAVAILABLE: '위치를 사용할 수 없습니다. HTTPS 연결과 기기 위치 서비스를 확인해주세요.',
  TIMEOUT: '위치 수신 시간이 초과되었습니다. 탁 트인 곳에서 다시 시도해주세요.',
};
const labels = {
  READY: '산행 준비',
  TRACKING: '산행 기록 중',
  PAUSED: '일시정지',
  COMPLETED: '산행 완료',
};
export default function HikingPage() {
  const [choosing, setChoosing] = useState(false);
  const [mountains, setMountains] = useState<MountainOption[]>([]);
  const [mountain, setMountain] = useState<MountainOption | null>(null);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selected, setSelected] = useState<HikingCourse | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!choosing || selected) return;
    let active = true;
    const request = mountain ? getCourses(mountain.id) : getMountains();
    request
      .then((result) => {
        if (!active) return;
        if (mountain) setCourses(result as CourseOption[]);
        else setMountains(result as MountainOption[]);
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          setError('로그인 세션이 만료되었습니다. 다시 로그인한 뒤 목록을 불러와주세요.');
        } else if (cause instanceof ApiError && cause.status === 404) {
          setError(
            '산·코스 조회 API를 찾을 수 없습니다. 백엔드에 최신 조회 API가 적용되었는지 확인해주세요.',
          );
        } else {
          setError(cause instanceof Error ? cause.message : '목록을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [choosing, mountain, selected, attempt]);

  async function selectCourse(option: CourseOption) {
    if (!mountain) return;
    setLoading(true);
    setError('');
    try {
      setSelected(toHikingCourse(mountain, await getCourse(option.id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '경로를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  if (selected)
    return (
      <ActiveHike
        key={selected.courseId}
        course={selected}
        onChangeCourse={() => {
          setSelected(null);
          setError('');
          setLoading(true);
        }}
      />
    );

  const filtered = filterMountains(mountains, query);
  return (
    <section className="hiking-page" aria-label="GPS 등산 트래킹">
      <div className="hiking-course-heading">
        <div>
          <h1>산행 코스</h1>
          <small>경로를 선택해주세요</small>
        </div>
        <span className="hiking-state">{labels.READY}</span>
      </div>
      <div className="hiking-map" aria-label="등산 경로 선택 영역">
        <div className="hiking-selection">
          {!choosing ? (
            <div className="hiking-welcome">
              <span className="hiking-welcome-icon" aria-hidden="true">
                ♧
              </span>
              <h1>어느 산에 오를까요?</h1>
              <p>산과 코스를 선택하고 산행을 시작해보세요.</p>
              <button
                type="button"
                className="hiking-select-primary"
                onClick={() => {
                  setError('');
                  setChoosing(true);
                  setLoading(true);
                }}
              >
                경로 선택하기
              </button>
            </div>
          ) : (
            <>
              <div className="hiking-selection-header">
                <button
                  type="button"
                  className="hiking-back"
                  disabled={loading}
                  onClick={() => {
                    if (mountain) {
                      setMountain(null);
                      setCourses([]);
                      setLoading(true);
                    } else setChoosing(false);
                    setError('');
                  }}
                >
                  ← {mountain ? '산 목록' : '돌아가기'}
                </button>
                <h1>{mountain ? mountain.name : '산 선택하기'}</h1>
                <p>
                  {mountain
                    ? `${mountain.city} · 높이 ${mountain.height.toLocaleString()}m`
                    : '오르고 싶은 산을 선택해주세요.'}
                </p>
                {!mountain && (
                  <input
                    className="hiking-search"
                    type="search"
                    aria-label="산 이름 또는 시군 검색"
                    placeholder="산 이름 또는 시·군 검색"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                )}
              </div>
              {loading && (
                <p className="hiking-list-message" role="status">
                  {mountain ? '코스를 불러오는 중…' : '산 목록을 불러오는 중…'}
                </p>
              )}
              {error && (
                <div className="hiking-list-message" role="alert">
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      setError('');
                      setAttempt((value) => value + 1);
                    }}
                  >
                    다시 불러오기
                  </button>
                </div>
              )}
              {!loading && !error && (
                <div className="hiking-option-list">
                  {mountain ? (
                    <>
                      <p className="hiking-list-caption">
                        코스 {courses.length}개 · 거리와 소요시간은 편도 기준입니다.
                      </p>
                      {courses.length === 0 && (
                        <p className="hiking-list-message">
                          이 산에는 아직 등록된 코스가 없습니다. 다른 산을 선택해주세요.
                        </p>
                      )}
                      {courses.map((option) => (
                        <button
                          type="button"
                          className="hiking-option"
                          key={option.id}
                          onClick={() => selectCourse(option)}
                        >
                          <span className="hiking-option-title">
                            {option.name}
                            <span aria-hidden="true">›</span>
                          </span>
                          <span>출발 · {option.startName}</span>
                          <span className="hiking-option-meta">
                            {option.lengthKm.toFixed(1)}km · 오르막 {option.upMin}분 · 내리막{' '}
                            {option.downMin}분
                          </span>
                          <span
                            className={`hiking-difficulty hiking-difficulty-${option.difficulty.toLowerCase()}`}
                          >
                            {{ EASY: '쉬움', NORMAL: '보통', HARD: '어려움' }[option.difficulty]}
                          </span>
                          {option.risk && <span className="hiking-risk">주의 · {option.risk}</span>}
                        </button>
                      ))}
                      {courses.length > 0 && (
                        <p className="hiking-note">
                          출처: 산림청·시선아이티(CC BY), © OpenStreetMap contributors(ODbL),
                          Copernicus DEM. 과거 조사 자료이므로 현장 통행 안내를 확인해주세요.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="hiking-list-caption">산 {filtered.length}개</p>
                      {filtered.length === 0 && (
                        <p className="hiking-list-message">검색 결과가 없습니다.</p>
                      )}
                      {filtered.map((item) => (
                        <button
                          type="button"
                          className="hiking-option"
                          key={item.id}
                          onClick={() => {
                            setMountain(item);
                            setCourses([]);
                            setLoading(true);
                          }}
                        >
                          <span className="hiking-option-title">
                            {item.name}
                            <span aria-hidden="true">›</span>
                          </span>
                          <span>
                            {item.city} · {item.height.toLocaleString()}m
                          </span>
                          <span className="hiking-option-meta">
                            {item.courseCount ? `코스 ${item.courseCount}개` : '등록된 코스 없음'}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="hiking-panel">
        <div className="hiking-gps-status" role="status">
          코스를 선택하면 현재 위치를 확인합니다.
        </div>
        <dl className="hiking-stats">
          <div>
            <dt>정상까지 직선거리</dt>
            <dd>—</dd>
          </div>
          <div>
            <dt>현재까지 이동 거리</dt>
            <dd>
              0.00 <small>km</small>
            </dd>
          </div>
          <div>
            <dt>등산 시간 · 휴식 제외</dt>
            <dd>00:00:00</dd>
          </div>
          <div>
            <dt>평균 이동 속도</dt>
            <dd>
              0.0 <small>km/h</small>
            </dd>
          </div>
        </dl>
        <div className="hiking-controls">
          <button type="button" className="hiking-primary" disabled>
            등산 시작
          </button>
        </div>
        <p className="hiking-note">
          화면을 켠 상태에서 이용해주세요. 화면 이탈·새로고침 시 기록이 사라집니다. 화면이
          비활성화되면 자동 일시정지됩니다.
        </p>
      </div>
    </section>
  );
}

function ActiveHike({
  course,
  onChangeCourse,
}: {
  course: HikingCourse;
  onChangeCourse: () => void;
}) {
  const session = useHikingSession(course);
  const gps = useGeolocation(session.state !== 'COMPLETED', session.onPosition);
  const usable = gps.status === 'AVAILABLE' && gps.position && isUsablePoint(gps.position);
  const remaining = usable ? distanceMeters(gps.position!, course.summitPoint) : null;
  return (
    <section className="hiking-page" aria-label="GPS 등산 트래킹">
      <div className="hiking-course-heading">
        <div>
          <h1>{course.mountainName}</h1>
          <small>{course.courseName}</small>
        </div>
        <div className="hiking-heading-actions">
          <span className="hiking-state">{labels[session.state]}</span>
          {(session.state === 'READY' || session.state === 'COMPLETED') && (
            <button type="button" className="hiking-back" onClick={onChangeCourse}>
              경로 변경
            </button>
          )}
        </div>
      </div>
      <HikingMap
        course={course}
        position={gps.position}
        segments={session.segments}
        state={session.state}
      />
      <div className="hiking-panel">
        <div className="hiking-gps-status" role="status">
          {session.state === 'COMPLETED'
            ? 'GPS 추적 종료 · 기록은 이 화면에서만 유지됩니다.'
            : messages[gps.status]}
          {session.state !== 'COMPLETED' && gps.status === 'AVAILABLE' && gps.position && (
            <small>
              정확도 ±{Math.round(gps.position.accuracy)}m
              {!usable ? ' · 유효한 GPS 좌표를 기다립니다' : ''}
            </small>
          )}
          {session.state !== 'COMPLETED' &&
            ['DENIED', 'UNAVAILABLE', 'TIMEOUT'].includes(gps.status) && (
              <button type="button" onClick={gps.retry}>
                위치 다시 확인
              </button>
            )}
        </div>
        {session.reachedSummit && (
          <p className="hiking-summit" role="status">
            정상 도달
          </p>
        )}
        <dl className="hiking-stats">
          <div>
            <dt>정상까지 직선거리</dt>
            <dd>{remaining === null ? '—' : `${(remaining / 1000).toFixed(2)} km`}</dd>
          </div>
          <div>
            <dt>현재까지 이동 거리</dt>
            <dd>
              {(session.distance / 1000).toFixed(2)} <small>km</small>
            </dd>
          </div>
          <div>
            <dt>등산 시간 · 휴식 제외</dt>
            <dd>{formatDuration(session.elapsedMs)}</dd>
          </div>
          <div>
            <dt>평균 이동 속도</dt>
            <dd>
              {session.averageSpeed.toFixed(1)} <small>km/h</small>
            </dd>
          </div>
        </dl>
        <HikingControls {...session} canStart={Boolean(usable)} />
        <p className="hiking-note">
          화면을 켠 상태에서 이용해주세요. 화면 이탈·새로고침 시 기록이 사라집니다. 화면이
          비활성화되면 자동 일시정지됩니다.
        </p>
      </div>
    </section>
  );
}
