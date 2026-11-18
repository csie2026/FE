import type { HikingActivity } from '../../api';
import {
  canCreateHikingJournal,
  JOURNAL_ELIGIBILITY_MESSAGE,
} from '../../services/journalEligibility';
import HikingRecordCard from '../profile/HikingRecordCard';
import HikingRecordDetails from '../profile/HikingRecordDetails';

type Props = {
  busy: boolean;
  records: HikingActivity[];
  onRecordLoaded: (record: HikingActivity) => void;
  onOpenJournal: (journalId: number) => void;
  onWriteJournal: (record: HikingActivity) => void;
};

export default function HikingRecordsScreen({
  busy,
  records,
  onRecordLoaded,
  onOpenJournal,
  onWriteJournal,
}: Props) {
  return (
    <section className="scroll-content utility-content hiking-records-list">
      {busy ? (
        <p role="status">불러오는 중…</p>
      ) : records.length ? (
        records.map((record) => (
          <HikingRecordCard
            record={record}
            key={record.id}
            details={<HikingRecordDetails recordId={record.id} onLoaded={onRecordLoaded} />}
          >
            {record.journalId !== null ? (
              <button onClick={() => onOpenJournal(record.journalId!)}>등산일지 보기</button>
            ) : (
              <div style={{ width: '100%', minWidth: 0 }}>
                <button
                  disabled={!canCreateHikingJournal(record)}
                  aria-describedby={
                    !canCreateHikingJournal(record) ? `journal-eligibility-${record.id}` : undefined
                  }
                  onClick={() => {
                    if (canCreateHikingJournal(record)) onWriteJournal(record);
                  }}
                >
                  등산일지 작성
                </button>
                {!canCreateHikingJournal(record) && (
                  <p
                    id={`journal-eligibility-${record.id}`}
                    className="muted"
                    style={{ fontSize: 12, lineHeight: 1.7, margin: '10px 0 0' }}
                  >
                    {JOURNAL_ELIGIBILITY_MESSAGE}
                  </p>
                )}
              </div>
            )}
          </HikingRecordCard>
        ))
      ) : (
        <p>저장된 등산기록이 없습니다.</p>
      )}
    </section>
  );
}
