import type { ComponentProps } from 'react';
import type { useProfileData, useProfileGoals } from '../../hooks/useProfileData';
import MyPage from '../profile/MyPage';

type Props = Pick<
  ComponentProps<typeof MyPage>,
  'member' | 'journalCount' | 'onAuthError' | 'onSettings' | 'onEditProfile' | 'onNavigate'
> & {
  profile: Pick<
    ReturnType<typeof useProfileData>,
    'completedHikes' | 'updateMemberImage' | 'statistics' | 'goalMonth'
  >;
  monthlyGoals: ReturnType<typeof useProfileGoals>;
};

export default function ProfileScreen({
  profile: { completedHikes, goalMonth, updateMemberImage, statistics },
  monthlyGoals,
  ...page
}: Props) {
  const { loading, error, retry } = completedHikes;
  return (
    <div className="scroll-content my-page-scroll">
      {loading && (
        <p role="status" className="completion-message">
          완등 기록을 불러오는 중…
        </p>
      )}
      {error && (
        <div role="alert" className="completion-message">
          <p>{error}</p>
          <button type="button" onClick={retry}>
            다시 시도
          </button>
        </div>
      )}
      <MyPage
        key={`${page.member.userId}:${goalMonth}`}
        {...page}
        onMemberUpdated={updateMemberImage}
        statistics={statistics}
        monthlyGoals={monthlyGoals.goals}
        onSaveGoals={monthlyGoals.saveGoals}
        goalsError={monthlyGoals.error}
        goalsReady={monthlyGoals.ready}
        goalsLoading={monthlyGoals.loading}
        goalsSaving={monthlyGoals.saving}
        goalsMonth={goalMonth}
        onRetryGoals={monthlyGoals.retry}
      />
    </div>
  );
}
