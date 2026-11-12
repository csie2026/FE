import { useEffect, useState } from 'react';
import ProfileAvatar from './ProfileAvatar';
import { getPublicProfileSummary } from '../../services/publicProfile';
import './JournalAuthor.css';

type Props = { userId: number; nickname: string | null; onSelect: (id: number) => void };

export default function JournalAuthor({ userId, nickname, onSelect }: Props) {
  const [image, setImage] = useState<{ userId: number; src: string | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    getPublicProfileSummary(userId, controller.signal)
      .then((profile) => {
        if (active) setImage({ userId, src: profile.profileImageUrl });
      })
      .catch(() => {
        if (active) setImage({ userId, src: null });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [userId]);
  // 늦게 도착한 다른 작성자의 사진은 표시하지 않고, 조회 실패 시 기본 아바타를 유지한다.
  const src = image?.userId === userId ? image.src : null;
  return (
    <span className="journal-author">
      <button
        type="button"
        className="journal-author__button"
        aria-label={`${nickname ?? '작성자'}님의 공개 프로필 보기`}
        title="작성자 공개 프로필 보기"
        onClick={() => onSelect(userId)}
      >
        <ProfileAvatar
          userId={userId}
          nickname={nickname}
          src={src}
          className="journal-author__avatar"
        />
      </button>
      <span className="journal-author__name">{nickname ?? '작성자'}</span>
    </span>
  );
}
