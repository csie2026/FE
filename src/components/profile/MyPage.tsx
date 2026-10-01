import { useEffect, useRef, useState } from 'react';
import type { Member, Journal } from '../../api';
import { useCustomAvatar } from '../../hooks/useCustomAvatar';
import { useCustomBanner } from '../../hooks/useCustomBanner';
import './MyPage.css';

type Props = {
  member: Member;
  journals: Journal[];
  completedCount: number;
  totalDistanceKm: number;
  monthlyDistanceKm: number;
  monthlyGoalKm: number;
  onSaveGoal: (goal: number) => void;
  onSettings: () => void;
  onEditProfile: () => void;
  onNavigate: (screen: 'myJournals' | 'favorites' | 'conquered' | 'diary') => void;
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
  journals,
  completedCount,
  totalDistanceKm,
  monthlyDistanceKm,
  monthlyGoalKm,
  onSaveGoal,
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
  } = useCustomBanner();
  const [failedBanner, setFailedBanner] = useState<string | null>(null);
  const {
    customAvatar,
    isSaving,
    error: avatarError,
    saveAvatar,
    removeAvatar,
  } = useCustomAvatar();
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const avatarSource =
    customAvatar && !failedImages.includes(customAvatar)
      ? customAvatar
      : member.profileImageUrl && !failedImages.includes(member.profileImageUrl)
        ? member.profileImageUrl
        : null;
  const initials = Array.from(member.nickname.trim()).slice(-2).join('') || '나';
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(monthlyGoalKm));
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  useEffect(() => {
    const timer = window.setInterval(() => setMonthKey(currentMonthKey()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const monthlyHikes = journals.filter((journal) => journal.hikingDate.startsWith(monthKey)).length;
  const progress =
    monthlyGoalKm > 0 ? Math.min(100, Math.round((monthlyDistanceKm / monthlyGoalKm) * 100)) : 0;
  const remaining = Math.max(0, monthlyGoalKm - monthlyDistanceKm);
  const stats = [
    { label: '이번 달 산행', value: `${monthlyHikes}회`, icon: 'route' },
    {
      label: '이번 달 거리',
      value: `${monthlyDistanceKm} km`,
      icon: 'distance',
    },
    {
      label: '내 점수',
      value: `${(member.score ?? 0).toLocaleString()}점`,
      icon: 'star',
    },
    { label: '완등 봉우리', value: `${completedCount}회`, icon: 'mountain' },
    { label: '총 산행', value: `${journals.length}회`, icon: 'flag' },
    { label: '총 거리', value: `${totalDistanceKm} km`, icon: 'distance' },
  ];

  function saveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const goal = Number(goalDraft);
    if (!Number.isFinite(goal) || goal < 1 || goal > 1000) return;
    onSaveGoal(goal);
    setEditingGoal(false);
    goalDialogRef.current?.close();
  }

  return (
    <div className="my-page">
      <header className="my-page-heading">
        <span>
          <OutdoorIcon name="mountain" /> To Peak
        </span>
        <button type="button" onClick={onSettings} aria-label="설정">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <circle cx="4" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="20" cy="12" r="1.7" />
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
                onClick={removeAvatar}
              >
                기본 프로필로 변경
              </button>
            )}
          </div>
          <button type="button" className="my-profile-edit" onClick={onEditProfile}>
            프로필 편집
          </button>
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
          {stats.map(({ label, value, icon }) => (
            <div key={label}>
              <OutdoorIcon name={icon} />
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <p className="my-stats-note">산행 횟수는 등산일지 기준 · 완등은 직접 등록한 산 기준</p>
      </section>

      <section className="monthly-challenge">
        <div className="monthly-challenge__heading">
          <div>
            <span>To Peak Challenge</span>
            <h2>이번 달 정복 목표</h2>
          </div>
          <button
            type="button"
            aria-label="이번 달 목표 수정"
            onClick={() => {
              setGoalDraft(String(monthlyGoalKm));
              setEditingGoal(true);
              goalDialogRef.current?.showModal();
            }}
          >
            ✎
          </button>
        </div>
        <div className="monthly-challenge__content">
          <div>
            <strong>
              {progress >= 100
                ? '이번 달 목표를 달성했어요!'
                : monthlyDistanceKm > 0
                  ? '조금씩, 더 멀리.'
                  : '나만의 목표를 향해 걸어봐요.'}
            </strong>
            <p>
              {remaining > 0 ? `목표까지 ${remaining}km 남았어요!` : '멋진 산행을 이어가고 있어요.'}
            </p>
          </div>
          <b className="monthly-challenge__amount">
            {monthlyDistanceKm} <small>km / {monthlyGoalKm} km</small>
          </b>
        </div>
        <div
          className="monthly-challenge__track"
          role="progressbar"
          aria-label="이번 달 목표 달성률"
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
          <span>나의 발걸음</span>
          <b>{progress}% 달성</b>
        </div>
        {monthlyDistanceKm === 0 && (
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
          <button onClick={() => onNavigate('diary')}>
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
            <p>이번 달에 걷고 싶은 거리를 정해보세요.</p>
            <label>
              목표 거리 (km)
              <input
                type="number"
                min="1"
                max="1000"
                value={goalDraft}
                onChange={(event) => setGoalDraft(event.target.value)}
                required
                autoFocus
              />
            </label>
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
          onClick={() => {
            bannerInputRef.current?.click();
            bannerDialogRef.current?.close();
          }}
        >
          새 사진으로 변경
        </button>
        <button
          type="button"
          onClick={() => {
            removeBanner();
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
