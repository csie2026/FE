import { useEffect, useRef, useState } from 'react';
import { getHikingRecord, type HikingActivity } from '../../api';
import { getErrorMessage } from '../../utils/errorMessages';

const dateTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function elapsedText(elapsedMs: number) {
  const seconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return [hours ? `${hours}시간` : '', minutes ? `${minutes}분` : '', `${remaining}초`]
    .filter(Boolean)
    .join(' ');
}

function averageSpeed(record: HikingActivity) {
  if (record.elapsedMs === 0) return '0.0km/h';
  return `${((record.distanceMeters / record.elapsedMs) * 3600).toFixed(1)}km/h`;
}

export default function HikingRecordDetails({
  recordId,
  onLoaded,
}: {
  recordId: number;
  onLoaded?: (record: HikingActivity) => void;
}) {
  const request = useRef<AbortController | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<HikingActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );

  async function load() {
    // 빠른 재시도나 패널 닫기 뒤 이전 요청 결과가 화면을 덮어쓰지 않도록 먼저 취소한다.
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const record = await getHikingRecord(recordId, controller.signal);
      if (controller.signal.aborted) return;
      setDetail(record);
      onLoaded?.(record);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(getErrorMessage(cause, '산행 기록 상세를 불러오지 못했습니다. 다시 시도해주세요.'));
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function toggle() {
    if (expanded) {
      // 상세 패널을 닫으면 진행 중인 조회도 함께 종료해 보이지 않는 상태 갱신을 막는다.
      request.current?.abort();
      request.current = null;
      setLoading(false);
      setExpanded(false);
      return;
    }
    setExpanded(true);
    void load();
  }

  const panelId = `hiking-record-detail-${recordId}`;
  return (
    <section className="hiking-record-card__detail">
      <button
        type="button"
        className="hiking-record-card__detail-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={toggle}
      >
        {expanded ? '기록 상세 닫기' : '기록 상세 보기'}
      </button>
      {expanded && (
        <div id={panelId} className="hiking-record-card__detail-panel" aria-busy={loading}>
          {loading && !detail ? (
            <p role="status">상세 기록을 불러오는 중…</p>
          ) : error && !detail ? (
            <div className="hiking-record-card__detail-error">
              <p role="alert">{error}</p>
              <button type="button" onClick={() => void load()}>
                다시 불러오기
              </button>
            </div>
          ) : detail ? (
            <dl>
              <div>
                <dt>산행 시작</dt>
                <dd>{dateTime.format(new Date(detail.startedAt))}</dd>
              </div>
              <div>
                <dt>산행 종료</dt>
                <dd>{dateTime.format(new Date(detail.endedAt))}</dd>
              </div>
              <div>
                <dt>활동 시간</dt>
                <dd>{elapsedText(detail.elapsedMs)}</dd>
              </div>
              <div>
                <dt>평균 속도</dt>
                <dd>{averageSpeed(detail)}</dd>
              </div>
              <div>
                <dt>코스 유형</dt>
                <dd>{detail.courseId === null ? '자유 산행' : '선택 코스'}</dd>
              </div>
              <div>
                <dt>GPS 검증</dt>
                <dd>{detail.gpsValidationVersion === 1 ? '서버 검증 완료' : '일반 산행 기록'}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      )}
    </section>
  );
}
