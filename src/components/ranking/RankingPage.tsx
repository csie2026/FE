import { useEffect, useState } from 'react';
import { ApiError, getRankings, type RankingMember } from '../../api';
import './RankingPage.css';

type Props = {
  currentUserId: number | null;
  onSelectUser: (id: number) => void;
  onAuthError: (error: unknown) => void;
};

function RankAvatar({ member }: { member?: RankingMember }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = member?.profileImageUrl;
  return (
    <span className={`leaderboard-avatar${member ? '' : ' is-vacant'}`}>
      {source && source !== failedSource ? (
        <img
          src={source}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedSource(source)}
        />
      ) : member ? (
        Array.from(member.nickname.trim()).slice(-2).join('') || '산'
      ) : (
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
      )}
    </span>
  );
}

function points(member: RankingMember) {
  return `${(Number.isFinite(member.score) ? member.score : 0).toLocaleString()}점`;
}

// 서버가 정렬한 공개 회원 목록을 사용하고, 사용자 선택은 상위 화면의 타인 프로필 이동으로 연결한다.
export default function RankingPage({ currentUserId, onSelectUser, onAuthError }: Props) {
  const [members, setMembers] = useState<RankingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // 화면 이탈 후 응답은 반영하지 않고, 세션 만료는 상위 화면의 공통 인증 처리에 전달한다.
  useEffect(() => {
    let active = true;
    getRankings()
      .then((data) => {
        if (active) setMembers(data);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : '랭킹을 불러오지 못했어요.');
        if (cause instanceof ApiError && cause.status === 401) onAuthError(cause);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, onAuthError]);

  const myIndex =
    currentUserId === null ? -1 : members.findIndex((member) => member.userId === currentUserId);
  const mine = myIndex >= 0 ? members[myIndex] : undefined;
  const positions = [2, 1, 3];

  return (
    <section className="leaderboard-layout" aria-label="유저 랭킹">
      <div className="scroll-content leaderboard-scroll" aria-busy={loading}>
        {loading ? (
          <div className="leaderboard-feedback" role="status">
            <span className="auth-loading__spinner" aria-hidden="true" />
            <p>봉우리 탐험가들의 순위를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="leaderboard-feedback">
            <p role="alert">{error}</p>
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
        ) : (
          <>
            <section className="leaderboard-podium" aria-labelledby="podium-title">
              <div className="leaderboard-heading">
                <span id="podium-title">TOP 3</span>
              </div>
              <div className="leaderboard-podium__slots">
                {positions.map((rank) => {
                  const member = members[rank - 1];
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
                <h2 id="leaderboard-list-title">전체 리더보드</h2>
                <span>{members.length}명의 탐험가</span>
              </div>
              {members.length > 3 ? (
                <ol start={4}>
                  {members.slice(3).map((member, index) => (
                    <li key={member.userId}>
                      <button
                        type="button"
                        className={`leaderboard-row${
                          member.userId === currentUserId ? ' is-mine' : ''
                        }`}
                        onClick={() => onSelectUser(member.userId)}
                      >
                        <span className="leaderboard-position">{index + 4}</span>
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
        {loading ? (
          <span>순위 확인 중...</span>
        ) : error ? (
          <span>순위를 불러오지 못했어요</span>
        ) : mine ? (
          <button type="button" onClick={() => onSelectUser(mine.userId)}>
            <b>{myIndex + 1}위</b>
            <span title={mine.nickname}>{mine.nickname}</span>
            <strong>{points(mine)}</strong>
          </button>
        ) : (
          <span>—위 · 0점</span>
        )}
      </div>
    </section>
  );
}
