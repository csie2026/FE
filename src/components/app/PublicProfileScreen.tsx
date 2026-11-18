import type { ReactNode } from 'react';
import { scoreText, type PublicProfileDetails } from '../../api';
import ProfileAvatar from '../common/ProfileAvatar';

type Props = {
  busy: boolean;
  readError: boolean;
  profile: PublicProfileDetails | null;
  journals: ReactNode;
  onRetry: () => void;
};

export default function PublicProfileScreen({
  busy,
  readError,
  profile,
  journals,
  onRetry,
}: Props) {
  return (
    <div className="scroll-content profile-content">
      {busy ? (
        <p role="status">불러오는 중…</p>
      ) : readError ? (
        <div className="public-profile__error">
          <p role="status">공개 프로필을 불러오지 못했습니다. 다시 시도해 주세요.</p>
          <button type="button" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      ) : profile ? (
        <>
          <article className="profile-card">
            <ProfileAvatar
              userId={profile.userId}
              nickname={profile.nickname}
              src={profile.profileImageUrl}
              className="avatar"
            />
            <div>
              <h2 className="public-profile__name">{profile.nickname ?? '탐험가'}</h2>
            </div>
          </article>
          <dl className="public-profile__stats" aria-label="산행 통계">
            <div>
              <dt>점수</dt>
              <dd>{scoreText(profile.score)}</dd>
            </div>
            <div>
              <dt>등반 횟수</dt>
              <dd>{profile.totalHikeCount}회</dd>
            </div>
            <div>
              <dt>완등 횟수</dt>
              <dd>{profile.completedHikeCount}회</dd>
            </div>
          </dl>
          <p className="public-profile__note">
            등반·완등 횟수는 저장된 GPS 산행 활동을 기준으로 합니다.
          </p>
          <h3>공개 등산일지</h3>
          {journals}
        </>
      ) : (
        <p role="status">공개 프로필을 확인할 수 없습니다.</p>
      )}
    </div>
  );
}
