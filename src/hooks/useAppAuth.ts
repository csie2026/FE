import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { api, subscribeSessionExpiry, ApiError, type Member } from '../api';
import type { HikingSelection } from '../components/hiking/services/hikingNavigation';
import { withdrawAccount } from '../services/withdrawal';
import { completeAccountWithdrawal, startWithdrawalSync } from '../services/accountData';
import { subscribeAccountRetirement } from '../services/accountLifecycle';
import { confirmLogin, forgetLogin, shouldNotifySessionExpiry } from '../services/loginHistory';
import { createLogout } from '../services/logout';
import { readOAuthFailure } from '../services/oauthFailure';
import { recordLifecycle } from '../services/lifecycleDiagnostics';
import {
  getInitialHistoryScreen,
  readAppHash,
  readHistoryHikingSelection,
  type Screen,
} from '../services/appHistory';
import { initializeHistoryScreen } from './useAppNavigation';
import { clearLegacyMemberImages } from '../utils/memberImages';
import { getErrorMessage } from '../utils/errorMessages';

type Setter<T> = Dispatch<SetStateAction<T>>;
type AuthNavigation = {
  setCurrentScreen: Setter<Screen>;
  setDrawerOpen: Setter<boolean>;
  setBusy: Setter<boolean>;
};
type AuthActions = {
  invalidateSaves: () => void;
  resetAccountData: () => void;
  clearFormStatus: () => void;
};

export function useAppAuth({
  setCurrentScreen,
  setDrawerOpen,
  invalidateSaves,
  resetAccountData,
  clearFormStatus,
}: Omit<AuthNavigation, 'setBusy'> & AuthActions) {
  const [loading, setLoading] = useState(true);
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
  const accountVersion = useRef(0);
  const logoutPending = useRef(false);
  const setLogoutPending = useCallback((pending: boolean) => {
    logoutPending.current = pending;
  }, []);
  const clearAccount = useCallback(() => {
    clearFormStatus();
    invalidateSaves();
    accountVersion.current += 1;
    forgetLogin();
    clearLegacyMemberImages();
    setMe(null);
    setLogoutError(false);
    resetAccountData();
  }, [clearFormStatus, invalidateSaves, resetAccountData]);
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
    [clearAccount, setDrawerOpen, setCurrentScreen],
  );
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
  return {
    loading,
    setLoading,
    oauthFailure,
    error,
    setError,
    logoutError,
    setLogoutError,
    withdrawalPending,
    withdrawalNotice,
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
  };
}

type Auth = ReturnType<typeof useAppAuth>;

export function useAppSessionEvents({
  logoutPending,
  setWithdrawalNotice,
  fail,
  currentMemberId,
  clearAccount,
  me,
  setDrawerOpen,
  setBusy,
  setCurrentScreen,
}: Pick<
  Auth,
  'logoutPending' | 'setWithdrawalNotice' | 'fail' | 'currentMemberId' | 'clearAccount' | 'me'
> &
  AuthNavigation) {
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
    [fail, me?.userId, logoutPending, setWithdrawalNotice],
  );
  useEffect(
    () =>
      startWithdrawalSync((userId, result) => {
        if (currentMemberId.current === userId) setWithdrawalNotice({ userId, ...result });
      }),
    [currentMemberId, setWithdrawalNotice],
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
    [clearAccount, me?.userId, setDrawerOpen, setBusy, setCurrentScreen],
  );
}

type InitialScreen = {
  setNickname: Setter<string>;
  setBirthYear: Setter<string>;
  setJournalId: Setter<number | null>;
  setPublicId: Setter<number | null>;
  setSelected: Setter<string | null>;
  setHikingSelection: Setter<HikingSelection | null>;
};

export function useInitialSession({
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
}: Pick<Auth, 'accountVersion' | 'oauthFailure' | 'fail' | 'setLoading' | 'setMe' | 'setError'> &
  Pick<AuthNavigation, 'setCurrentScreen' | 'setBusy'> &
  InitialScreen) {
  useEffect(() => {
    clearLegacyMemberImages();
    if (oauthFailure) window.history.replaceState(window.history.state, '', oauthFailure.cleanUrl);
    const version = accountVersion.current;
    const controller = new AbortController();
    let active = true;
    const initializeScreen = (...args: Parameters<typeof initializeHistoryScreen>) => {
      initializeHistoryScreen(...args);
      setCurrentScreen(args[0]);
    };
    recordLifecycle('auth-start');
    api<Member>('/api/users/me', 'GET', undefined, controller.signal)
      .then((user) => {
        if (!active || version !== accountVersion.current) return;
        confirmLogin();
        setMe(user);
        setNickname(user.nickname ?? '');
        setBirthYear(user.birthYear == null ? '' : String(user.birthYear));
        const { match, detailMatch } = readAppHash(window.location.hash);
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
          const restoredScreen = getInitialHistoryScreen(saved?.toPeakScreen);
          if (restoredScreen) {
            const mountainId =
              typeof saved.toPeakMountainId === 'string' ? saved.toPeakMountainId : null;
            setSelected(mountainId);
            const linked = readHistoryHikingSelection(restoredScreen, saved, user.userId);
            setHikingSelection(linked);
            initializeScreen(
              restoredScreen,
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
  }, [
    fail,
    oauthFailure,
    accountVersion,
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
  ]);
}

export function useAppLogout({
  setLogoutPending,
  setLogoutError,
  setError,
  clearAccount,
  setDrawerOpen,
  setBusy,
  setCurrentScreen,
  invalidateSaves,
}: Pick<Auth, 'setLogoutPending' | 'setLogoutError' | 'setError' | 'clearAccount'> &
  AuthNavigation &
  Pick<AuthActions, 'invalidateSaves'>) {
  const logoutAction = useRef<ReturnType<typeof createLogout> | null>(null);
  const updateLogoutPending = useCallback(
    (pending: boolean) => {
      setLogoutPending(pending);
      setBusy(pending);
      if (pending) {
        invalidateSaves();
        setDrawerOpen(false);
        setLogoutError(false);
        setError('');
      }
    },
    [setLogoutPending, setBusy, invalidateSaves, setDrawerOpen, setLogoutError, setError],
  );
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
  }, [clearAccount, updateLogoutPending, setError, setCurrentScreen, setLogoutError]);
  const logout = () => logoutAction.current?.();
  return logout;
}
