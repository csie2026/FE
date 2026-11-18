import type { Journal } from '../../api';
import JournalAuthor from '../common/JournalAuthor';

type Props = {
  busy: boolean;
  readError: boolean;
  journal: Journal | null;
  currentUserId: number | null;
  deletingJournalId: number | null;
  onSelectAuthor: (userId: number) => void;
  onEdit: (journal: Journal) => void;
  onDelete: (journal: Journal) => void;
};

export default function JournalDetailScreen({
  busy,
  readError,
  journal,
  currentUserId,
  deletingJournalId,
  onSelectAuthor,
  onEdit,
  onDelete,
}: Props) {
  return (
    <section className="scroll-content journal-detail">
      {busy ? (
        <p role="status">불러오는 중…</p>
      ) : readError ? (
        <p role="status">
          등산일지를 확인할 수 없습니다. 삭제되었거나 공개 상태가 변경되었을 수 있습니다.
        </p>
      ) : journal ? (
        <>
          <article className="journal-detail__body">
            <span className="badge">{journal.isPublic ? '공개' : '비공개'}</span>
            <h2>{journal.title}</h2>
            <dl className="journal-detail__meta">
              <div>
                <dt>산 이름</dt>
                <dd>{journal.mountainName}</dd>
              </div>
              <div>
                <dt>등산 날짜</dt>
                <dd>{journal.hikingDate}</dd>
              </div>
              <div className="journal-detail__author-row">
                <dt>작성자</dt>
                <dd>
                  <JournalAuthor
                    key={journal.userId}
                    userId={journal.userId}
                    nickname={journal.nickname}
                    onSelect={onSelectAuthor}
                  />
                </dd>
              </div>
            </dl>
            <p className="journal-detail__content">{journal.content}</p>
          </article>
          {journal.userId === currentUserId && (
            <div className="bottom-actions">
              <button
                type="button"
                className="primary"
                disabled={deletingJournalId !== null}
                onClick={() => onEdit(journal)}
              >
                수정
              </button>
              <button
                type="button"
                disabled={deletingJournalId !== null}
                onClick={() => onDelete(journal)}
              >
                {deletingJournalId === journal.id ? '삭제 중…' : '삭제'}
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="muted">등산일지를 확인할 수 없습니다.</p>
      )}
    </section>
  );
}
