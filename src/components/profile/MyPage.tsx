import { useEffect, useRef, useState } from 'react';
import type { Member, Journal } from '../../api';
import { useCustomAvatar } from '../../hooks/useCustomAvatar';
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
  onNavigate: (screen: 'myJournals' | 'favorites' | 'conquered' | 'diary') => void;
};

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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
  onNavigate,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    { label: '이번 달 산행', value: `${monthlyHikes}회` },
    {
      label: '이번 달 거리',
      value: `${monthlyDistanceKm} km`,
    },
    {
      label: '내 점수',
      value: `${(member.score ?? 0).toLocaleString()}점`,
    },
    { label: '완등', value: `${completedCount}회` },
    { label: '총 산행', value: `${journals.length}회` },
    { label: '총 거리', value: `${totalDistanceKm} km` },
  ];

  function saveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const goal = Number(goalDraft);
    if (!Number.isFinite(goal) || goal < 1 || goal > 1000) return;
    onSaveGoal(goal);
    setEditingGoal(false);
  }

  return (
    <div className="my-page">
      <section className="my-hero" aria-label="나의 산길">
        <div className="my-hero__top">
          <span className="my-hero__brand">
            <span className="my-hero__mark">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m2.5 20 7-13 4.3 8 3.1-5.2L22 20H2.5Z" />
                <path d="m7.8 12.5 2 1.4 1.8-1.5" />
              </svg>
            </span>{' '}
            To Peak
          </span>
          <div className="my-hero__actions">
            <span className="my-hero__eyebrow">
              MY PAGE <i />
            </span>
            <button type="button" onClick={onSettings} aria-label="설정">
              ⚙
            </button>
          </div>
        </div>
        <div className="my-hero__copy">
          <span>EVERY STEP IS A STORY</span>
          <h1>나의 산길</h1>
          <p>걸어온 길이 나만의 풍경이 되다.</p>
        </div>
        <small className="my-hero__tag">01 / MY TRAIL</small>
      </section>

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
            <span className="my-profile-card__label">TRAIL EXPLORER</span>
            <strong>{member.nickname}</strong>
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
          <span className="my-level">
            LV. {Math.max(1, Math.min(10, Math.floor(completedCount / 2) + 1))}
          </span>
        </div>
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
          {stats.map(({ label, value }) => (
            <div key={label}>
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
            <span>MONTHLY CHALLENGE</span>
            <h2>이번 달 목표</h2>
          </div>
          <button
            type="button"
            aria-label="이번 달 목표 수정"
            onClick={() => {
              setGoalDraft(String(monthlyGoalKm));
              setEditingGoal(true);
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
          className="monthly-challenge__bar"
          role="progressbar"
          aria-label="이번 달 목표 달성률"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${progress}%` }} />
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
            <span>MY HIKING</span>
            <h2>나의 산행</h2>
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

      {editingGoal && (
        <div className="my-modal-backdrop" onClick={() => setEditingGoal(false)}>
          <form
            className="my-goal-dialog"
            onSubmit={saveGoal}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>이번 달 목표</h2>
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
              <button type="button" onClick={() => setEditingGoal(false)}>
                취소
              </button>
              <button type="submit">저장</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
