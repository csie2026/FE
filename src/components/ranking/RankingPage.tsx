import { getErrorMessage } from '../../utils/errorMessages';
import ProfileAvatar from '../common/ProfileAvatar';
import { useEffect, useState } from 'react';
import {
  ApiError,
  getRankingSummary,
  scoreText,
  type RankingMember,
  type RankingSummary,
} from '../../api';
import './RankingPage.css';

type Props = {
  currentUserId: number | null;
  onSelectUser: (id: number) => void;
  onAuthError: (error: unknown) => void;
};

function RankAvatar({ member }: { member?: RankingMember }) {
  if (member)
    return (
      <ProfileAvatar
        userId={member.userId}
        nickname={member.nickname}
        src={member.profileImageUrl}
        className="leaderboard-avatar"
      />
    );
  return (
    <span className="leaderboard-avatar is-vacant">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22v-2a8 8 0 0 1 16 0v2" />
      </svg>
    </span>
  );
}

function points(member: RankingMember) {
  return scoreText(member.score);
}

// 서버가 정렬한 공개 회원 목록을 사용하고, 사용자 선택은 상위 화면의 타인 프로필 이동으로 연결한다.
export default function RankingPage({ currentUserId, onSelectUser, onAuthError }: Props) {
  const [summary, setSummary] = useState<RankingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // Abort superseded requests on navigation, refresh or account changes.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (currentUserId === null) return;
    getRankingSummary(controller.signal)
      .then((data) => {
        if (active) {
          if (data.mine !== null && data.mine.userId !== currentUserId)
            throw new Error('로그인한 회원의 순위를 확인할 수 없습니다.');
          setSummary(data);
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(getErrorMessage(cause, '랭킹을 불러오지 못했어요. 다시 시도해주세요.'));
        if (cause instanceof ApiError && cause.status === 401) onAuthError(cause);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, currentUserId, onAuthError]);

  function refresh() {
    setLoading(true);
    setError('');
    setSummary(null);
    setAttempt((value) => value + 1);
  }
  useEffect(() => {
    const foreground = () => {
      if (!document.hidden) {
        setLoading(true);
        setError('');
        setSummary(null);
        setAttempt((value) => value + 1);
      }
    };
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, []);

  const members = summary?.members ?? [];
  const mine = summary?.mine;
  const positions = [2, 1, 3];

  return (
    <section className="leaderboard-layout" aria-label="유저 랭킹">
      <div className="scroll-content leaderboard-scroll" aria-busy={loading}>
        {currentUserId === null ? (
          <div className="leaderboard-feedback">로그인 후 랭킹을 확인해주세요.</div>
        ) : loading ? (
          <div className="leaderboard-feedback" role="status">
            <span className="auth-loading__spinner" aria-hidden="true" />
            <p>봉우리 탐험가들의 순위를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="leaderboard-feedback">
            <p role="alert">{error}</p>
            <button type="button" onClick={refresh}>
              다시 불러오기
            </button>
          </div>
        ) : (
          <>
            <div className="leaderboard-toolbar">
              <span>같은 점수는 회원 등록 순서로 순위가 정해집니다.</span>
              <button type="button" onClick={refresh}>
                새로고침
              </button>
            </div>
            {members.length === 0 && (
              <p className="leaderboard-empty" role="status">
                아직 랭킹에 표시할 회원이 없습니다.
              </p>
            )}
            <section className="leaderboard-podium" aria-labelledby="podium-title">
              <div className="leaderboard-heading">
                <span id="podium-title">TOP 3</span>
              </div>
              <div className="leaderboard-podium__slots">
                {positions.map((rank) => {
                  const member = members.find((entry) => entry.rank === rank);
                  return (
                    <button
                      type="button"
                      key={rank}
                      className={`podium-slot podium-slot--${rank}${member ? '' : ' is-vacant'}`}
                      disabled={!member}
                      onClick={() => member && onSelectUser(member.userId)}
                      aria-label={
                        member
                          ? `${rank}위 ${member.nickname}, ${points(member)}, 프로필 보기`
                          : `${rank}위 빈 자리`
                      }
                    >
                      {rank === 1 && (
                        <span className="podium-crown" aria-hidden="true">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinejoin="round"
                          >
                            <path d="m3 7 4 4 5-7 5 7 4-4-3 12H6L3 7Z M6 22h12" />
                          </svg>
                        </span>
                      )}
                      <span className="podium-avatar-wrap">
                        <RankAvatar member={member} />
                        <span className="podium-medal" aria-hidden="true">
                          {rank}
                        </span>
                      </span>
                      <b className="podium-name" title={member?.nickname}>
                        {member?.nickname ?? '빈 자리'}
                      </b>
                      <span className="podium-score">{member ? points(member) : null}</span>
                      <span className="podium-step">
                        <strong>{rank}</strong>
                        <span>위</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="leaderboard-list" aria-labelledby="leaderboard-list-title">
              <div className="leaderboard-list__heading">
                <h2 id="leaderboard-list-title">상위 100명</h2>
                <span>{summary?.totalMembers.toLocaleString()}명의 탐험가</span>
              </div>
              {members.length > 3 ? (
                <ol start={4}>
                  {members
                    .filter((member) => member.rank > 3)
                    .map((member) => (
                      <li key={member.userId}>
                        <button
                          type="button"
                          className={`leaderboard-row${
                            member.userId === currentUserId ? ' is-mine' : ''
                          }`}
                          onClick={() => onSelectUser(member.userId)}
                        >
                          <span className="leaderboard-position">{member.rank}</span>
                          <RankAvatar member={member} />
                          <span className="leaderboard-name" title={member.nickname}>
                            {member.nickname}
                            {member.userId === currentUserId && <small>나</small>}
                          </span>
                          <strong className="leaderboard-score">{points(member)}</strong>
                        </button>
                      </li>
                    ))}
                </ol>
              ) : (
                <div className="leaderboard-empty">
                  등산 활동을 기록하고 다음 순위에 도전해보세요!
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <div className="my-ranking-bar" aria-label="내 순위" aria-live="polite">
        <span className="my-ranking-bar__label">내 순위</span>
        {currentUserId === null ? (
          <span>로그인이 필요합니다.</span>
        ) : loading ? (
          <span>순위 확인 중...</span>
        ) : error ? (
          <span>순위를 불러오지 못했어요</span>
        ) : mine ? (
          <button type="button" onClick={() => onSelectUser(mine.userId)}>
            <b>{mine.rank.toLocaleString()}위</b>
            <span title={mine.nickname}>{mine.nickname}</span>
            <strong>{points(mine)}</strong>
          </button>
        ) : (
          <span>프로필 설정 완료 후 순위에 참여할 수 있습니다.</span>
        )}
      </div>
    </section>
  );
}
