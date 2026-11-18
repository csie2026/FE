import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Member, MemberImageKind } from '../api';
import {
  updateProfile,
  confirmProfileSave,
  isProfileAccountMismatch,
  ProfileSaveUnconfirmed,
  type ProfileUpdate,
} from '../services/profileUpdate';
import type { Screen } from '../services/appHistory';
import type { createScopedRequest } from '../services/scopedRequest';
import { subscribeForegroundRefresh } from '../services/foregroundRefresh';
import { koreanMonthBounds } from '../services/hikingStatistics';
import { buildCompletedMountainCollection } from '../services/completedHikes';
import { useCompletedHikes } from './useCompletedHikes';
import { useMonthlyGoals } from './useMonthlyGoals';
import type { useCourseSelection } from './useCourseSelection';
import type { createScreenTransition } from './useAppNavigation';

type Setter<T> = Dispatch<SetStateAction<T>>;

export function useProfileForm() {
  const [profileAccountChanged, setProfileAccountChanged] = useState(false);
  const [profileConfirmation, setProfileConfirmation] = useState<{
    input: ProfileUpdate;
    wasProfileCompleted: boolean;
    isCurrent: () => boolean;
    message: string;
  } | null>(null);
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [currentYear] = useState(() => new Date().getFullYear());
  const resetForm = useCallback(() => {
    setNickname('');
    setBirthYear('');
  }, []);
  const clearFormStatus = useCallback(() => {
    setProfileAccountChanged(false);
    setProfileConfirmation(null);
  }, []);
  return {
    profileAccountChanged,
    setProfileAccountChanged,
    profileConfirmation,
    setProfileConfirmation,
    nickname,
    setNickname,
    birthYear,
    setBirthYear,
    currentYear,
    resetForm,
    clearFormStatus,
  };
}

type ProfileActions = {
  form: ReturnType<typeof useProfileForm>;
  me: Member | null;
  screen: Screen;
  busy: boolean;
  setBusy: Setter<boolean>;
  setError: Setter<string>;
  setMe: Setter<Member | null>;
  fail: (error: unknown) => void;
  clearAccount: () => void;
  setScreen: ReturnType<typeof createScreenTransition>;
  getProfileSave: () => ReturnType<typeof createScopedRequest>;
  getAccountVersion: () => number;
  getCurrentMemberId: () => number | null;
  isLogoutPending: () => boolean;
};

export function createProfileActions({
  form,
  me,
  screen,
  busy,
  setBusy,
  setError,
  setMe,
  fail,
  clearAccount,
  setScreen,
  getProfileSave,
  getAccountVersion,
  getCurrentMemberId,
  isLogoutPending,
}: ProfileActions) {
  const {
    nickname,
    birthYear,
    currentYear,
    profileConfirmation,
    setProfileConfirmation,
    setProfileAccountChanged,
  } = form;
  const birthYearOptions = Array.from(
    { length: currentYear - 1950 + 1 },
    (_, index) => currentYear - index,
  );
  // 1950년 이전의 유효한 기존 출생연도는 보존하되 신규 회원의 선택지에는 추가하지 않는다.
  if (me?.birthYear != null && me.birthYear >= 1900 && me.birthYear < 1950) {
    birthYearOptions.push(me.birthYear);
  }

  const saveProfile = async () => {
    if (busy || !me || screen !== 'setup') return;
    if (profileConfirmation?.isCurrent()) return;
    setProfileConfirmation(null);
    const year = Number(birthYear);
    if (!nickname.trim() || nickname.trim().length > 30) {
      setError('닉네임은 1~30자로 입력해주세요.');
      return;
    }
    if (!/^\d{4}$/.test(birthYear) || year < 1900 || year > currentYear) {
      setError('출생연도를 선택해 주세요.');
      return;
    }
    const snapshot = {
      expectedUserId: me.userId,
      nickname: nickname.trim(),
      birthYear: year,
    };
    const version = getAccountVersion();
    const wasProfileCompleted = me.profileCompleted;
    const current = getProfileSave().capture();
    const isCurrent = () =>
      current() &&
      version === getAccountVersion() &&
      getCurrentMemberId() === snapshot.expectedUserId;
    await getProfileSave().run(
      async () => {
        setBusy(true);
        setError('');
        return updateProfile(snapshot, isCurrent);
      },
      {
        success: (user) => {
          if (!isCurrent()) return;
          setMe(user);
          setBusy(wasProfileCompleted);
          setScreen(wasProfileCompleted ? 'profile' : 'explore');
        },
        failure: (cause) => {
          if (!isCurrent()) return;
          if (isProfileAccountMismatch(cause)) {
            clearAccount();
            setBusy(false);
            setProfileAccountChanged(true);
            setError(cause.message);
            setScreen('login', null, null, null, true);
            return;
          }
          if (cause instanceof ProfileSaveUnconfirmed) {
            setProfileConfirmation({
              input: snapshot,
              wasProfileCompleted,
              isCurrent,
              message: cause.message,
            });
            return;
          }
          if (!isLogoutPending()) fail(cause);
        },
        settled: () => setBusy(false),
      },
    );
  };
  const confirmSavedProfile = async () => {
    const pending = profileConfirmation;
    if (busy || !pending?.isCurrent() || screen !== 'setup') return;
    await getProfileSave().run(
      async () => {
        setBusy(true);
        setError('');
        return confirmProfileSave(pending.input.expectedUserId, pending.isCurrent);
      },
      {
        success: (user) => {
          if (!pending.isCurrent()) return;
          setProfileConfirmation(null);
          setMe(user);
          if (
            user.profileCompleted &&
            user.nickname === pending.input.nickname &&
            user.birthYear === pending.input.birthYear
          ) {
            setScreen(pending.wasProfileCompleted ? 'profile' : 'explore');
          } else {
            setError(
              '현재 서버 값이 저장하려던 내용과 다릅니다. 입력 내용을 확인한 뒤 필요한 경우에만 다시 저장해주세요.',
            );
          }
        },
        failure: (cause) => {
          if (!pending.isCurrent()) return;
          if (isProfileAccountMismatch(cause)) {
            clearAccount();
            setBusy(false);
            setProfileAccountChanged(true);
            setError(cause.message);
            setScreen('login', null, null, null, true);
          } else if (!isLogoutPending()) fail(cause);
        },
        settled: () => setBusy(false),
      },
    );
  };
  return { birthYearOptions, saveProfile, confirmSavedProfile };
}

type ProfileData = {
  me: Member | null;
  screen: Screen;
  mountainCatalog: ReturnType<typeof useCourseSelection>['mountainCatalog'];
  setMe: Setter<Member | null>;
};

export function useProfileData({ me, screen, mountainCatalog, setMe }: ProfileData) {
  const [profileRefresh, setProfileRefresh] = useState(0);
  const memberImageVersion = useRef(0);
  const goalMonth = koreanMonthBounds().key;
  const completedHikes = useCompletedHikes(
    me?.profileCompleted ? me.userId : null,
    screen === 'profile' || screen === 'conquered',
    profileRefresh,
  );
  const conqueredCollection = useMemo(
    () => buildCompletedMountainCollection(mountainCatalog, completedHikes.completedMountains),
    [mountainCatalog, completedHikes.completedMountains],
  );
  const updateMemberImage = (updated: Member, kind: MemberImageKind) => {
    memberImageVersion.current += 1;
    const imageKey = kind === 'profile' ? 'profileImageUrl' : 'backgroundImageUrl';
    setMe((current) =>
      current?.userId === updated.userId ? { ...current, [imageKey]: updated[imageKey] } : current,
    );
  };
  const statistics =
    completedHikes.loading || completedHikes.error || completedHikes.statistics.month !== goalMonth
      ? null
      : completedHikes.statistics;
  return {
    goalMonth,
    profileRefresh,
    setProfileRefresh,
    memberImageVersion,
    updateMemberImage,
    completedHikes,
    conqueredCollection,
    statistics,
  };
}

type Goals = Pick<ProfileData, 'me' | 'screen'> & {
  goalMonth: string;
  profileRefresh: number;
  fail: (error: unknown) => void;
};

export function useProfileGoals({ me, screen, goalMonth, profileRefresh, fail }: Goals) {
  const monthlyGoalState = useMonthlyGoals(
    me?.profileCompleted ? me.userId : null,
    screen === 'profile',
    goalMonth,
    profileRefresh,
    fail,
  );
  return monthlyGoalState;
}

export function useProfileForegroundRefresh(
  screen: Screen,
  setError: Setter<string>,
  setProfileRefresh: Setter<number>,
) {
  useEffect(() => {
    if (screen !== 'profile' && screen !== 'publicProfile' && screen !== 'conquered') return;
    // 복귀 시 재검증은 유지하되, 이미 열린 화면을 로딩 화면으로 교체하지 않는다.
    return subscribeForegroundRefresh(window, document, () => {
      setError('');
      setProfileRefresh((value) => value + 1);
    });
  }, [screen, setError, setProfileRefresh]);
}
