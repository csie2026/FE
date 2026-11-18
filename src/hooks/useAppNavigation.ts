import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { Member } from '../api';
import type { HikingSelection } from '../components/hiking/services/hikingNavigation';
import {
  getHistoryScreen,
  readAppHash,
  readHistoryHikingSelection,
  type Screen,
} from '../services/appHistory.ts';

type Setter<T> = Dispatch<SetStateAction<T>>;

type Navigation = {
  loading: boolean;
  publicId: number | null;
  selected: string | null;
  journalId: number | null;
  me: Member | null;
  invalidateSaves: () => void;
  setCurrentScreen: Setter<Screen>;
  setHikingSelection: Setter<HikingSelection | null>;
};

export function createScreenTransition({
  loading,
  publicId,
  selected,
  journalId,
  me,
  invalidateSaves,
  setCurrentScreen,
  setHikingSelection,
}: Navigation) {
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
    invalidateSaves();
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
  return setScreen;
}

export function initializeHistoryScreen(
  next: Screen,
  id: number | null = null,
  mountainId: string | null = null,
  detailId: number | null = null,
  linkedHike: HikingSelection | null = null,
  linkedUserId: number | null = null,
) {
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
}

type HistoryRestoration = Pick<
  Navigation,
  'me' | 'publicId' | 'invalidateSaves' | 'setHikingSelection' | 'setCurrentScreen'
> & {
  screen: Screen;
  setDrawerOpen: Setter<boolean>;
  setError: Setter<string>;
  setBusy: Setter<boolean>;
  setJournalId: Setter<number | null>;
  setPublicId: Setter<number | null>;
  setSelected: Setter<string | null>;
  clearJournalDetail: () => void;
  clearResults: () => void;
};

export function useHistoryRestoration({
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
}: HistoryRestoration) {
  // 브라우저 뒤로 가기는 새 이력을 만들지 않고 기존 화면과 대상 ID를 복원한다.
  // 복원할 화면도 현재 로그인·프로필 상태의 제한을 따른다.
  useEffect(() => {
    const back = () => {
      invalidateSaves();
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
      const { match, detailMatch } = readAppHash(window.location.hash);
      const next = getHistoryScreen(state?.toPeakScreen, { match, detailMatch });
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
      clearJournalDetail();
      setJournalId(detailMatch ? Number(detailMatch[1]) : (state?.toPeakJournalId ?? null));
      clearResults();
      setPublicId(match ? Number(match[1]) : (state?.toPeakPublicId ?? null));
      setSelected(typeof state?.toPeakMountainId === 'string' ? state.toPeakMountainId : null);
      setHikingSelection(readHistoryHikingSelection(next, state, me.userId));
      setCurrentScreen(next);
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, [
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
  ]);
}

export function useNavigationState() {
  const [screen, setCurrentScreen] = useState<Screen>('login');
  const [drawerOpen, setDrawerOpen] = useState(false);
  return { screen, setCurrentScreen, drawerOpen, setDrawerOpen };
}

type AppNavigation = {
  screen: Screen;
  selected: string | null;
  publicId: number | null;
  me: Member | null;
  isWithdrawalPending: () => boolean;
  setScreen: ReturnType<typeof createScreenTransition>;
  setDrawerOpen: Setter<boolean>;
  setError: Setter<string>;
  setBusy: Setter<boolean>;
  resetDraft: () => void;
  clearResults: () => void;
  journalOwnerId: number | undefined;
};

export function createAppNavigation({
  screen,
  selected,
  publicId,
  me,
  isWithdrawalPending,
  setScreen,
  setDrawerOpen,
  setError,
  setBusy,
  resetDraft,
  clearResults,
  journalOwnerId,
}: AppNavigation) {
  // 일반 메뉴 이동은 세션과 프로필 완료 여부를 먼저 확인하고, 이전 화면의 조회 결과를 비운다.
  const go = (next: Screen, nextMountain = selected) => {
    if (isWithdrawalPending()) return;
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
    if (next === 'write') resetDraft();
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
    clearResults();
    setScreen(next, publicId, nextMountain);
  };
  const goBack = () => {
    if (isWithdrawalPending()) return;
    if (window.history.state?.toPeakIndex > 0) window.history.back();
    else
      go(
        screen === 'journalDetail'
          ? journalOwnerId === me?.userId
            ? 'myJournals'
            : 'diary'
          : 'explore',
      );
  };
  return { go, goBack };
}
