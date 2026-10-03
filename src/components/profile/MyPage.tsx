import { useEffect, useRef, useState } from 'react';
import type { Member, Journal, ApiError, MemberImageKind } from '../../api';
import { useCustomAvatar } from '../../hooks/useCustomAvatar';
import { useCustomBanner } from '../../hooks/useCustomBanner';
import type { MonthlyGoals } from '../../hooks/useMonthlyGoals';
import './MyPage.css';

type Props = {
  member: Member;
  onMemberUpdated: (member: Member, kind: MemberImageKind) => void;
  onAuthError: (error: ApiError) => void;
  journals: Journal[];
  completedCount: number;
  totalDistanceKm: number;
  monthlyDistanceKm: number;
  monthlyGoals: MonthlyGoals;
  onSaveGoals: (goals: MonthlyGoals) => boolean;
  goalsError: string;
  onSettings: () => void;
  onEditProfile: () => void;
  onNavigate: (screen: 'myJournals' | 'favorites' | 'conquered' | 'hikingRecords') => void;
};

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function OutdoorIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    mountain: 'M2 20 9 6l5 9 3-6 5 11H2Z M7 10l2 2 2-2',
    camera: 'M8 6l1.5-3h5L16 6h4v14H4V6h4Z M15.5 12.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',
    route: 'M5 5h7a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h10 M5 3v4 M19 17v4',
    distance: 'M3 8h18v8H3Z M7 8v4 M11 8v3 M15 8v4 M19 8v3',
    star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
    flag: 'M6 21V3l12 1v9L6 12',
    settings:
      'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] ?? paths.mountain} />
    </svg>
  );
}

export default function MyPage({
  member,
  onMemberUpdated,
  onAuthError,
  journals,
  completedCount,
  totalDistanceKm,
  monthlyDistanceKm,
  monthlyGoals,
  onSaveGoals,
  goalsError,
  onSettings,
  onEditProfile,
  onNavigate,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const bannerDialogRef = useRef<HTMLDialogElement>(null);
  const goalDialogRef = useRef<HTMLDialogElement>(null);
  const {
    customBanner,
    isSaving: bannerSaving,
    error: bannerError,
    saveBanner,
    removeBanner,
  } = useCustomBanner({ member, onMemberUpdated, onAuthError });
  const [failedBanner, setFailedBanner] = useState<string | null>(null);
  const {
    customAvatar,
    isSaving,
    error: avatarError,
    saveAvatar,
    removeAvatar,
  } = useCustomAvatar({ member, onMemberUpdated, onAuthError });
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const avatarSource =
    customAvatar && !failedImages.includes(customAvatar)
      ? customAvatar
      : member.profileImageUrl && !failedImages.includes(member.profileImageUrl)
        ? member.profileImageUrl
        : null;
  const initials = Array.from(member.nickname.trim()).slice(-2).join('') || '나';
  const [editingGoal, setEditingGoal] = useState(false);
  const [distanceEnabled, setDistanceEnabled] = useState(monthlyGoals.distanceKm !== null);
  const [hikesEnabled, setHikesEnabled] = useState(monthlyGoals.hikeCount !== null);
  const [distanceDraft, setDistanceDraft] = useState(String(monthlyGoals.distanceKm ?? 80));
  const [hikesDraft, setHikesDraft] = useState(String(monthlyGoals.hikeCount ?? 4));
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  useEffect(() => {
    const timer = window.setInterval(() => setMonthKey(currentMonthKey()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const monthlyHikes = journals.filter((journal) => journal.hikingDate.startsWith(monthKey)).length;
  const stats: {
    label: string;
    value: number;
    unit: string;
    icon: string;
    goal?: number | null;
  }[] = [
    {
      label: '이번 달 산행',
      value: monthlyHikes,
      unit: '회',
      icon: 'route',
      goal: monthlyGoals.hikeCount,
    },
    {
      label: '이번 달 거리',
      value: monthlyDistanceKm,
      unit: 'km',
      goal: monthlyGoals.distanceKm,
      icon: 'distance',
    },
    {
      label: '내 점수',
      value: member.score ?? 0,
      unit: '점',
      icon: 'star',
    },
    { label: '완등 횟수', value: completedCount, unit: '회', icon: 'mountain' },
    { label: '총 산행', value: journals.length, unit: '회', icon: 'flag' },
    { label: '총 거리', value: totalDistanceKm, unit: 'km', icon: 'distance' },
  ];
  const goalItems = [
    {
      label: '이번 달 거리',
      current: monthlyDistanceKm,
      target: monthlyGoals.distanceKm,
      unit: 'km',
    },
    { label: '이번 달 산행', current: monthlyHikes, target: monthlyGoals.hikeCount, unit: '회' },
  ].filter((item) => item.target !== null);

  function openGoalSettings() {
    setDistanceEnabled(monthlyGoals.distanceKm !== null);
    setHikesEnabled(monthlyGoals.hikeCount !== null);
    setDistanceDraft(String(monthlyGoals.distanceKm ?? 80));
    setHikesDraft(String(monthlyGoals.hikeCount ?? 4));
    setEditingGoal(true);
    goalDialogRef.current?.showModal();
  }

  function saveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = onSaveGoals({
      distanceKm: distanceEnabled ? Number(distanceDraft) : null,
      hikeCount: hikesEnabled ? Number(hikesDraft) : null,
    });
    if (!saved) return;
    setEditingGoal(false);
    goalDialogRef.current?.close();
  }

  return (
    <div className="my-page">
      <header className="my-page-heading">
        <span aria-hidden="true" />
        <span>
          <OutdoorIcon name="mountain" /> ToPeak
        </span>
        <button type="button" onClick={onSettings} aria-label="메뉴 열기" aria-haspopup="dialog">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>
      <section className="my-cover" aria-label="내 프로필 배경">
        {customBanner && customBanner !== failedBanner && (
          <img
            src={customBanner}
            alt="사용자가 선택한 프로필 배경"
            onError={() => setFailedBanner(customBanner)}
          />
        )}
        <button
          className="my-cover-edit"
          type="button"
          disabled={bannerSaving}
          aria-label="배경 사진 변경"
          aria-busy={bannerSaving}
          onClick={() =>
            customBanner ? bannerDialogRef.current?.showModal() : bannerInputRef.current?.click()
          }
        >
          <OutdoorIcon name="camera" />
          <span>배경 변경</span>
        </button>
        {bannerSaving && (
          <span className="my-cover-status" role="status">
            배경을 저장하고 있어요...
          </span>
        )}
      </section>
      <input
        type="file"
        accept="image/*"
        hidden
        ref={bannerInputRef}
        aria-label="배경 사진 파일"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) {
            setFailedBanner(null);
            void saveBanner(file);
          }
        }}
      />
      <section className="my-profile-card" aria-label="산행 요약">
        <div className="my-profile-card__identity">
          <button
            type="button"
            className="my-profile-card__avatar-button"
            aria-label="프로필 사진 선택"
            aria-busy={isSaving}
            disabled={isSaving}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className={`my-profile-card__avatar${avatarSource ? '' : ' is-initials'}`}>
              {avatarSource ? (
                <img
                  src={avatarSource}
                  alt={`${member.nickname}님의 프로필 사진`}
                  referrerPolicy="no-referrer"
                  onError={() => setFailedImages((previous) => [...previous, avatarSource])}
                />
              ) : (
                initials
              )}
            </span>
            <span className="my-avatar-camera" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M8 6 9.5 3h5L16 6h4v14H4V6h4Z" />
                <circle cx="12" cy="12.5" r="3.5" />
              </svg>
            </span>
          </button>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            hidden
            aria-label="프로필 사진 파일"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) {
                setFailedImages([]);
                void saveAvatar(file);
              }
            }}
          />
          <div>
            <strong>{member.nickname}</strong>
            <span className="my-explorer-badge">
              <OutdoorIcon name="mountain" /> 봉우리 탐험가
            </span>
            {customAvatar && (
              <button
                type="button"
                className="my-avatar-reset"
                disabled={isSaving}
                onClick={() => void removeAvatar()}
              >
                기본 프로필로 변경
              </button>
            )}
          </div>
          <div className="my-profile-actions">
            <button type="button" className="my-profile-edit" onClick={onEditProfile}>
              프로필 편집
            </button>
          </div>
        </div>
        {bannerError && (
          <p className="my-avatar-message is-error" role="alert">
            {bannerError}
          </p>
        )}
        {isSaving && (
          <p className="my-avatar-message" role="status">
            사진을 저장하고 있어요...
          </p>
        )}
        {avatarError && (
          <p className="my-avatar-message is-error" role="alert">
            {avatarError}
          </p>
        )}
        <div className="my-profile-card__stats" aria-label="산행 통계">
          {stats.map(({ label, value, unit, icon, goal }) => (
            <div key={label}>
              <OutdoorIcon name={icon} />
              <strong>
                {value.toLocaleString()}
                <small> {unit}</small>
                {goal != null && (
                  <small>
                    {' '}
                    / {goal.toLocaleString()} {unit}
                  </small>
                )}
              </strong>
              <span>{label}</span>
              {goal != null && (
                <div className="stat-goal">
                  <div
                    className="stat-goal__bar"
                    role="progressbar"
                    aria-label={`${label} 목표 달성률`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round((value / goal) * 100))}
                  >
                    <span style={{ width: `${Math.min(100, (value / goal) * 100)}%` }} />
                  </div>
                  <small>{Math.min(100, Math.round((value / goal) * 100))}% 달성</small>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="my-stats-note">산행 횟수는 등산일지 기준 · 완등은 직접 등록한 산 기준</p>
      </section>

      <section className="monthly-challenge">
        <div className="monthly-challenge__heading">
          <div>
            <span>ToPeak Challenge</span>
            <h2>이번 달 정복 목표</h2>
          </div>
          <button type="button" aria-label="이번 달 목표 수정" onClick={openGoalSettings}>
            ✎
          </button>
        </div>
        {goalItems.length === 0 && (
          <p className="monthly-challenge__empty">
            거리 또는 산행 횟수를 선택해 나만의 목표를 설정해보세요.
          </p>
        )}
        {goalItems.map((item) => {
          const progress = Math.min(100, Math.round((item.current / (item.target ?? 1)) * 100));
          return (
            <div className="monthly-challenge__goal" key={item.label}>
              <div className="monthly-challenge__content">
                <strong>{item.label}</strong>
                <b className="monthly-challenge__amount">
                  {item.current.toLocaleString()}{' '}
                  <small>
                    / {item.target?.toLocaleString()} {item.unit}
                  </small>
                </b>
              </div>
              <div
                className="monthly-challenge__track"
                role="progressbar"
                aria-label={`${item.label} 목표 달성률`}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  className="monthly-challenge__indicator"
                  style={{ left: `clamp(10px, ${progress}%, calc(100% - 10px))` }}
                >
                  <OutdoorIcon name="flag" />
                </span>
                <div className="monthly-challenge__bar">
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="monthly-challenge__footer">
                <span>{progress === 100 ? '목표를 달성했어요!' : '나의 발걸음'}</span>
                <b>{progress}% 달성</b>
              </div>
            </div>
          );
        })}
        {monthlyGoals.distanceKm !== null && monthlyDistanceKm === 0 && (
          <small className="monthly-challenge__note">
            산행 거리 데이터가 있는 기록이 아직 없습니다.
          </small>
        )}
      </section>

      <section className="my-hiking-menu">
        <div className="my-section-heading">
          <div>
            <span>내 기록과 보관함</span>
            <h2>다음 봉우리를 준비해요</h2>
          </div>
          <i />
        </div>
        <div className="my-hiking-menu__items">
          <button onClick={() => onNavigate('myJournals')}>
            <span>📖</span>
            <b>내 등산일지</b>
            <i>›</i>
          </button>
          <button onClick={() => onNavigate('conquered')}>
            <span>🚩</span>
            <b>완등한 산</b>
            <i>›</i>
          </button>
          <button onClick={() => onNavigate('favorites')}>
            <span>♡</span>
            <b>내가 찜한 산</b>
            <i>›</i>
          </button>
          <button onClick={() => onNavigate('hikingRecords')}>
            <span>↗</span>
            <b>등산기록</b>
            <i>›</i>
          </button>
        </div>
      </section>

      <dialog
        ref={goalDialogRef}
        className="my-goal-dialog"
        onClose={() => setEditingGoal(false)}
        aria-labelledby="my-goal-title"
      >
        {editingGoal && (
          <form onSubmit={saveGoal} onClick={(event) => event.stopPropagation()}>
            <h2 id="my-goal-title">이번 달 정복 목표</h2>
            <p>원하는 목표를 선택해 설정하세요.</p>
            <fieldset className="my-goal-option">
              <label>
                <input
                  type="checkbox"
                  checked={distanceEnabled}
                  onChange={(event) => setDistanceEnabled(event.target.checked)}
                  autoFocus
                />
                이번 달 목표 거리
              </label>
              <label>
                거리 (km)
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="0.1"
                  disabled={!distanceEnabled}
                  required={distanceEnabled}
                  value={distanceDraft}
                  onChange={(event) => setDistanceDraft(event.target.value)}
                />
              </label>
            </fieldset>
            <fieldset className="my-goal-option">
              <label>
                <input
                  type="checkbox"
                  checked={hikesEnabled}
                  onChange={(event) => setHikesEnabled(event.target.checked)}
                />
                이번 달 목표 산행 횟수
              </label>
              <label>
                산행 횟수 (회)
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  disabled={!hikesEnabled}
                  required={hikesEnabled}
                  value={hikesDraft}
                  onChange={(event) => setHikesDraft(event.target.value)}
                />
              </label>
            </fieldset>
            {!distanceEnabled && !hikesEnabled && <p>저장하면 설정한 목표가 해제됩니다.</p>}
            {goalsError && (
              <p className="my-avatar-message is-error" role="alert">
                {goalsError}
              </p>
            )}
            <div>
              <button type="button" onClick={() => goalDialogRef.current?.close()}>
                취소
              </button>
              <button type="submit">저장</button>
            </div>
          </form>
        )}
      </dialog>
      <dialog
        ref={bannerDialogRef}
        className="my-goal-dialog my-banner-dialog"
        aria-labelledby="my-banner-title"
      >
        <h2 id="my-banner-title">프로필 배경</h2>
        <p>나를 닮은 풍경으로 꾸며보세요.</p>
        <button
          type="button"
          disabled={bannerSaving}
          onClick={() => {
            bannerInputRef.current?.click();
            bannerDialogRef.current?.close();
          }}
        >
          새 사진으로 변경
        </button>
        <button
          type="button"
          disabled={bannerSaving}
          onClick={() => {
            void removeBanner();
            bannerDialogRef.current?.close();
          }}
        >
          기본 배경으로 복원
        </button>
        <button type="button" onClick={() => bannerDialogRef.current?.close()}>
          취소
        </button>
      </dialog>
    </div>
  );
}
