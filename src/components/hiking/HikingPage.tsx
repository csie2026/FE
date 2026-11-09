import { getErrorMessage } from '../../utils/errorMessages';
import { scoringText } from './services/scoringDisplay';
import {
  submitPendingActivity,
  describeSaveFailure,
  type ActivitySaveFailure,
} from './services/activitySave';
import HikingMap from './HikingMap';
import HikingControls from './HikingControls';
import MountainWeather from '../MountainWeather';
import { trackingStopMessages } from './services/sessionTracking';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type HikingActivity } from '../../api';
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
import { GPS_FILTER, SUMMIT_RADIUS_METERS } from './config';
import { loadHikingSelection, type HikingSelection } from './services/hikingNavigation';
import {
  readRecovery,
  writeRecovery,
  removeRecovery,
  recoveryKey,
  sessionFromDraft,
  completeSession,
  draftFromSession,
  type RecoveryRead,
  type RecoveryDraft,
  type RecoveryContext,
} from './services/sessionRecovery';

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
type HikingPageProps = {
  onOpenRecords: () => void;
  userId: number;
  onRestoreSelection: (selection: HikingSelection) => void;
  initialSelection: HikingSelection | null;
  onClearSelection: () => void;
  onWriteJournal: (record: HikingActivity) => void;
};

type SessionProps = {
  onOpenRecords: () => void;
  userId: number;
  recovery: RecoveryContext | null;
  onRecoveryRequired: () => void;
};
export default function HikingPage(props: HikingPageProps) {
  if (!window.isSecureContext || typeof window.crypto?.randomUUID !== 'function')
    return (
      <section className="hiking-page">
        <p role="alert">
          GPS 산행을 이용하려면 HTTPS 주소를 지원하는 최신 브라우저에서 열어주세요.
        </p>
      </section>
    );
  return <HikingSessionPage {...props} />;
}

function HikingSessionPage(props: HikingPageProps) {
  const [pendingRecovery, setPendingRecovery] = useState<RecoveryRead>(() =>
    readRecovery(props.userId),
  );
  const [recovery, setRecovery] = useState<RecoveryContext | null>(null);
  const [recoveryError, setRecoveryError] = useState('');
  const checkRecovery = useCallback(() => {
    setRecovery(null);
    setPendingRecovery(readRecovery(props.userId));
    setRecoveryError('');
  }, [props.userId]);
  const restore = (draft: RecoveryDraft, finish: boolean) => {
    try {
      const latest = readRecovery(props.userId);
      if (latest.kind !== 'ready' || latest.draft.clientRequestId !== draft.clientRequestId)
        throw new Error('복구 기록이 변경되었습니다. 다시 확인을 눌러 최신 기록을 확인해주세요.');
      draft = latest.draft;
      const ownerToken = crypto.randomUUID();
      const course = {
        mountainId: String(draft.mountainId),
        courseId: String(draft.courseId),
        mountainName: draft.mountainName,
        courseName: draft.courseName,
      };
      const session = finish
        ? completeSession(sessionFromDraft(draft), course)
        : sessionFromDraft(draft);
      const claimed = draftFromSession(session, course, props.userId, ownerToken);
      writeRecovery(claimed, 'claim');
      setRecovery({ draft: claimed, ownerToken });
      setRecoveryError('');
      props.onRestoreSelection({ mountainId: draft.mountainId, courseId: draft.courseId });
    } catch (cause) {
      setRecoveryError(
        getErrorMessage(cause, '산행 기록을 복구하지 못했습니다. 다시 시도해주세요.'),
      );
    }
  };
  const discard = () => {
    if (
      !window.confirm(
        '서버에 저장되지 않은 이 산행 임시 기록을 삭제할까요? 삭제 후에는 복구할 수 없습니다.',
      )
    )
      return;
    try {
      if (pendingRecovery.kind === 'ready')
        removeRecovery(props.userId, pendingRecovery.draft.clientRequestId);
      else {
        if (readRecovery(props.userId).kind === 'ready')
          throw new Error('복구 기록이 변경되었습니다. 다시 확인해주세요.');
        localStorage.removeItem(recoveryKey(props.userId));
      }
      checkRecovery();
    } catch {
      setRecoveryError('임시 기록을 삭제하지 못했습니다. 브라우저 저장 설정을 확인해주세요.');
    }
  };
  const changeCourse = () => {
    checkRecovery();
    props.onClearSelection();
  };
  if (!recovery && pendingRecovery.kind !== 'none')
    return (
      <section className="hiking-page recovery-panel">
        {pendingRecovery.kind === 'ready' ? (
          <>
            <h1>
              {pendingRecovery.draft.state === 'COMPLETED'
                ? '저장을 기다리는 산행이 있어요'
                : '이어서 진행할 산행이 있어요'}
            </h1>
            {pendingRecovery.draft.version === 1 && pendingRecovery.draft.state === 'COMPLETED' && (
              <p role="alert">
                구버전 종료 기록의 GPS 증거가 유실되었습니다. 기존 UUID로 서버 저장 여부를
                확인합니다. 미저장 기록은 새 API로 저장할 수 없으며 임시 기록은 보존됩니다.
              </p>
            )}
            <b>{pendingRecovery.draft.mountainName}</b>
            <p>{pendingRecovery.draft.courseName}</p>
            <p>
              기록 시간 {formatDuration(pendingRecovery.draft.accumulatedMs)} ·{' '}
              {(pendingRecovery.draft.distanceMeters / 1000).toFixed(2)}km
            </p>
            <p>
              {pendingRecovery.draft.state === 'COMPLETED'
                ? '산행은 종료되었습니다. 같은 저장 요청으로 재시도합니다.'
                : '새 산행을 시작하기 전에 기존 기록을 확인해주세요. 일시정지 상태로 복구하며, 수집이 중단된 시간과 이동은 더하지 않습니다.'}
            </p>
            <div className="recovery-actions">
              <button type="button" onClick={() => restore(pendingRecovery.draft, false)}>
                {pendingRecovery.draft.state === 'COMPLETED'
                  ? '종료 기록 저장 재시도'
                  : '이어서 진행'}
              </button>
              {pendingRecovery.draft.state !== 'COMPLETED' && (
                <button type="button" onClick={() => restore(pendingRecovery.draft, true)}>
                  산행 종료하고 저장
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <h1>산행 임시 기록 확인</h1>
            <p role="alert">{pendingRecovery.message}</p>
          </>
        )}
        {recoveryError && <p role="alert">{recoveryError}</p>}
        <div className="recovery-actions">
          <button type="button" onClick={checkRecovery}>
            다시 확인
          </button>
          <button type="button" onClick={discard}>
            임시 기록 삭제
          </button>
        </div>
        <p className="hiking-note">
          임시 위치 기록은 이 브라우저에 저장됩니다. 마지막 저장 후 7일간 복구할 수 있고, 만료된
          기록은 자동 복구가 중단되며 직접 삭제할 때까지 보관됩니다. 공용 기기에서는 저장 완료 또는
          임시 기록 삭제를 확인해주세요. 화면 잠금 중 GPS 수집은 보장되지 않습니다.
        </p>
      </section>
    );
  const selection = recovery
    ? { mountainId: recovery.draft.mountainId, courseId: recovery.draft.courseId }
    : props.initialSelection;
  if (selection)
    return (
      <LinkedHike
        key={`${selection.mountainId}:${selection.courseId}`}
        selection={recovery ? recovery.draft : selection}
        userId={props.userId}
        recovery={recovery}
        onRecoveryRequired={checkRecovery}
        onChangeCourse={changeCourse}
        onOpenRecords={props.onOpenRecords}
        onWriteJournal={props.onWriteJournal}
      />
    );
  return (
    <CoursePicker
      userId={props.userId}
      recovery={null}
      onRecoveryRequired={checkRecovery}
      onOpenRecords={props.onOpenRecords}
      onWriteJournal={props.onWriteJournal}
    />
  );
}

function LinkedHike({
  userId,
  recovery,
  onRecoveryRequired,
  selection,
  onChangeCourse,
  onOpenRecords,
  onWriteJournal,
}: SessionProps & {
  selection: HikingSelection;
  onChangeCourse: () => void;
  onWriteJournal: (record: HikingActivity) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ ...selection, attempt }), [selection, attempt]);
  const [result, setResult] = useState<{
    request: typeof request | null;
    course: HikingCourse | null;
    error: string;
  }>({ request: null, course: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    loadHikingSelection(selection, controller.signal)
      .then((course) => {
        if (!controller.signal.aborted) setResult({ request, course, error: '' });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            request,
            course: null,
            error:
              cause instanceof ApiError && cause.status === 401
                ? '로그인 세션이 만료되었습니다. 다시 로그인해주세요.'
                : cause instanceof ApiError && cause.status === 404
                  ? '선택한 산 또는 등산로를 찾을 수 없습니다. 다시 선택해주세요.'
                  : getErrorMessage(
                      cause,
                      '선택한 산행 경로를 불러오지 못했습니다. 다시 시도해주세요.',
                    ),
          });
      });
    return () => controller.abort();
  }, [request, selection]);
  if (result.request !== request)
    return (
      <section className="hiking-page">
        <p role="status">선택한 산과 등산로를 확인하는 중…</p>
      </section>
    );
  if (!result.course)
    return (
      <section className="hiking-page">
        <div role="alert">
          <p>{result.error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            다시 시도
          </button>
          <button type="button" onClick={onChangeCourse}>
            다른 산·등산로 선택
          </button>
        </div>
      </section>
    );
  return (
    <ActiveHike
      course={result.course}
      onChangeCourse={onChangeCourse}
      onOpenRecords={onOpenRecords}
      onWriteJournal={onWriteJournal}
      userId={userId}
      recovery={recovery}
      onRecoveryRequired={onRecoveryRequired}
    />
  );
}

// 실제 DB 산 목록에서 산·코스를 고른 뒤 상세 경로를 검증해 화면 내 GPS 기록 세션으로 연결한다.
function CoursePicker({
  userId,
  onRecoveryRequired,
  onOpenRecords,
  onWriteJournal,
}: SessionProps & { onWriteJournal: (record: HikingActivity) => void }) {
  const [choosing, setChoosing] = useState(false);
  const [mountains, setMountains] = useState<MountainOption[]>([]);
  const [mountain, setMountain] = useState<MountainOption | null>(null);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selected, setSelected] = useState<HikingCourse | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const courseRequest = useRef<AbortController | null>(null);
  useEffect(() => () => courseRequest.current?.abort(), []);
  // 산 선택에 따라 산 목록 또는 해당 산의 코스를 조회하며, 선택 변경 뒤 이전 응답은 반영하지 않는다.
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
          setError(getErrorMessage(cause, '목록을 불러오지 못했습니다. 다시 시도해주세요.'));
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
    courseRequest.current?.abort();
    const controller = new AbortController();
    courseRequest.current = controller;
    setLoading(true);
    setError('');
    try {
      const detail = await getCourse(option.id, controller.signal);
      if (controller.signal.aborted) return;
      if (detail.course.id !== option.id) throw new Error('선택한 등산로가 일치하지 않습니다.');
      setSelected(toHikingCourse(mountain, detail));
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(getErrorMessage(cause, '경로를 불러오지 못했습니다. 다시 시도해주세요.'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  if (selected)
    return (
      <ActiveHike
        key={selected.courseId}
        course={selected}
        userId={userId}
        recovery={null}
        onRecoveryRequired={onRecoveryRequired}
        onOpenRecords={onOpenRecords}
        onWriteJournal={onWriteJournal}
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
          화면이 숨겨진 것을 감지하면 일시정지합니다. 앱 전환이나 잠금 중에는 GPS 수집이 제한될 수
          있습니다. 복귀하면 산행 상태를 확인하고 계속하기를 눌러주세요.
        </p>
        <p className="hiking-note">
          방문 인증을 받으려면 GPS 이동 거리 500m 이상과 산행 시간 20분 이상을 모두 충족해야 합니다.
          일시정지한 시간은 산행 시간에 포함되지 않으며, 하루에 한 번만 인증받을 수 있습니다.
        </p>
      </div>
    </section>
  );
}

// 위치 수신과 기록 상태를 분리해 일시정지 중에는 기록 누적을 멈추고 완료 시 위치 감시도 종료한다.
// 종료한 세션의 요약을 저장한 뒤 사용자가 일지 작성을 선택한다.
function ActiveHike({
  userId,
  recovery,
  onRecoveryRequired,
  course,
  onChangeCourse,
  onOpenRecords,
  onWriteJournal,
}: SessionProps & {
  course: HikingCourse;
  onChangeCourse: () => void;
  onWriteJournal: (record: HikingActivity) => void;
}) {
  const session = useHikingSession(course, userId, recovery, onRecoveryRequired);
  const gps = useGeolocation(
    session.state !== 'COMPLETED' && !session.trackingStopReason,
    session.onPosition,
  );
  const usable = gps.status === 'AVAILABLE' && gps.position && isUsablePoint(gps.position);
  const remaining = usable ? distanceMeters(gps.position!, course.summitPoint) : null;
  const [saved, setSaved] = useState<HikingActivity | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ActivitySaveFailure | null>(null);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const { state: sessionState, pendingInput, isDurable, markSaved } = session;
  useEffect(() => {
    if (sessionState !== 'COMPLETED' || !pendingInput || !isDurable || saved) return;
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setSaving(true);
        setSaveError(null);
      }
    });
    submitPendingActivity(
      pendingInput,
      userId,
      controller.signal,
      undefined,
      recovery?.draft.version === 1 && recovery.draft.state === 'COMPLETED',
    )
      .then((record) => {
        if (!active) return;
        markSaved();
        setSaved(record);
      })
      .catch((cause: unknown) => {
        if (active) setSaveError(describeSaveFailure(cause));
      })
      .finally(() => {
        if (active) setSaving(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [sessionState, pendingInput, isDurable, markSaved, saved, saveAttempt, userId, recovery]);
  return (
    <section className="hiking-page" aria-label="GPS 등산 트래킹">
      <div className="hiking-course-heading">
        <div>
          <h1>{course.mountainName}</h1>
          <small>{course.courseName}</small>
        </div>
        <div className="hiking-heading-actions">
          <span className="hiking-state">
            {session.trackingStopReason && session.state === 'PAUSED'
              ? 'GPS 기록 중단'
              : labels[session.state]}
          </span>
          {(session.state === 'READY' || (session.state === 'COMPLETED' && saved)) && (
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
        {session.state === 'READY' && <MountainWeather mountainId={course.mountainId} />}
        {recovery &&
          session.clientRequestId === recovery.draft.clientRequestId &&
          session.state !== 'READY' && (
            <p className="hiking-note" role="status">
              {session.state === 'COMPLETED'
                ? '종료된 산행의 저장을 확인하고 있습니다.'
                : session.state === 'TRACKING'
                  ? '복구한 산행을 기록 중입니다.'
                  : '산행 기록을 복구했습니다. 위치를 확인하고 계속하기를 눌러주세요.'}
            </p>
          )}
        {session.trackingStopReason && session.state !== 'COMPLETED' && (
          <p role="alert" className="recovery-storage-error">
            {trackingStopMessages[session.trackingStopReason]}
          </p>
        )}
        {session.storageError && (
          <div role="alert" className="recovery-storage-error">
            <p>{session.storageError}</p>
            {session.state === 'READY' ? (
              <p>저장 공간을 확인한 뒤 등산 시작을 다시 눌러주세요.</p>
            ) : (
              <button type="button" onClick={session.retryCheckpoint}>
                임시 저장 다시 시도
              </button>
            )}
          </div>
        )}
        <div className="hiking-gps-status" role="status">
          {session.state === 'COMPLETED'
            ? saved
              ? 'GPS 추적 종료 · 등산기록이 저장되었습니다.'
              : 'GPS 추적 종료 · 등산기록을 저장해주세요.'
            : session.trackingStopReason
              ? 'GPS 수집 중단'
              : messages[gps.status]}
          {session.state !== 'COMPLETED' &&
            !session.trackingStopReason &&
            gps.status === 'AVAILABLE' &&
            gps.position && (
              <small>
                정확도 ±{Math.round(gps.position.accuracy)}m
                {gps.position.accuracy > GPS_FILTER.maxAccuracyMeters
                  ? ' · 정확도가 낮아 이 위치는 기록하지 않습니다. 탁 트인 곳에서 기다려주세요.'
                  : !usable && ' · 유효한 GPS 좌표를 기다립니다'}
              </small>
            )}
          {session.state !== 'COMPLETED' &&
            !session.trackingStopReason &&
            ['DENIED', 'UNAVAILABLE', 'TIMEOUT'].includes(gps.status) && (
              <button type="button" onClick={gps.retry}>
                위치 다시 확인
              </button>
            )}
        </div>
        {(saved ? saved.completed : session.reachedSummit) && (
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
        {session.state !== 'COMPLETED' ? (
          <HikingControls {...session} canStart={Boolean(usable)} />
        ) : (
          <div className="hiking-controls">
            {saving && <p role="status">등산기록 저장 중…</p>}
            {saveError && <p role="alert">{saveError.message}</p>}
            {!saved &&
              !saving &&
              saveError?.kind !== 'conflict' &&
              saveError?.kind !== 'rejected' && (
                <button
                  type="button"
                  disabled={!session.isDurable}
                  onClick={() => setSaveAttempt((value) => value + 1)}
                >
                  저장 다시 시도
                </button>
              )}
            {!saved &&
              saveError &&
              (saveError.kind === 'conflict' || saveError.kind === 'rejected') && (
                <button type="button" onClick={onOpenRecords}>
                  저장된 산행 확인
                </button>
              )}
            {saved && (
              <>
                <p role="status">{scoringText(saved.scoring)}</p>
                <button
                  type="button"
                  className="hiking-primary"
                  onClick={() => onWriteJournal(saved)}
                >
                  등산일지 작성
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (session.reset()) {
                      setSaved(null);
                      setSaveError(null);
                    }
                  }}
                >
                  새 산행 준비
                </button>
              </>
            )}
          </div>
        )}
        <p className="hiking-note">
          정상 도달 반경 {SUMMIT_RADIUS_METERS}m · GPS 정확도 {GPS_FILTER.maxAccuracyMeters}m 이내
        </p>
        <p className="hiking-note">
          화면이 숨겨진 것을 감지하면 일시정지합니다. 앱 전환이나 잠금 중에는 GPS 수집이 제한될 수
          있습니다. 복귀하면 상태를 확인하세요. 등산 메뉴에서 마지막으로 저장된 기록을 7일간 복구할
          수 있습니다.
        </p>
        <p className="hiking-note">
          방문 인증을 받으려면 GPS 이동 거리 500m 이상과 산행 시간 20분 이상을 모두 충족해야 합니다.
          일시정지한 시간은 산행 시간에 포함되지 않으며, 하루에 한 번만 인증받을 수 있습니다.
        </p>
      </div>
    </section>
  );
}
