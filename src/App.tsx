import { getPublicProfileView } from './services/publicProfile';
import {
  updateProfile,
  confirmProfileSave,
  ProfileSaveUnconfirmed,
  isProfileAccountMismatch,
  type ProfileUpdate,
} from './services/profileUpdate';
import { createScopedRequest } from './services/scopedRequest';
import { subscribeForegroundRefresh } from './services/foregroundRefresh';
import { recordLifecycle } from './services/lifecycleDiagnostics';
import { canCreateHikingJournal, JOURNAL_ELIGIBILITY_MESSAGE } from './services/journalEligibility';
import { getErrorMessage } from './utils/errorMessages';
import { readOAuthFailure } from './services/oauthFailure';
import { createLogout } from './services/logout';
import { confirmLogin, forgetLogin, shouldNotifySessionExpiry } from './services/loginHistory';
import { koreanMonthBounds } from './services/hikingStatistics';
import { buildCompletedMountainCollection } from './services/completedHikes';
import { useCompletedHikes } from './hooks/useCompletedHikes';
import {
  readHikingSelection,
  type HikingSelection,
} from './components/hiking/services/hikingNavigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import HikingRecoveryNotice from './components/hiking/HikingRecoveryNotice';
import MyPage from './components/profile/MyPage';
import RankingPage from './components/ranking/RankingPage';
import { groupExploreMountains } from './services/exploreMountains';
import { useExploreMountains } from './hooks/useExploreMountains';
import { usePersistentIds } from './hooks/usePersistentIds';
import { useMonthlyGoals } from './hooks/useMonthlyGoals';
import { clearLegacyMemberImages } from './utils/memberImages';
import SideDrawer from './components/common/SideDrawer';
import SettingsPage from './components/settings/SettingsPage';
import AboutScreen from './components/app/AboutScreen';
import AppHeader from './components/app/AppHeader';
import JournalList from './components/app/JournalList';
import LoginScreen from './components/app/LoginScreen';
import HikingRecordsScreen from './components/app/HikingRecordsScreen';
import JournalDetailScreen from './components/app/JournalDetailScreen';
import JournalEditorScreen from './components/app/JournalEditorScreen';
import ProfileSetupScreen from './components/app/ProfileSetupScreen';
import PublicProfileScreen from './components/app/PublicProfileScreen';
import AppNotices from './components/app/AppNotices';
import HikingTrackingScreen from './components/app/HikingTrackingScreen';
import MountainDetailScreen from './components/app/MountainDetailScreen';
import ExploreScreen from './components/app/ExploreScreen';
import MountainCollectionScreen from './components/app/MountainCollectionScreen';
import { withdrawAccount } from './services/withdrawal';
import {
  clearWithdrawnAccountData,
  completeAccountWithdrawal,
  startWithdrawalSync,
} from './services/accountData';
import { subscribeAccountRetirement } from './services/accountLifecycle';
import {
  api,
  subscribeSessionExpiry,
  ApiError,
  deleteJournal,
  getJournal,
  getHikingRecords,
  createJournal,
  updateJournal,
  type HikingActivity,
  type Member,
  type Journal,
  type PublicProfileDetails,
} from './api';

type Screen =
  | 'login'
  | 'explore'
  | 'detail'
  | 'hikingTracking'
  | 'diary'
  | 'journalDetail'
  | 'write'
  | 'profile'
  | 'accountSettings'
  | 'hikingRecords'
  | 'ranking'
  | 'setup'
  | 'myJournals'
  | 'publicProfile'
  | 'favorites'
  | 'conquered'
  | 'about';

// 화면 상태와 회원 상태를 한곳에서 조율하며, history/hash를 통해 뒤로 가기와 상세 링크를 복원한다.
function App() {
  const [screen, setCurrentScreen] = useState<Screen>('login');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    recordLifecycle('screen-change', { screen });
  }, [screen]);
  useEffect(() => {
    recordLifecycle('app-mount');
    return () => recordLifecycle('app-unmount');
  }, []);
  useEffect(() => {
    recordLifecycle('global-loading', { loading });
  }, [loading]);
  const [busy, setBusy] = useState(false);
  const [profileAccountChanged, setProfileAccountChanged] = useState(false);
  const [profileConfirmation, setProfileConfirmation] = useState<{
    input: ProfileUpdate;
    wasProfileCompleted: boolean;
    isCurrent: () => boolean;
    message: string;
  } | null>(null);
  const [oauthFailure] = useState(() => readOAuthFailure(window.location.href));
  const [error, setError] = useState(oauthFailure?.message ?? '');
  const [logoutError, setLogoutError] = useState(false);
  const [withdrawalPending, setWithdrawalPending] = useState(false);
  const withdrawalLock = useRef(false);
  const [withdrawalNotice, setWithdrawalNotice] = useState<{
    userId: number;
    failed: boolean;
  } | null>(null);
  const [me, setMe] = useState<Member | null>(null);
  const currentMemberId = useRef<number | null>(null);
  useLayoutEffect(() => {
    currentMemberId.current = me?.userId ?? null;
  }, [me?.userId]);
  const [profileRefresh, setProfileRefresh] = useState(0);
  const accountVersion = useRef(0);
  const logoutPending = useRef(false);
  const profileSave = useRef(createScopedRequest());
  const journalSave = useRef(createScopedRequest());
  const logoutAction = useRef<ReturnType<typeof createLogout> | null>(null);
  const memberImageVersion = useRef(0);
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [currentYear] = useState(() => new Date().getFullYear());
  const birthYearOptions = Array.from(
    { length: currentYear - 1950 + 1 },
    (_, index) => currentYear - index,
  );
  // 1950년 이전의 유효한 기존 출생연도는 보존하되 신규 회원의 선택지에는 추가하지 않는다.
  if (me?.birthYear != null && me.birthYear >= 1900 && me.birthYear < 1950) {
    birthYearOptions.push(me.birthYear);
  }

  const [journals, setJournals] = useState<Journal[]>([]);
  const [journalReadError, setJournalReadError] = useState(false);
  const [journalId, setJournalId] = useState<number | null>(null);
  const [journalDetail, setJournalDetail] = useState<Journal | null>(null);
  const [deletingJournalId, setDeletingJournalId] = useState<number | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfileDetails | null>(null);
  const [publicId, setPublicId] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  useLayoutEffect(() => {
    const profile = profileSave.current,
      journal = journalSave.current;
    return () => {
      profile.invalidate();
      journal.invalidate();
    };
  }, [screen, me?.userId, editing]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [date, setDate] = useState('');
  const [hikingRecords, setHikingRecords] = useState<HikingActivity[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const selectedRecord = hikingRecords.find((record) => record.id === selectedRecordId);
  const availableRecords = hikingRecords.filter(canCreateHikingJournal);
  const [journalMountain, setJournalMountain] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [hikingSelection, setHikingSelection] = useState<HikingSelection | null>(null);
  const [exploreRegion, setExploreRegion] = useState(0);
  const [exploreCity, setExploreCity] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const goalMonth = koreanMonthBounds().key;
  const explore = useExploreMountains(me?.profileCompleted ? me.userId : null);
  const mountainCatalog = explore.items;
  const knownMountainIds = useMemo(
    () => new Set(mountainCatalog.map((item) => item.id)),
    [mountainCatalog],
  );
  const {
    ids: favoriteIds,
    toggle: toggleFavorite,
    error: favoriteError,
  } = usePersistentIds(me?.profileCompleted ? me.userId : null, knownMountainIds);
  const exploreRegions = useMemo(() => groupExploreMountains(mountainCatalog), [mountainCatalog]);
  const mountain = mountainCatalog.find((item) => item.id === selected);
  const favoriteMountains = mountainCatalog.filter((item) => favoriteIds.includes(item.id));
  const completedHikes = useCompletedHikes(
    me?.profileCompleted ? me.userId : null,
    screen === 'profile' || screen === 'conquered',
    profileRefresh,
  );
  const conqueredCollection = useMemo(
    () => buildCompletedMountainCollection(mountainCatalog, completedHikes.completedMountains),
    [mountainCatalog, completedHikes.completedMountains],
  );
  // 상세 링크에는 대상 ID를, history에는 화면과 선택 산을 저장한다.
  // 초기화·로그인·삭제 후 이동은 replace로 처리해 불필요하거나 유효하지 않은 이력을 남기지 않는다.
  const setScreen = (
    next: Screen,
    nextPublicId = publicId,
    nextMountain = selected,
    nextJournalId = journalId,
    replaceCurrent = false,
    nextHike: HikingSelection | null = null,
  ) => {
    profileSave.current.invalidate();
    journalSave.current.invalidate();
    const previous = window.history.state;
    const index = typeof previous?.toPeakIndex === 'number' ? previous.toPeakIndex : 0;
    const replace = loading || next === 'login' || replaceCurrent;
    const state = {
      toPeakScreen: next,
      toPeakIndex: next === 'login' ? 0 : replace ? index : index + 1,
      toPeakMountainId: nextMountain,
      toPeakPublicId: nextPublicId,
      toPeakJournalId: nextJournalId,
      toPeakHikingSelection: next === 'hikingTracking' ? nextHike : null,
      toPeakHikingUserId: next === 'hikingTracking' && nextHike ? me?.userId : null,
    };
    const url = `${window.location.pathname}${window.location.search}${
      next === 'publicProfile' && nextPublicId
        ? `#users/${nextPublicId}`
        : next === 'journalDetail' && nextJournalId
          ? `#journals/${nextJournalId}`
          : ''
    }`;
    if (replace) window.history.replaceState(state, '', url);
    else if (
      previous?.toPeakScreen !== next ||
      (next === 'publicProfile' && previous?.toPeakPublicId !== nextPublicId) ||
      (next === 'journalDetail' && previous?.toPeakJournalId !== nextJournalId) ||
      (next === 'hikingTracking' &&
        (previous?.toPeakHikingSelection?.mountainId !== nextHike?.mountainId ||
          previous?.toPeakHikingSelection?.courseId !== nextHike?.courseId))
    )
      window.history.pushState(state, '', url);
    setHikingSelection(next === 'hikingTracking' ? nextHike : null);
    setCurrentScreen(next);
  };
  const openHikingCourse = (selection: HikingSelection) => {
    if (!me?.profileCompleted) return;
    setSelected(String(selection.mountainId));
    setScreen(
      'hikingTracking',
      publicId,
      String(selection.mountainId),
      journalId,
      false,
      selection,
    );
  };
  const clearHikingSelection = () => {
    setHikingSelection(null);
    window.history.replaceState(
      { ...window.history.state, toPeakHikingSelection: null, toPeakHikingUserId: null },
      '',
      window.location.href,
    );
  };
  // 일반 메뉴 이동은 세션과 프로필 완료 여부를 먼저 확인하고, 이전 화면의 조회 결과를 비운다.
  const go = (next: Screen, nextMountain = selected) => {
    if (withdrawalLock.current) return;
    setDrawerOpen(false);
    setError('');
    if (!me) {
      setScreen('login');
      return;
    }
    if (!me.profileCompleted) {
      setScreen('setup');
      return;
    }
    if (next === 'write') {
      setEditing(null);
      setTitle('');
      setContent('');
      setJournalMountain('');
      setDate('');
      setSelectedRecordId(null);
      setHikingRecords([]);
      setIsPublic(false);
    }
    if (next === screen) return;
    setBusy(
      [
        'diary',
        'myJournals',
        'ranking',
        'publicProfile',
        'profile',
        'write',
        'hikingRecords',
      ].includes(next),
    );
    setJournals([]);
    setPublicProfile(null);
    setScreen(next, publicId, nextMountain);
  };
  const goBack = () => {
    if (withdrawalLock.current) return;
    if (window.history.state?.toPeakIndex > 0) window.history.back();
    else
      go(
        screen === 'journalDetail'
          ? journalDetail?.userId === me?.userId
            ? 'myJournals'
            : 'diary'
          : 'explore',
      );
  };
  // 계정 세대를 증가시켜 로그아웃 이전의 비동기 응답이 새 회원 상태에 반영되지 않게 한다.
  const clearAccount = useCallback(() => {
    setProfileAccountChanged(false);
    setProfileConfirmation(null);
    profileSave.current.invalidate();
    journalSave.current.invalidate();
    accountVersion.current += 1;
    forgetLogin();
    clearLegacyMemberImages();
    setMe(null);
    setLogoutError(false);
    setHikingSelection(null);
    setNickname('');
    setBirthYear('');
    setJournals([]);
    setPublicProfile(null);
    setPublicId(null);
    setDeletingJournalId(null);
    setJournalId(null);
    setJournalDetail(null);
    setHikingRecords([]);
    setSelectedRecordId(null);
    setEditing(null);
    setTitle('');
    setContent('');
    setJournalMountain('');
    setDate('');
    setIsPublic(false);
  }, []);
  const fail = useCallback(
    (e: unknown) => {
      if (logoutPending.current && e instanceof ApiError && e.status === 401) return;
      setError(getErrorMessage(e));
      if (e instanceof ApiError && e.status === 401) {
        setDrawerOpen(false);
        clearAccount();
        window.history.replaceState(
          { toPeakScreen: 'login', toPeakIndex: 0 },
          '',
          `${window.location.pathname}${window.location.search}`,
        );
        setCurrentScreen('login');
      }
    },
    [clearAccount],
  );
  useLayoutEffect(
    () =>
      subscribeSessionExpiry((code, retiredUserId) => {
        if (logoutPending.current || !shouldNotifySessionExpiry(code)) return;
        if (code === 'account_unavailable' && retiredUserId) {
          const cleanup = completeAccountWithdrawal(retiredUserId);
          setWithdrawalNotice({ userId: retiredUserId, ...cleanup });
        }
        fail(new ApiError(401, '로그인 세션이 만료되었습니다. 다시 로그인해주세요.', code));
      }),
    [fail, me?.userId],
  );
  useEffect(
    () =>
      startWithdrawalSync((userId, result) => {
        if (currentMemberId.current === userId) setWithdrawalNotice({ userId, ...result });
      }),
    [],
  );
  useEffect(
    () =>
      subscribeAccountRetirement((userId) => {
        if (userId !== me?.userId) return;
        clearAccount();
        setDrawerOpen(false);
        setBusy(false);
        setCurrentScreen('login');
        window.history.replaceState({ toPeakScreen: 'login', toPeakIndex: 0 }, '', '/');
      }),
    [clearAccount, me?.userId],
  );
  const monthlyGoalState = useMonthlyGoals(
    me?.profileCompleted ? me.userId : null,
    screen === 'profile',
    goalMonth,
    profileRefresh,
    fail,
  );
  // 첫 진입 시 서버 세션을 확인한 뒤 프로필 설정, 상세 hash, 저장된 화면 순서로 진입 위치를 결정한다.
  useEffect(() => {
    clearLegacyMemberImages();
    if (oauthFailure) window.history.replaceState(window.history.state, '', oauthFailure.cleanUrl);
    const version = accountVersion.current;
    const controller = new AbortController();
    let active = true;
    const initializeScreen = (
      next: Screen,
      id: number | null = null,
      mountainId: string | null = null,
      detailId: number | null = null,
      linkedHike: HikingSelection | null = null,
      linkedUserId: number | null = null,
    ) => {
      window.history.replaceState(
        {
          toPeakScreen: next,
          toPeakIndex:
            typeof window.history.state?.toPeakIndex === 'number'
              ? window.history.state.toPeakIndex
              : 0,
          toPeakMountainId: mountainId,
          toPeakPublicId: id,
          toPeakJournalId: detailId,
          toPeakHikingSelection: linkedHike,
          toPeakHikingUserId: linkedUserId,
        },
        '',
        `${window.location.pathname}${window.location.search}${
          next === 'publicProfile' && id
            ? `#users/${id}`
            : next === 'journalDetail' && detailId
              ? `#journals/${detailId}`
              : ''
        }`,
      );
      setCurrentScreen(next);
    };
    recordLifecycle('auth-start');
    api<Member>('/api/users/me', 'GET', undefined, controller.signal)
      .then((user) => {
        if (!active || version !== accountVersion.current) return;
        confirmLogin();
        setMe(user);
        setNickname(user.nickname ?? '');
        setBirthYear(user.birthYear == null ? '' : String(user.birthYear));
        const match = window.location.hash.match(/^#users\/(\d+)$/);
        const detailMatch = window.location.hash.match(/^#journals\/(\d+)$/);
        if (!user.profileCompleted) initializeScreen('setup');
        else if (detailMatch) {
          setBusy(true);
          setJournalId(Number(detailMatch[1]));
          initializeScreen('journalDetail', null, null, Number(detailMatch[1]));
        } else if (match) {
          setBusy(true);
          setPublicId(Number(match[1]));
          initializeScreen('publicProfile', Number(match[1]));
        } else {
          const saved = window.history.state;
          const screens: Screen[] = [
            'hikingTracking',
            'explore',
            'detail',
            'diary',
            'profile',
            'accountSettings',
            'hikingRecords',
            'ranking',
            'setup',
            'myJournals',
            'favorites',
            'conquered',
            'about',
          ];
          if (screens.includes(saved?.toPeakScreen)) {
            const mountainId =
              typeof saved.toPeakMountainId === 'string' ? saved.toPeakMountainId : null;
            setSelected(mountainId);
            const linked =
              saved.toPeakScreen === 'hikingTracking' && saved.toPeakHikingUserId === user.userId
                ? readHikingSelection(saved.toPeakHikingSelection)
                : null;
            setHikingSelection(linked);
            initializeScreen(
              saved.toPeakScreen,
              null,
              mountainId,
              null,
              linked,
              linked ? user.userId : null,
            );
          } else initializeScreen('explore');
        }
      })
      .catch((e) => {
        if (
          active &&
          version === accountVersion.current &&
          (!(e instanceof ApiError) || e.status !== 401)
        )
          fail(e);
      })
      .finally(() => {
        if (active) {
          recordLifecycle('auth-finish');
          setLoading(false);
          if (oauthFailure) setError(oauthFailure.message);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [fail, oauthFailure]);
  // 브라우저 뒤로 가기는 새 이력을 만들지 않고 기존 화면과 대상 ID를 복원한다.
  // 복원할 화면도 현재 로그인·프로필 상태의 제한을 따른다.
  useEffect(() => {
    const back = () => {
      profileSave.current.invalidate();
      journalSave.current.invalidate();
      setDrawerOpen(false);
      if (!me) {
        setCurrentScreen('login');
        return;
      }
      if (!me.profileCompleted) {
        setCurrentScreen('setup');
        return;
      }
      const state = window.history.state;
      const match = window.location.hash.match(/^#users\/(\d+)$/);
      const detailMatch = window.location.hash.match(/^#journals\/(\d+)$/);
      const screens: Screen[] = [
        'hikingTracking',
        'explore',
        'detail',
        'diary',
        'journalDetail',
        'write',
        'profile',
        'accountSettings',
        'hikingRecords',
        'ranking',
        'setup',
        'myJournals',
        'publicProfile',
        'favorites',
        'conquered',
        'about',
      ];
      const next: Screen = detailMatch
        ? 'journalDetail'
        : match
          ? 'publicProfile'
          : screens.includes(state?.toPeakScreen)
            ? state.toPeakScreen
            : 'explore';
      setError('');
      setBusy(
        [
          'diary',
          'myJournals',
          'ranking',
          'publicProfile',
          'profile',
          'journalDetail',
          'write',
          'hikingRecords',
        ].includes(next),
      );
      setJournalDetail(null);
      setJournalId(detailMatch ? Number(detailMatch[1]) : (state?.toPeakJournalId ?? null));
      setJournals([]);
      setPublicProfile(null);
      setPublicId(match ? Number(match[1]) : (state?.toPeakPublicId ?? null));
      setSelected(typeof state?.toPeakMountainId === 'string' ? state.toPeakMountainId : null);
      setHikingSelection(
        next === 'hikingTracking' && state?.toPeakHikingUserId === me?.userId
          ? readHikingSelection(state?.toPeakHikingSelection)
          : null,
      );
      setCurrentScreen(next);
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, [me, screen, publicId]);
  useEffect(() => {
    if (screen !== 'profile' && screen !== 'publicProfile' && screen !== 'conquered') return;
    // 복귀 시 재검증은 유지하되, 이미 열린 화면을 로딩 화면으로 교체하지 않는다.
    return subscribeForegroundRefresh(window, document, () => {
      setError('');
      setProfileRefresh((value) => value + 1);
    });
  }, [screen]);
  // 화면별로 본인 일지·공개 일지·타인 프로필을 조회하고, 화면 이탈이나 계정 변경 뒤의 응답은 버린다.
  useEffect(() => {
    if (!me?.profileCompleted) return;
    const version = accountVersion.current;
    // 마이페이지 조회 중 이미지가 갱신되면 늦게 도착한 회원 응답이 최신 이미지 URL을 덮어쓰지 않게 한다.
    const imageVersion = memberImageVersion.current;
    const controller = new AbortController();
    let active = true;
    const update =
      <T,>(setter: (value: T) => void) =>
      (value: T) => {
        if (active && version === accountVersion.current) setter(value);
      };
    const request =
      screen === 'journalDetail' && journalId
        ? getJournal(journalId, controller.signal).then(update(setJournalDetail))
        : screen === 'diary'
          ? api<Journal[]>('/api/journals', 'GET', undefined, controller.signal).then(
              update(setJournals),
            )
          : screen === 'myJournals'
            ? api<Journal[]>('/api/users/me/journals', 'GET', undefined, controller.signal).then(
                update(setJournals),
              )
            : screen === 'publicProfile' && publicId
              ? getPublicProfileView(publicId, controller.signal).then(
                  ({ profile, journals: records }) => {
                    if (active && version === accountVersion.current) {
                      setPublicProfile(profile);
                      setJournals(records);
                    }
                  },
                )
              : screen === 'profile'
                ? Promise.all([
                    api<Member>('/api/users/me', 'GET', undefined, controller.signal),
                    api<Journal[]>('/api/users/me/journals', 'GET', undefined, controller.signal),
                  ]).then(([user, records]) => {
                    if (active && version === accountVersion.current) {
                      setMe((current) =>
                        current?.userId === user.userId &&
                        imageVersion !== memberImageVersion.current
                          ? {
                              ...user,
                              profileImageUrl: current.profileImageUrl,
                              backgroundImageUrl: current.backgroundImageUrl,
                            }
                          : user,
                      );
                      setJournals(records);
                    }
                  })
                : (screen === 'write' && !editing) || screen === 'hikingRecords'
                  ? getHikingRecords(controller.signal).then(update(setHikingRecords))
                  : Promise.resolve();
    request
      .then(() => {
        if (active && version === accountVersion.current) setJournalReadError(false);
      })
      .catch((e) => {
        if (active && version === accountVersion.current) {
          setJournalReadError(true);
          fail(e);
        }
      })
      .finally(() => {
        if (active && version === accountVersion.current) setBusy(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    screen,
    publicId,
    journalId,
    editing,
    me?.userId,
    me?.profileCompleted,
    profileRefresh,
    fail,
  ]);
  useEffect(() => {
    document.title = 'ToPeak';
  }, []);
  const openProfile = (id: number) => {
    setError('');
    setBusy(true);
    setPublicProfile(null);
    setJournals([]);
    setPublicId(id);
    setScreen('publicProfile', id);
  };
  const updateLogoutPending = useCallback((pending: boolean) => {
    logoutPending.current = pending;
    setBusy(pending);
    if (pending) {
      profileSave.current.invalidate();
      journalSave.current.invalidate();
      setDrawerOpen(false);
      setLogoutError(false);
      setError('');
    }
  }, []);
  useEffect(() => {
    logoutAction.current = createLogout({
      onPending: updateLogoutPending,
      onSuccess: () => {
        clearAccount();
        setError('');
        setCurrentScreen('login');
        window.history.replaceState({ toPeakScreen: 'login', toPeakIndex: 0 }, '', '/');
      },
      onFailure: () => setLogoutError(true),
    });
  }, [clearAccount, updateLogoutPending]);
  const logout = () => logoutAction.current?.();
  const withdraw = async (confirmation: string) => {
    if (!me || withdrawalLock.current) return;
    const userId = me.userId;
    const version = accountVersion.current;
    withdrawalLock.current = true;
    setWithdrawalPending(true);
    setDrawerOpen(false);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    try {
      await withdrawAccount(userId, confirmation, controller.signal);
      const cleanup = completeAccountWithdrawal(userId);
      setWithdrawalNotice({ userId, ...cleanup });
      if (version === accountVersion.current) {
        clearAccount();
        setCurrentScreen('login');
        window.history.replaceState({ toPeakScreen: 'login', toPeakIndex: 0 }, '', '/');
      }
      setError('');
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      throw new Error(
        '탈퇴 완료 여부를 확인하지 못했습니다. 로그인 상태를 확인한 후 다시 시도하십시오.',
      );
    } finally {
      window.clearTimeout(timer);
      withdrawalLock.current = false;
      setWithdrawalPending(false);
    }
  };
  // 프로필 저장 응답을 회원 상태에 반영한 뒤, 최초 설정과 기존 프로필 편집의 복귀 화면을 구분한다.
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
    const version = accountVersion.current;
    const wasProfileCompleted = me.profileCompleted;
    const current = profileSave.current.capture();
    const isCurrent = () =>
      current() &&
      version === accountVersion.current &&
      currentMemberId.current === snapshot.expectedUserId;
    await profileSave.current.run(
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
          if (!logoutPending.current) fail(cause);
        },
        settled: () => setBusy(false),
      },
    );
  };
  const confirmSavedProfile = async () => {
    const pending = profileConfirmation;
    if (busy || !pending?.isCurrent() || screen !== 'setup') return;
    await profileSave.current.run(
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
          } else if (!logoutPending.current) fail(cause);
        },
        settled: () => setBusy(false),
      },
    );
  };
  // 이전 화면의 늦은 응답으로 현재 화면을 이동시키지 않는다. 서버 저장은 완료될 수 있으므로
  // 목록에 다시 진입할 때는 최신 데이터를 조회한다.
  const saveJournal = async () => {
    if (busy) return;
    if (!editing && selectedRecord && !canCreateHikingJournal(selectedRecord)) {
      setError(
        selectedRecord.journalId !== null
          ? '이미 등산일지를 작성한 기록입니다.'
          : JOURNAL_ELIGIBILITY_MESSAGE,
      );
      return;
    }
    if (!title.trim() || (!editing && !canCreateHikingJournal(selectedRecord))) {
      setError('등산기록을 선택하고 제목을 입력해주세요.');
      return;
    }
    const version = accountVersion.current;
    const current = journalSave.current.capture();
    await journalSave.current.run(
      async () => {
        setBusy(true);
        setError('');
        const input = { title, content, isPublic };
        return editing
          ? updateJournal(editing, input)
          : createJournal({ ...input, hikingRecordId: selectedRecord!.id });
      },
      {
        success: () => {
          setJournals([]);
          setBusy(true);
          setScreen('myJournals');
        },
        failure: (cause) => {
          fail(cause);
          if (cause instanceof ApiError && cause.status === 409) {
            getHikingRecords()
              .then((records) => {
                if (version === accountVersion.current && current()) setHikingRecords(records);
              })
              .catch((error) => {
                if (version === accountVersion.current && current()) fail(error);
              });
          }
        },
        settled: () => setBusy(false),
      },
    );
  };
  // 화면에서 중복 삭제와 타인 일지 삭제를 막고, 실제 소유권은 서버가 다시 검증한다.
  // 삭제한 상세 화면은 history에서 교체해 뒤로 가기로 같은 항목을 다시 열지 않게 한다.
  const removeJournal = async (journal: Journal) => {
    if (screen !== 'journalDetail' || journal.userId !== me?.userId || deletingJournalId !== null)
      return;
    if (!window.confirm('등산일지를 삭제하시겠습니까?')) return;
    const version = accountVersion.current;
    setDeletingJournalId(journal.id);
    setError('');
    try {
      await deleteJournal(journal.id);
      if (version === accountVersion.current) {
        setJournals((current) => current.filter((item) => item.id !== journal.id));
        setJournalDetail((current) => (current?.id === journal.id ? null : current));
        if (
          window.history.state?.toPeakScreen === 'journalDetail' &&
          window.history.state?.toPeakJournalId === journal.id
        ) {
          setBusy(true);
          setScreen('myJournals', publicId, selected, null, true);
        }
      }
    } catch (cause) {
      if (version === accountVersion.current) fail(cause);
    } finally {
      if (version === accountVersion.current) setDeletingJournalId(null);
    }
  };
  // 목록의 ID로 상세 API를 다시 조회하므로 본문과 접근 권한은 서버의 최신 상태를 따른다.
  const openJournal = (id: number) => {
    setError('');
    setBusy(true);
    setJournalDetail(null);
    setJournalId(id);
    setScreen('journalDetail', publicId, selected, id);
  };
  // 본인 일지의 값과 ID를 작성 폼에 넘겨 신규 작성 대신 기존 일지를 수정하게 한다.
  const editJournal = (journal: Journal) => {
    if (journal.userId !== me?.userId || deletingJournalId !== null) return;
    setEditing(journal.id);
    setTitle(journal.title);
    setContent(journal.content);
    setDate(journal.hikingDate);
    setJournalMountain(journal.mountainName);
    setIsPublic(journal.isPublic);
    setScreen('write');
  };
  if (loading)
    return (
      <main className="app-shell auth-loading" aria-busy="true">
        <span className="auth-loading__spinner" aria-hidden="true" />
        <p role="status">ToPeak으로 이동 중...</p>
      </main>
    );

  const header = (title: string, back = false) => (
    <AppHeader
      title={title}
      back={back}
      ranking={screen === 'ranking'}
      menuVisible={Boolean(me?.profileCompleted)}
      disabled={withdrawalPending}
      onBack={goBack}
      onOpenMenu={() => setDrawerOpen(true)}
    />
  );

  return (
    <main className="app-shell">
      <SideDrawer
        open={drawerOpen}
        activeScreen={screen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={go}
        onLogout={() => void logout()}
        busy={busy || withdrawalPending}
      />
      <AppNotices
        withdrawalNotice={withdrawalNotice}
        logoutError={logoutError}
        error={error}
        profileAccountChanged={profileAccountChanged}
        favoriteError={favoriteError}
        profileCompleted={Boolean(me?.profileCompleted)}
        busy={busy}
        onRetryWithdrawalCleanup={(userId) => {
          const result = clearWithdrawnAccountData(userId);
          setWithdrawalNotice({ userId, ...result });
        }}
        onDismissWithdrawal={() => setWithdrawalNotice(null)}
        onRetryLogout={() => void logout()}
        onDismissLogout={() => setLogoutError(false)}
        onDismissError={() => setError('')}
      />
      {!loading && me?.profileCompleted && screen !== 'login' && (
        <HikingRecoveryNotice
          key={me.userId}
          userId={me.userId}
          visible={screen !== 'hikingTracking' && screen !== 'setup'}
          onNavigate={go}
        />
      )}
      {screen === 'login' && <LoginScreen busy={busy} />}
      {screen === 'explore' && (
        <>
          {header('산 탐색')}
          <ExploreScreen
            onSelectCourse={openHikingCourse}
            regions={exploreRegions}
            loading={explore.loading}
            error={explore.error}
            onRetry={explore.retry}
            activeRegionIndex={exploreRegion}
            onRegionChange={setExploreRegion}
            selectedCity={exploreCity}
            onSelectCity={setExploreCity}
            favoriteIds={favoriteIds}
            onFavoriteToggle={toggleFavorite}
          />
        </>
      )}
      {screen === 'detail' && (
        <>
          {header('상세', true)}
          <MountainDetailScreen
            mountain={mountain}
            loading={explore.loading}
            error={explore.error}
            favorite={Boolean(mountain && favoriteIds.includes(mountain.id))}
            onRetry={explore.retry}
            onExplore={() => go('explore')}
            onFavoriteToggle={toggleFavorite}
            onSelectCourse={openHikingCourse}
            onOpenDiary={() => go('diary')}
            onOpenHiking={() => go('hikingTracking')}
          />
        </>
      )}
      {screen === 'hikingTracking' && (
        <>
          {header('등산', hikingSelection !== null)}
          <HikingTrackingScreen
            onOpenRecords={() => go('hikingRecords')}
            userId={me!.userId}
            onRestoreSelection={(selection) => {
              setSelected(String(selection.mountainId));
              setHikingSelection(selection);
              window.history.replaceState(
                {
                  ...window.history.state,
                  toPeakMountainId: String(selection.mountainId),
                  toPeakHikingSelection: selection,
                  toPeakHikingUserId: me!.userId,
                },
                '',
                window.location.href,
              );
            }}
            selection={hikingSelection}
            onClearSelection={clearHikingSelection}
            onWriteJournal={(record) => {
              if (!canCreateHikingJournal(record)) {
                setError(
                  record.journalId !== null
                    ? '이미 등산일지를 작성한 기록입니다.'
                    : JOURNAL_ELIGIBILITY_MESSAGE,
                );
                return;
              }
              go('write');
              setSelectedRecordId(record.id);
            }}
          />
        </>
      )}
      {screen === 'setup' && (
        <>
          {header(
            me?.profileCompleted ? '프로필 편집' : '프로필 설정',
            Boolean(me?.profileCompleted),
          )}
          <ProfileSetupScreen
            profileCompleted={Boolean(me?.profileCompleted)}
            nickname={nickname}
            birthYear={birthYear}
            birthYearOptions={birthYearOptions}
            busy={busy}
            confirmationMessage={
              profileConfirmation?.isCurrent() ? profileConfirmation.message : null
            }
            onNicknameChange={setNickname}
            onBirthYearChange={setBirthYear}
            onConfirm={() => void confirmSavedProfile()}
            onSubmit={() => void saveProfile()}
          />
        </>
      )}
      {(screen === 'diary' || screen === 'myJournals') && (
        <>
          {header(screen === 'diary' ? '등산일지' : '내 등산일지', screen === 'myJournals')}
          <div className="scroll-content">
            <div className="section-heading">
              <b>{screen === 'diary' ? '등산일지' : '내 등산일지'}</b>
              <button onClick={() => go('write')}>등산일지 작성 ＋</button>
            </div>
            <JournalList
              busy={busy}
              readError={journalReadError}
              journals={journals}
              emptyMessage="아직 등산일지가 없습니다."
              onOpen={openJournal}
            />
          </div>
        </>
      )}
      {screen === 'journalDetail' && (
        <>
          {header('등산일지', true)}
          <JournalDetailScreen
            busy={busy}
            readError={journalReadError}
            journal={journalDetail}
            currentUserId={me?.userId ?? null}
            deletingJournalId={deletingJournalId}
            onSelectAuthor={openProfile}
            onEdit={editJournal}
            onDelete={(journal) => void removeJournal(journal)}
          />
        </>
      )}
      {screen === 'write' && (
        <>
          {header(editing ? '일지 수정' : '일지 작성')}
          <JournalEditorScreen
            editing={editing !== null}
            busy={busy}
            availableRecords={availableRecords}
            selectedRecord={selectedRecord}
            selectedRecordId={selectedRecordId}
            journalMountain={journalMountain}
            date={date}
            title={title}
            content={content}
            isPublic={isPublic}
            onSelectedRecordChange={setSelectedRecordId}
            onTitleChange={setTitle}
            onContentChange={setContent}
            onPublicChange={setIsPublic}
            onSubmit={() => void saveJournal()}
          />
        </>
      )}
      {screen === 'profile' && me && (
        <>
          <div className="scroll-content my-page-scroll">
            {completedHikes.loading && (
              <p role="status" className="completion-message">
                완등 기록을 불러오는 중…
              </p>
            )}
            {completedHikes.error && (
              <div role="alert" className="completion-message">
                <p>{completedHikes.error}</p>
                <button type="button" onClick={completedHikes.retry}>
                  다시 시도
                </button>
              </div>
            )}
            <MyPage
              key={`${me.userId}:${goalMonth}`}
              member={me}
              onMemberUpdated={(updated, kind) => {
                memberImageVersion.current += 1;
                const imageKey = kind === 'profile' ? 'profileImageUrl' : 'backgroundImageUrl';
                setMe((current) =>
                  current?.userId === updated.userId
                    ? { ...current, [imageKey]: updated[imageKey] }
                    : current,
                );
              }}
              onAuthError={fail}
              journalCount={busy || Boolean(error) ? null : journals.length}
              statistics={
                completedHikes.loading ||
                completedHikes.error ||
                completedHikes.statistics.month !== goalMonth
                  ? null
                  : completedHikes.statistics
              }
              monthlyGoals={monthlyGoalState.goals}
              onSaveGoals={monthlyGoalState.saveGoals}
              goalsError={monthlyGoalState.error}
              goalsReady={monthlyGoalState.ready}
              goalsLoading={monthlyGoalState.loading}
              goalsSaving={monthlyGoalState.saving}
              goalsMonth={goalMonth}
              onRetryGoals={monthlyGoalState.retry}
              onSettings={() => setDrawerOpen(true)}
              onEditProfile={() => {
                setNickname(me.nickname ?? '');
                setBirthYear(me.birthYear === null ? '' : String(me.birthYear));
                go('setup');
              }}
              onNavigate={go}
            />
          </div>
        </>
      )}
      {(screen === 'favorites' || screen === 'conquered') && (
        <>
          {header(screen === 'favorites' ? '찜한 산' : '완등한 산', true)}
          <div className="scroll-content collection-scroll">
            <MountainCollectionScreen
              key={`${screen}:${me?.userId}`}
              mode={screen}
              loading={explore.loading || (screen === 'conquered' && completedHikes.loading)}
              error={
                screen === 'conquered' && completedHikes.error
                  ? completedHikes.error
                  : explore.error
              }
              items={screen === 'favorites' ? favoriteMountains : conqueredCollection.items}
              missingCount={screen === 'conquered' ? conqueredCollection.missingIds.length : 0}
              favoriteIds={favoriteIds}
              onRetry={
                screen === 'conquered' && completedHikes.error
                  ? completedHikes.retry
                  : explore.retry
              }
              onRefreshMountains={explore.retry}
              onFavoriteToggle={toggleFavorite}
              onSelectCourse={openHikingCourse}
            />
          </div>
        </>
      )}
      {screen === 'publicProfile' && (
        <>
          {header('공개 프로필', true)}
          <PublicProfileScreen
            busy={busy}
            readError={journalReadError}
            profile={publicProfile}
            onRetry={() => {
              setError('');
              setBusy(true);
              setProfileRefresh((value) => value + 1);
            }}
            journals={
              <JournalList
                busy={busy}
                readError={journalReadError}
                journals={journals}
                emptyMessage="공개된 등산일지가 없습니다."
                onOpen={openJournal}
              />
            }
          />
        </>
      )}
      {screen === 'hikingRecords' && (
        <>
          {header('등산기록', true)}
          <HikingRecordsScreen
            busy={busy}
            records={hikingRecords}
            onRecordLoaded={(detail) =>
              setHikingRecords((current) =>
                current.map((item) => (item.id === detail.id ? detail : item)),
              )
            }
            onOpenJournal={openJournal}
            onWriteJournal={(record) => {
              go('write');
              setSelectedRecordId(record.id);
            }}
          />
        </>
      )}
      {screen === 'accountSettings' && me && (
        <>
          {header('계정', true)}
          <SettingsPage
            key={me.userId}
            userId={me.userId}
            nickname={me.nickname ?? ''}
            provider={me.provider}
            email={me.email}
            joinedAt={me.joinedAt}
            onWithdraw={withdraw}
          />
        </>
      )}
      {screen === 'about' && (
        <>
          {header('앱 정보', true)}
          <AboutScreen />
        </>
      )}
      {screen === 'ranking' && (
        <>
          {header('랭킹')}
          <RankingPage
            key={me?.userId ?? 'guest'}
            currentUserId={me?.userId ?? null}
            onSelectUser={openProfile}
            onAuthError={fail}
          />
        </>
      )}
    </main>
  );
}

export default App;
