import type { ReactNode } from 'react';
import type { HikingActivity } from '../../api';
import { isVerifiedSummit } from '../../services/activityCertification';
import { scoringText } from '../hiking/services/scoringDisplay';
import './HikingRecordCard.css';

export default function HikingRecordCard({
  record,
  children,
}: {
  record: HikingActivity;
  children: ReactNode;
}) {
  const verified = isVerifiedSummit(record);
  const scoreLines = scoringText(record.scoring).split(' · ');
  return (
    <article className="hiking-record-card" aria-labelledby={`hike-title-${record.id}`}>
      <header className="hiking-record-card__header">
        <div>
          <h2 id={`hike-title-${record.id}`}>{record.mountainName}</h2>
          <time dateTime={record.hikingDate}>{record.hikingDate}</time>
        </div>
        <span
          className={`hiking-record-card__badge${verified ? ' hiking-record-card__badge--verified' : ''}`}
        >
          {verified ? '인증 완등' : record.completed ? '정상 도달 기록' : '산행 종료'}
        </span>
      </header>

      <dl className="hiking-record-card__metrics" aria-label="산행 거리와 시간">
        <div>
          <dt>이동 거리</dt>
          <dd>
            <strong>{(record.distanceMeters / 1000).toFixed(1)}</strong>
            <span>km</span>
          </dd>
        </div>
        <div>
          <dt>산행 시간</dt>
          <dd>
            <strong>{Math.floor(record.elapsedMs / 60000)}</strong>
            <span>분</span>
          </dd>
        </div>
      </dl>
      <p className="hiking-record-card__verification">
        GPS 정상 인증 <b>{verified ? '확인됨' : '확인되지 않음'}</b>
      </p>

      <div className="hiking-record-card__score" aria-label="서버 점수 산정 결과">
        {record.scoring?.status === 'CERTIFIED' ? (
          <>
            <p className="hiking-record-card__score-title">{scoreLines[0]}</p>
            <dl className="hiking-record-card__points">
              <div>
                <dt>방문 점수</dt>
                <dd>
                  {record.scoring.visitPoints}
                  <span>점</span>
                </dd>
              </div>
              <div>
                <dt>완등 점수</dt>
                <dd>
                  {record.scoring.summitPoints}
                  <span>점</span>
                </dd>
              </div>
            </dl>
          </>
        ) : record.scoring?.status === 'GPS_REQUIRED' ? (
          <>
            <p className="hiking-record-card__score-title">산행 기록 저장 완료</p>
            <p>유효한 GPS 거리 근거가 없어 산행 점수가 지급되지 않았습니다.</p>
          </>
        ) : (
          scoreLines.map((line, index) => <p key={index}>{line}</p>)
        )}
      </div>
      <footer className="hiking-record-card__footer bottom-actions">{children}</footer>
    </article>
  );
}
