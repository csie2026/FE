import type { Journal } from '../../api';

type Props = {
  busy: boolean;
  readError: boolean;
  journals: Journal[];
  emptyMessage: string;
  onOpen: (id: number) => void;
};

export default function JournalList({ busy, readError, journals, emptyMessage, onOpen }: Props) {
  if (busy) return <p role="status">불러오는 중…</p>;
  if (readError)
    return <p role="status">등산일지를 불러오지 못했습니다. 화면을 다시 열어 조회해주세요.</p>;
  if (!journals.length) return <p className="muted">{emptyMessage}</p>;

  return journals.map((journal) => (
    <article
      className="diary-card diary-card--clickable"
      key={journal.id}
      role="button"
      tabIndex={0}
      aria-label={`${journal.title} 등산일지 상세 보기`}
      onClick={() => onOpen(journal.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(journal.id);
        }
      }}
    >
      <div className="diary-card__body">
        <b>{journal.title}</b>
        <small>
          {journal.mountainName} · {journal.hikingDate} · {journal.nickname}
        </small>
        <p className="journal-content">{journal.content}</p>
      </div>
      <span className="badge">{journal.isPublic ? '공개' : '비공개'}</span>
    </article>
  ));
}

type ScreenProps = Omit<Props, 'emptyMessage'> & {
  heading: string;
  onWrite: () => void;
};

export function JournalListScreen({ heading, onWrite, ...list }: ScreenProps) {
  return (
    <div className="scroll-content">
      <div className="section-heading">
        <b>{heading}</b>
        <button onClick={onWrite}>등산일지 작성 ＋</button>
      </div>
      <JournalList {...list} emptyMessage="아직 등산일지가 없습니다." />
    </div>
  );
}
