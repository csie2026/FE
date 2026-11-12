import { createScopedRequest } from './services/scopedRequest';
import { getErrorMessage } from './utils/errorMessages';
import { readOAuthFailure } from './services/oauthFailure';
import ProfileAvatar from './components/common/ProfileAvatar';
import { createLogout } from './services/logout';
import { confirmLogin, forgetLogin, shouldNotifySessionExpiry } from './services/loginHistory';
import { koreanMonthBounds } from './services/hikingStatistics';
import { buildCompletedMountainCollection } from './services/completedHikes';
import { scoringText } from './components/hiking/services/scoringDisplay';
import { useCompletedHikes } from './hooks/useCompletedHikes';
import {
  readHikingSelection,
  type HikingSelection,
} from './components/hiking/services/hikingNavigation';
import logo from './assets/topeak-logo.svg';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import './App.css';
import HikingPage from './components/hiking/HikingPage';
import HikingRecoveryNotice from './components/hiking/HikingRecoveryNotice';
import MountainCourseInfo from './components/MountainCourseInfo';
import MountainWeather from './components/MountainWeather';
import MyPage from './components/profile/MyPage';
import MountainCollection from './components/profile/MountainCollection';
import RankingPage from './components/ranking/RankingPage';
import { groupExploreMountains } from './services/exploreMountains';
import { useExploreMountains } from './hooks/useExploreMountains';
import { usePersistentIds } from './hooks/usePersistentIds';
import { useMonthlyGoals } from './hooks/useMonthlyGoals';
import { clearLegacyMemberImages } from './utils/memberImages';
import SideDrawer from './components/common/SideDrawer';
import SettingsPage from './components/settings/SettingsPage';
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
  scoreText,
  type Member,
  type Journal,
  type PublicProfile,
} from './api';

const RegionExplorer = lazy(() => import('./components/RegionExplorer'));

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

function BrandMark() {
  return (
    <div className="brand-mark" aria-label="ToPeak 로고">
      <img src={logo} alt="" />
      <strong>ToPeak</strong>
    </div>
  );
}

// 화면 상태와 회원 상태를 한곳에서 조율하며, history/hash를 통해 뒤로 가기와 상세 링크를 복원한다.
function App() {
  const [screen, setCurrentScreen] = useState<Screen>('login');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
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
  const availableRecords = hikingRecords.filter((record) => record.journalId === null);
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
    const refresh = () => {
      if (!document.hidden) {
        setBusy(true);
        setError('');
        setProfileRefresh((value) => value + 1);
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
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
              ? Promise.all([
                  api<PublicProfile>(
                    `/api/users/${publicId}/profile`,
                    'GET',
                    undefined,
                    controller.signal,
                  ),
                  api<Journal[]>(
                    `/api/users/${publicId}/journals`,
                    'GET',
                    undefined,
                    controller.signal,
                  ),
                ]).then(([profile, records]) => {
                  if (active && version === accountVersion.current) {
                    setPublicProfile(profile);
                    setJournals(records);
                  }
                })
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
    if (busy) return;
    const year = Number(birthYear);
    if (!nickname.trim() || nickname.trim().length > 30) {
      setError('닉네임은 1~30자로 입력해주세요.');
      return;
    }
    if (!/^\d{4}$/.test(birthYear) || year < 1900 || year > currentYear) {
      setError('출생연도를 선택해 주세요.');
      return;
    }
    await profileSave.current.run(
      async () => {
        setBusy(true);
        setError('');
        return api<Member>('/api/users/me/profile', 'PATCH', {
          nickname: nickname.trim(),
          birthYear: year,
        });
      },
      {
        success: (user) => {
          setMe(user);
          setBusy(Boolean(me?.profileCompleted));
          setScreen(me?.profileCompleted ? 'profile' : 'explore');
        },
        failure: (cause) => {
          if (!logoutPending.current) fail(cause);
        },
        settled: () => setBusy(false),
      },
    );
  };
  // 이전 화면의 늦은 응답으로 현재 화면을 이동시키지 않는다. 서버 저장은 완료될 수 있으므로
  // 목록에 다시 진입할 때는 최신 데이터를 조회한다.
  const saveJournal = async () => {
    if (busy) return;
    if (!title.trim() || (!editing && (!selectedRecord || selectedRecord.journalId !== null))) {
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
  const avatar = (profile: PublicProfile) => (
    <ProfileAvatar
      userId={profile.userId}
      nickname={profile.nickname}
      src={profile.profileImageUrl}
      className="avatar"
    />
  );
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
  const journalList = () =>
    busy ? (
      <p role="status">불러오는 중…</p>
    ) : journalReadError ? (
      <p role="status">등산일지를 불러오지 못했습니다. 화면을 다시 열어 조회해주세요.</p>
    ) : journals.length ? (
      journals.map((j) => (
        <article
          className="diary-card diary-card--clickable"
          key={j.id}
          role="button"
          tabIndex={0}
          aria-label={`${j.title} 등산일지 상세 보기`}
          onClick={() => openJournal(j.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openJournal(j.id);
            }
          }}
        >
          <div className="diary-card__body">
            <b>{j.title}</b>
            <small>
              {j.mountainName} · {j.hikingDate} · {j.nickname}
            </small>
            <p className="journal-content">{j.content}</p>
          </div>
          <span className="badge">{j.isPublic ? '공개' : '비공개'}</span>
        </article>
      ))
    ) : (
      <p className="muted">아직 등산일지가 없습니다.</p>
    );
  if (loading)
    return (
      <main className="app-shell auth-loading" aria-busy="true">
        <span className="auth-loading__spinner" aria-hidden="true" />
        <p role="status">ToPeak으로 이동 중...</p>
      </main>
    );

  const header = (title: string, back = false) => (
    <header className={`topbar${screen === 'ranking' ? ' topbar--ranking' : ''}`}>
      {back ? (
        <button
          type="button"
          className="back"
          onClick={goBack}
          aria-label="뒤로가기"
          disabled={withdrawalPending}
        >
          ‹
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
      <strong>{title}</strong>
      {me?.profileCompleted ? (
        <button
          type="button"
          className="icon-button menu-button"
          onClick={() => setDrawerOpen(true)}
          disabled={withdrawalPending}
          aria-label="메뉴 열기"
          aria-haspopup="dialog"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </header>
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
      {withdrawalNotice && (
        <div className="error-banner" role="status">
          <span>
            {withdrawalNotice.failed
              ? '회원탈퇴는 완료됐지만 이 브라우저의 일부 저장 정보를 정리하지 못했어요. 저장소 설정을 확인한 뒤 다시 시도해주세요.'
              : '회원탈퇴가 완료되었습니다.'}
          </span>
          {withdrawalNotice.failed && (
            <button
              type="button"
              onClick={() => {
                const result = clearWithdrawnAccountData(withdrawalNotice.userId);
                setWithdrawalNotice({ userId: withdrawalNotice.userId, ...result });
              }}
            >
              브라우저 정보 정리 다시 시도
            </button>
          )}
          <button type="button" onClick={() => setWithdrawalNotice(null)}>
            닫기
          </button>
        </div>
      )}
      {logoutError && (
        <div className="error-banner" role="alert">
          로그아웃 완료를 확인하지 못했습니다. 다시 시도해주세요.
          <button type="button" disabled={busy} onClick={() => void logout()}>
            로그아웃 다시 시도
          </button>
          <button type="button" onClick={() => setLogoutError(false)}>
            닫기
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError('')}>닫기</button>
        </div>
      )}
      {me?.profileCompleted && favoriteError && (
        <div className="error-banner" role="alert">
          {favoriteError}
        </div>
      )}
      {!loading && me?.profileCompleted && screen !== 'login' && (
        <HikingRecoveryNotice
          key={me.userId}
          userId={me.userId}
          visible={screen !== 'hikingTracking' && screen !== 'setup'}
          onNavigate={go}
        />
      )}
      {screen === 'login' && (
        <section className="login-screen">
          <div className="login-brand">
            <BrandMark />
            <p>기록하고 즐겁게 오르는 방법</p>
          </div>
          <div className="login-actions">
            <button
              className="social google"
              disabled={busy}
              onClick={() => window.location.assign('/oauth2/authorization/google')}
            >
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.7h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.8Z"
                />
                <path
                  fill="#34A853"
                  d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z"
                />
                <path
                  fill="#FBBC05"
                  d="M12.6 27.8a12 12 0 0 1 0-7.6V15H5.8a20 20 0 0 0 0 17.9l6.8-5.1Z"
                />
                <path
                  fill="#EA4335"
                  d="M24 11.8c3 0 5.7 1 7.8 3.1l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z"
                />
              </svg>
              <span>Google로 시작하기</span>
            </button>
            <button
              className="social kakao"
              disabled={busy}
              onClick={() => window.location.assign('/oauth2/authorization/kakao')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#191919"
                  d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.67 6.66l-.96 3.55a.35.35 0 0 0 .53.38l4.2-2.78c.51.07 1.03.1 1.56.1 5.52 0 10-3.54 10-7.91S17.52 3 12 3Z"
                />
              </svg>
              <span>카카오로 시작하기</span>
            </button>
            <small>간편하게 시작하고 나만의 산행을 기록해보세요</small>
          </div>
        </section>
      )}
      {screen === 'explore' && (
        <>
          {header('산 탐색')}
          <div className="scroll-content">
            <Suspense
              fallback={
                <p className="region-loading" role="status">
                  경기도 권역 지도를 불러오는 중…
                </p>
              }
            >
              <RegionExplorer
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
            </Suspense>
          </div>
        </>
      )}
      {screen === 'detail' && !mountain && (
        <>
          {header('상세', true)}
          <div className="scroll-content">
            {explore.loading ? (
              <p role="status">산 정보를 불러오는 중…</p>
            ) : explore.error ? (
              <div role="alert">
                <p>{explore.error}</p>
                <button onClick={explore.retry}>다시 시도</button>
              </div>
            ) : (
              <p>선택한 산을 찾을 수 없습니다. 산 탐색에서 다시 선택해주세요.</p>
            )}
            <button onClick={() => go('explore')}>산 탐색으로</button>
          </div>
        </>
      )}
      {screen === 'detail' && mountain && (
        <>
          {header('상세', true)}
          <div className="scroll-content detail-content">
            <div className="detail-title">
              <div>
                <h1>{mountain.name}</h1>
                <small>{mountain.city}</small>
              </div>
              <button
                className={`heart ${favoriteIds.includes(mountain.id) ? 'is-favorite' : ''}`}
                aria-label={favoriteIds.includes(mountain.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                aria-pressed={favoriteIds.includes(mountain.id)}
                onClick={() => toggleFavorite(mountain.id)}
              >
                {favoriteIds.includes(mountain.id) ? '♥' : '♡'}
              </button>
            </div>
            <div className="stats">
              <div>
                <b>{mountain.height}</b>
                <small>높이</small>
              </div>
              <div>
                <b>{mountain.distance}</b>
                <small>코스 거리</small>
              </div>
              <div>
                <b>코스별 확인</b>
                <small>난이도</small>
              </div>
            </div>
            <MountainWeather mountainId={mountain.id} />
            <MountainCourseInfo
              key={mountain.id}
              mountainId={mountain.id}
              onSelectCourse={openHikingCourse}
            />
            <div className="bottom-actions">
              <button onClick={() => go('diary')}>등산 기록하기</button>
              <button className="primary" onClick={() => go('hikingTracking')}>
                등산 앱과 연동하기
              </button>
            </div>
          </div>
        </>
      )}
      {screen === 'hikingTracking' && (
        <>
          {header('등산', hikingSelection !== null)}
          <HikingPage
            onOpenRecords={() => go('hikingRecords')}
            key={me?.userId}
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
            initialSelection={hikingSelection}
            onClearSelection={clearHikingSelection}
            onWriteJournal={(record) => {
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
          <form
            className="scroll-content form-content"
            onSubmit={(e) => {
              e.preventDefault();
              void saveProfile();
            }}
          >
            <h2>
              ToPeak에서 사용할
              <br />
              정보를 입력해주세요.
            </h2>
            <label>
              닉네임
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={30}
                required
                autoComplete="nickname"
              />
              {nickname.length >= 30 && (
                <span style={{ color: '#c2410c', fontSize: '12px' }}>
                  닉네임은 최대 30자까지 입력할 수 있습니다.
                </span>
              )}
            </label>
            <label>
              출생연도
              <select
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                autoComplete="bday-year"
                required
                disabled={busy}
              >
                <option value="" disabled>
                  출생연도를 선택해 주세요
                </option>
                {birthYearOptions.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}년
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">출생연도를 선택해 주세요.</p>
            <button className="submit" disabled={busy}>
              {me?.profileCompleted ? '변경 사항 저장' : '시작하기'}
            </button>
          </form>
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
            {journalList()}
          </div>
        </>
      )}
      {screen === 'journalDetail' && (
        <>
          {header('등산일지', true)}
          <section className="scroll-content journal-detail">
            {busy ? (
              <p role="status">불러오는 중…</p>
            ) : journalDetail ? (
              <>
                <article className="journal-detail__body">
                  <span className="badge">{journalDetail.isPublic ? '공개' : '비공개'}</span>
                  <h2>{journalDetail.title}</h2>
                  <dl className="journal-detail__meta">
                    <div>
                      <dt>산 이름</dt>
                      <dd>{journalDetail.mountainName}</dd>
                    </div>
                    <div>
                      <dt>등산 날짜</dt>
                      <dd>{journalDetail.hikingDate}</dd>
                    </div>
                    <div>
                      <dt>작성자</dt>
                      <dd>{journalDetail.nickname}</dd>
                    </div>
                  </dl>
                  <p className="journal-detail__content">{journalDetail.content}</p>
                </article>
                {journalDetail.userId === me?.userId && (
                  <div className="bottom-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={deletingJournalId !== null}
                      onClick={() => editJournal(journalDetail)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      disabled={deletingJournalId !== null}
                      onClick={() => void removeJournal(journalDetail)}
                    >
                      {deletingJournalId === journalDetail.id ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="muted">등산일지를 확인할 수 없습니다.</p>
            )}
          </section>
        </>
      )}
      {screen === 'write' && (
        <>
          {header(editing ? '일지 수정' : '일지 작성')}
          <form
            className="scroll-content form-content"
            onSubmit={(e) => {
              e.preventDefault();
              void saveJournal();
            }}
          >
            <h2>오늘의 산행을 기록해요</h2>
            <p className="muted">멋있었던 순간을 남겨보세요</p>
            {!editing && (
              <>
                <label>
                  내 등산기록 선택
                  <select
                    value={selectedRecordId ?? ''}
                    disabled={busy}
                    onChange={(e) =>
                      setSelectedRecordId(e.target.value ? Number(e.target.value) : null)
                    }
                    required
                  >
                    <option value="">등산기록을 선택해주세요</option>
                    {availableRecords.map((record) => (
                      <option key={record.id} value={record.id}>
                        {record.mountainName} · {record.hikingDate} ·{' '}
                        {(record.distanceMeters / 1000).toFixed(1)}km ·{' '}
                        {Math.floor(record.elapsedMs / 60000)}분
                      </option>
                    ))}
                  </select>
                </label>
                {busy ? (
                  <p role="status">등산기록을 불러오는 중…</p>
                ) : (
                  availableRecords.length === 0 && (
                    <p className="muted">
                      작성 가능한 등산기록이 없습니다. 산행을 마치고 기록을 저장해주세요.
                    </p>
                  )
                )}
              </>
            )}
            {(editing || selectedRecord) && (
              <dl className="journal-write-summary" aria-label="산행 정보">
                <div>
                  <dt>산</dt>
                  <dd>{editing ? journalMountain : selectedRecord?.mountainName}</dd>
                </div>
                <div>
                  <dt>등산 날짜</dt>
                  <dd>{editing ? date : selectedRecord?.hikingDate}</dd>
                </div>
              </dl>
            )}
            <label>
              제목
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
                placeholder="산행 제목을 입력하세요"
              />
            </label>
            <label>
              오늘의 여정
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={10000}
                rows={4}
              />
            </label>
            <div className="switch-row">
              <b>다른 사용자에게 공개</b>
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                aria-label="다른 사용자에게 공개"
                className={`switch ${isPublic ? 'on' : ''}`}
                onClick={() => setIsPublic(!isPublic)}
              >
                <span />
              </button>
            </div>
            <button
              className="submit"
              disabled={
                busy || (!editing && (!selectedRecord || selectedRecord.journalId !== null))
              }
            >
              일지 저장하기
            </button>
          </form>
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
            {explore.loading || (screen === 'conquered' && completedHikes.loading) ? (
              <p role="status">
                {screen === 'conquered' ? '완등한 산을 불러오는 중…' : '산 목록을 불러오는 중…'}
              </p>
            ) : screen === 'conquered' && completedHikes.error ? (
              <div role="alert">
                <p>{completedHikes.error}</p>
                <button type="button" onClick={completedHikes.retry}>
                  다시 시도
                </button>
              </div>
            ) : explore.error ? (
              <div role="alert">
                <p>{explore.error}</p>
                <button onClick={explore.retry}>다시 시도</button>
              </div>
            ) : (
              <MountainCollection
                key={`${screen}:${me?.userId}`}
                onSelectCourse={openHikingCourse}
                mode={screen}
                title={screen === 'favorites' ? '내가 찜한 산' : '완등한 산'}
                description={
                  screen === 'favorites'
                    ? '마음에 담아둔 산을 모아봤어요.'
                    : 'GPS 산행 활동에서 정상 도달로 저장된 산을 모았어요.'
                }
                items={screen === 'favorites' ? favoriteMountains : conqueredCollection.items}
                missingCount={screen === 'conquered' ? conqueredCollection.missingIds.length : 0}
                onRefreshMountains={explore.retry}
                favoriteIds={favoriteIds}

                onFavoriteToggle={toggleFavorite}
              />
            )}
          </div>
        </>
      )}
      {screen === 'publicProfile' && (
        <>
          {header('사용자 프로필', true)}
          <div className="scroll-content profile-content">
            {busy ? (
              <p role="status">불러오는 중…</p>
            ) : (
              publicProfile && (
                <>
                  <article className="profile-card">
                    {avatar(publicProfile)}
                    <div>
                      <b>{publicProfile.nickname}</b>
                      <small>{scoreText(publicProfile.score)}</small>
                    </div>
                  </article>
                  <h3>등산일지</h3>
                  {journalList()}
                </>
              )
            )}
          </div>
        </>
      )}
      {screen === 'hikingRecords' && (
        <>
          {header('등산기록', true)}
          <section className="scroll-content utility-content">
            {busy ? (
              <p role="status">불러오는 중…</p>
            ) : hikingRecords.length ? (
              hikingRecords.map((record) => (
                <article className="profile-summary" key={record.id}>
                  <div>
                    <b>{record.mountainName}</b>
                    <p>{record.hikingDate}</p>
                    <p>
                      {(record.distanceMeters / 1000).toFixed(1)}km ·{' '}
                      {Math.floor(record.elapsedMs / 60000)}분 ·{' '}
                      {record.completed ? '완등' : '산행 종료'}
                    </p>
                    <p>{scoringText(record.scoring)}</p>
                    {record.journalId !== null ? (
                      <button onClick={() => openJournal(record.journalId!)}>등산일지 보기</button>
                    ) : (
                      <button
                        onClick={() => {
                          go('write');
                          setSelectedRecordId(record.id);
                        }}
                      >
                        등산일지 작성
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p>저장된 등산기록이 없습니다.</p>
            )}
          </section>
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
          <section
            className="scroll-content utility-content about-content"
            aria-label="ToPeak 소개"
          >
            <div className="about-intro">
              <img className="about-logo" src={logo} alt="" />
              <h1>ToPeak</h1>
              <p className="about-tagline">산을 탐색하고, 나만의 산행을 기록하다.</p>
              <p>
                산과 등산로를 탐색하고, GPS로 산행을 기록하며 나만의 산행 활동과 일지를 관리하는
                서비스입니다.
              </p>
            </div>

            <section className="about-section" aria-labelledby="about-features-title">
              <h2 id="about-features-title">주요 기능</h2>
              <div className="about-features">
                {[
                  {
                    title: '산·등산로 탐색',
                    description: '산과 코스 정보를 살펴보고 나에게 맞는 산행을 준비해요.',
                    path: 'M3 19 9 5l4 8 3-5 5 11H3ZM7 10l2 2 2-2',
                  },
                  {
                    title: 'GPS 산행 기록',
                    description: '위치 권한을 허용하고 이동 경로, 거리와 시간을 기록해요.',
                    path: 'M6 5a2 2 0 1 0 0 .01M18 19a2 2 0 1 0 0 .01M8 5h7a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h7',
                  },
                  {
                    title: '산행 활동 및 일지',
                    description: '저장한 산행 기록을 확인하고 일지로 추억을 남겨요.',
                    path: 'M5 3h14v18H5V3ZM9 8h6M9 12h6M9 16h4',
                  },
                  {
                    title: '랭킹',
                    description:
                      '서버에서 산정한 점수와 회원 순위를 확인해요. 산행 점수는 인증 조건에 따라 반영돼요.',
                    path: 'M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 13v7M8 21h8',
                  },
                ].map((feature) => (
                  <article className="about-feature" key={feature.title}>
                    <span className="about-feature-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={feature.path} />
                      </svg>
                    </span>
                    <div>
                      <h3>{feature.title}</h3>
                      <p>{feature.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="about-section" aria-labelledby="about-guide-title">
              <h2 id="about-guide-title">이용 방법</h2>
              <ol className="about-steps">
                <li>산과 코스를 선택해요.</li>
                <li>위치 권한을 허용하고 산행을 시작해요.</li>
                <li>산행을 종료하고 기록을 저장해요.</li>
                <li>마이페이지의 등산기록에서 이전 산행을 확인해요.</li>
              </ol>
            </section>

            <section className="about-section about-notice" aria-labelledby="about-notice-title">
              <h2 id="about-notice-title">이용 시 유의사항</h2>
              <ul>
                <li>GPS 정확도는 지형, 날씨, 기기 등 이용 환경에 따라 달라질 수 있어요.</li>
                <li>모바일 웹에서는 화면 잠금이나 앱 전환 시 위치 수집이 제한될 수 있어요.</li>
                <li>안전한 산행을 위해 출발 전 기상과 탐방로 상태를 확인해 주세요.</li>
              </ul>
            </section>

            <footer className="about-project">
              <h2>프로젝트 정보</h2>
              <p>2026 컴퓨터정보공학 학술제 프로젝트</p>
              <p>Team FiveGuys</p>
            </footer>
          </section>
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
