import { useScreenData } from './hooks/useScreenData';
import {
  createProfileActions,
  useProfileForm,
  useProfileData,
  useProfileGoals,
  useProfileForegroundRefresh,
} from './hooks/useProfileData';
import { createActivityActions, useActivityState } from './hooks/useActivityFlow';
import { useCourseSelection, useCourseSelectionState } from './hooks/useCourseSelection';
import {
  useAppAuth,
  useAppLogout,
  useAppSessionEvents,
  useInitialSession,
} from './hooks/useAppAuth';
import {
  createAppNavigation,
  createScreenTransition,
  useHistoryRestoration,
  useNavigationState,
} from './hooks/useAppNavigation';
import { createScopedRequest } from './services/scopedRequest';
import { recordLifecycle } from './services/lifecycleDiagnostics';
import { type HikingSelection } from './components/hiking/services/hikingNavigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './App.css';
import ProfileScreen from './components/app/ProfileScreen';
import RankingPage from './components/ranking/RankingPage';
import SettingsPage from './components/settings/SettingsPage';
import AboutScreen from './components/app/AboutScreen';
import AppShell, { AppLoading } from './components/app/AppShell';
import AppHeader from './components/app/AppHeader';
import JournalScreens from './components/app/JournalScreens';
import LoginScreen from './components/app/LoginScreen';
import HikingScreens from './components/app/HikingScreens';
import ProfileSetupScreen from './components/app/ProfileSetupScreen';
import PublicProfileScreen from './components/app/PublicProfileScreen';
import MountainScreens from './components/app/MountainScreens';
import type { PublicProfileDetails } from './api';

// 화면 상태와 회원 상태를 한곳에서 조율하며, history/hash를 통해 뒤로 가기와 상세 링크를 복원한다.
function App() {
  const { screen, setCurrentScreen, drawerOpen, setDrawerOpen } = useNavigationState();
  const [busy, setBusy] = useState(false);
  const profileSave = useRef(createScopedRequest());
  const journalSave = useRef(createScopedRequest());
  const form = useProfileForm();
  const { setNickname, setBirthYear, resetForm, clearFormStatus } = form;
  const [publicProfile, setPublicProfile] = useState<PublicProfileDetails | null>(null);
  const [publicId, setPublicId] = useState<number | null>(null);
  const activity = useActivityState();
  const { setJournals, journalId, setJournalId, setJournalDetail, editing, resetActivity } =
    activity;
  const course = useCourseSelectionState();
  const { selected, setSelected, hikingSelection, setHikingSelection } = course;
  const clearResults = useCallback(() => {
    setJournals([]);
    setPublicProfile(null);
  }, [setJournals]);
  const clearJournalDetail = useCallback(() => setJournalDetail(null), [setJournalDetail]);
  const invalidateSaves = useCallback(() => {
    profileSave.current.invalidate();
    journalSave.current.invalidate();
  }, []);
  const resetAccountData = useCallback(() => {
    setHikingSelection(null);
    resetForm();
    clearResults();
    setPublicId(null);
    resetActivity();
  }, [setHikingSelection, resetForm, clearResults, resetActivity]);
  const auth = useAppAuth({
    setCurrentScreen,
    setDrawerOpen,
    invalidateSaves,
    resetAccountData,
    clearFormStatus,
  });
  const {
    loading,
    setLoading,
    oauthFailure,
    error,
    setError,
    setLogoutError,
    withdrawalPending,
    setWithdrawalNotice,
    withdrawalLock,
    me,
    setMe,
    currentMemberId,
    accountVersion,
    logoutPending,
    setLogoutPending,
    clearAccount,
    fail,
    withdraw,
  } = auth;
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
  useLayoutEffect(() => {
    const profile = profileSave.current,
      journal = journalSave.current;
    return () => {
      profile.invalidate();
      journal.invalidate();
    };
  }, [screen, me?.userId, editing]);
  const mountains = useCourseSelection(me, course);
  const profile = useProfileData({ me, screen, mountainCatalog: mountains.mountainCatalog, setMe });
  const { goalMonth, profileRefresh, setProfileRefresh, memberImageVersion } = profile;
  // oxlint-disable-next-line react/refs -- Saves are invalidated when the returned transition runs.
  const setScreen = createScreenTransition({
    loading,
    publicId,
    selected,
    journalId,
    me,
    invalidateSaves,
    setCurrentScreen,
    setHikingSelection,
  });
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
  // oxlint-disable-next-line react/refs -- The factory only captures ref accessors for event handlers.
  const { go, goBack } = createAppNavigation({
    screen,
    selected,
    publicId,
    me,
    isWithdrawalPending: () => withdrawalLock.current,
    setScreen,
    setDrawerOpen,
    setError,
    setBusy,
    resetDraft: activity.resetDraft,
    clearResults,
    journalOwnerId: activity.journalDetail?.userId,
  });
  // Keep session subscriptions, bootstrap, restoration, reads, and logout registered in order.
  useAppSessionEvents({
    logoutPending,
    setWithdrawalNotice,
    fail,
    currentMemberId,
    clearAccount,
    me,
    setDrawerOpen,
    setBusy,
    setCurrentScreen,
  });
  const monthlyGoalState = useProfileGoals({ me, screen, goalMonth, profileRefresh, fail });
  useInitialSession({
    accountVersion,
    oauthFailure,
    fail,
    setLoading,
    setMe,
    setError,
    setCurrentScreen,
    setNickname,
    setBirthYear,
    setBusy,
    setJournalId,
    setPublicId,
    setSelected,
    setHikingSelection,
  });
  useHistoryRestoration({
    me,
    screen,
    publicId,
    invalidateSaves,
    setHikingSelection,
    setCurrentScreen,
    setDrawerOpen,
    setError,
    setBusy,
    setJournalId,
    setPublicId,
    setSelected,
    clearJournalDetail,
    clearResults,
  });
  useProfileForegroundRefresh(screen, setError, setProfileRefresh);
  useScreenData({
    screen,
    publicId,
    profileRefresh,
    me,
    accountVersion,
    memberImageVersion,
    setMe,
    setPublicProfile,
    setBusy,
    fail,
    activity,
  });
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
  const logout = useAppLogout({
    setLogoutPending,
    setLogoutError,
    setError,
    clearAccount,
    setDrawerOpen,
    setBusy,
    setCurrentScreen,
    invalidateSaves,
  });
  // oxlint-disable-next-line react/refs -- The factory only captures ref accessors for event handlers.
  const { birthYearOptions, saveProfile, confirmSavedProfile } = createProfileActions({
    form,
    screen,
    me,
    busy,
    setBusy,
    setError,
    setMe,
    fail,
    clearAccount,
    setScreen,
    getProfileSave: () => profileSave.current,
    getAccountVersion: () => accountVersion.current,
    getCurrentMemberId: () => currentMemberId.current,
    isLogoutPending: () => logoutPending.current,
  });
  // oxlint-disable-next-line react/refs -- The factory only captures ref accessors for event handlers.
  const journalActions = createActivityActions({
    activity,
    screen,
    me,
    busy,
    getAccountVersion: () => accountVersion.current,
    getJournalSave: () => journalSave.current,
    setBusy,
    setError,
    fail,
    setScreen,
    go,
    publicId,
    selected,
  });
  if (loading) return <AppLoading />;

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
    <AppShell
      screen={screen}
      auth={auth}
      busy={busy}
      drawerOpen={drawerOpen}
      closeDrawer={() => setDrawerOpen(false)}
      navigate={go}
      logout={logout}
      profileAccountChanged={form.profileAccountChanged}
      favoriteError={mountains.favoriteError}
    >
      {screen === 'login' && <LoginScreen busy={busy} />}
      <MountainScreens
        screen={screen}
        header={header}
        userId={me?.userId}
        mountains={mountains}
        completion={profile}
        go={go}
        openHikingCourse={openHikingCourse}
      />
      <HikingScreens
        screen={screen}
        header={header}
        member={me}
        busy={busy}
        selection={hikingSelection}
        mountains={mountains}
        records={activity.hikingRecords}
        actions={journalActions}
        go={go}
      />
      {screen === 'setup' && (
        <>
          {header(
            me?.profileCompleted ? '프로필 편집' : '프로필 설정',
            Boolean(me?.profileCompleted),
          )}
          <ProfileSetupScreen
            profileCompleted={Boolean(me?.profileCompleted)}
            form={form}
            birthYearOptions={birthYearOptions}
            busy={busy}
            onConfirm={confirmSavedProfile}
            onSubmit={saveProfile}
          />
        </>
      )}
      <JournalScreens
        screen={screen}
        header={header}
        activity={activity}
        busy={busy}
        currentUserId={me?.userId ?? null}
        onWrite={() => go('write')}
        onSelectAuthor={openProfile}
        actions={journalActions}
      />
      {screen === 'profile' && me && (
        <ProfileScreen
          member={me}
          profile={profile}
          monthlyGoals={monthlyGoalState}
          journalCount={busy || Boolean(error) ? null : activity.journals.length}
          onAuthError={fail}
          onSettings={() => setDrawerOpen(true)}
          onEditProfile={() => {
            setNickname(me.nickname ?? '');
            setBirthYear(me.birthYear === null ? '' : String(me.birthYear));
            go('setup');
          }}
          onNavigate={go}
        />
      )}
      {screen === 'publicProfile' && (
        <>
          {header('공개 프로필', true)}
          <PublicProfileScreen
            busy={busy}
            readError={activity.journalReadError}
            profile={publicProfile}
            onRetry={() => {
              setError('');
              setBusy(true);
              setProfileRefresh((value) => value + 1);
            }}
            journals={activity.journals}
            onOpenJournal={journalActions.openJournal}
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
    </AppShell>
  );
}

export default App;
