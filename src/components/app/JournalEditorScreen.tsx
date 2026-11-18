import type { FormEvent } from 'react';
import type { HikingActivity } from '../../api';
import {
  canCreateHikingJournal,
  JOURNAL_ELIGIBILITY_MESSAGE,
} from '../../services/journalEligibility';

type Props = {
  editing: boolean;
  busy: boolean;
  availableRecords: HikingActivity[];
  selectedRecord: HikingActivity | undefined;
  selectedRecordId: number | null;
  journalMountain: string;
  date: string;
  title: string;
  content: string;
  isPublic: boolean;
  onSelectedRecordChange: (id: number | null) => void;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onPublicChange: (value: boolean) => void;
  onSubmit: () => void;
};

export default function JournalEditorScreen({
  editing,
  busy,
  availableRecords,
  selectedRecord,
  selectedRecordId,
  journalMountain,
  date,
  title,
  content,
  isPublic,
  onSelectedRecordChange,
  onTitleChange,
  onContentChange,
  onPublicChange,
  onSubmit,
}: Props) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="scroll-content form-content" onSubmit={submit}>
      <h2>오늘의 산행을 기록해요</h2>
      <p className="muted">멋있었던 순간을 남겨보세요</p>
      {!editing && (
        <>
          <label>
            내 등산기록 선택
            <select
              value={selectedRecordId ?? ''}
              disabled={busy}
              onChange={(event) =>
                onSelectedRecordChange(event.target.value ? Number(event.target.value) : null)
              }
              required
            >
              <option value="">등산기록을 선택해주세요</option>
              {availableRecords.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.mountainName} · {record.hikingDate} ·{' '}
                  {(record.distanceMeters / 1000).toFixed(1)}km ·{' '}
                  {Math.floor(record.elapsedMs / 60000)}분
                </option>
              ))}
            </select>
          </label>
          {busy ? (
            <p role="status">등산기록을 불러오는 중…</p>
          ) : (
            availableRecords.length === 0 && (
              <p className="muted">
                작성 가능한 등산기록이 없습니다. {JOURNAL_ELIGIBILITY_MESSAGE}
              </p>
            )
          )}
        </>
      )}
      {!editing && selectedRecord && !canCreateHikingJournal(selectedRecord) && (
        <p role="alert" className="muted">
          {selectedRecord.journalId !== null
            ? '이미 등산일지를 작성한 기록입니다.'
            : JOURNAL_ELIGIBILITY_MESSAGE}
        </p>
      )}
      {(editing || selectedRecord) && (
        <dl className="journal-write-summary" aria-label="산행 정보">
          <div>
            <dt>산</dt>
            <dd>{editing ? journalMountain : selectedRecord?.mountainName}</dd>
          </div>
          <div>
            <dt>등산 날짜</dt>
            <dd>{editing ? date : selectedRecord?.hikingDate}</dd>
          </div>
        </dl>
      )}
      <label>
        제목
        <input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          maxLength={100}
          required
          placeholder="산행 제목을 입력하세요"
        />
      </label>
      <label>
        오늘의 여정
        <textarea
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          maxLength={10000}
          rows={4}
        />
      </label>
      <div className="switch-row">
        <b>다른 사용자에게 공개</b>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-label="다른 사용자에게 공개"
          className={`switch ${isPublic ? 'on' : ''}`}
          onClick={() => onPublicChange(!isPublic)}
        >
          <span />
        </button>
      </div>
      <button
        className="submit"
        disabled={busy || (!editing && !canCreateHikingJournal(selectedRecord))}
      >
        일지 저장하기
      </button>
    </form>
  );
}
