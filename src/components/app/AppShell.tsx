import type { ReactNode } from 'react';
import type { useAppAuth } from '../../hooks/useAppAuth';
import { clearWithdrawnAccountData } from '../../services/accountData';
import type { Screen } from '../../services/appHistory';
import SideDrawer from '../common/SideDrawer';
import HikingRecoveryNotice from '../hiking/HikingRecoveryNotice';
import AppNotices from './AppNotices';

export function AppLoading() {
  return (
    <main className="app-shell auth-loading" aria-busy="true">
      <span className="auth-loading__spinner" aria-hidden="true" />
      <p role="status">ToPeak으로 이동 중...</p>
    </main>
  );
}

type Props = {
  screen: Screen;
  auth: Pick<
    ReturnType<typeof useAppAuth>,
    | 'me'
    | 'error'
    | 'setError'
    | 'logoutError'
    | 'setLogoutError'
    | 'withdrawalPending'
    | 'withdrawalNotice'
    | 'setWithdrawalNotice'
  >;
  busy: boolean;
  drawerOpen: boolean;
  closeDrawer: () => void;
  navigate: (screen: Screen) => void;
  logout: () => void;
  profileAccountChanged: boolean;
  favoriteError: string;
  children: ReactNode;
};

export default function AppShell({
  screen,
  auth,
  busy,
  drawerOpen,
  closeDrawer,
  navigate,
  logout,
  profileAccountChanged,
  favoriteError,
  children,
}: Props) {
  const {
    me,
    error,
    setError,
    logoutError,
    setLogoutError,
    withdrawalPending,
    withdrawalNotice,
    setWithdrawalNotice,
  } = auth;
  const onLogout = () => void logout();
  return (
    <main className="app-shell">
      <SideDrawer
        open={drawerOpen}
        activeScreen={screen}
        onClose={closeDrawer}
        onNavigate={navigate}
        onLogout={onLogout}
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
        onRetryLogout={onLogout}
        onDismissLogout={() => setLogoutError(false)}
        onDismissError={() => setError('')}
      />
      {me?.profileCompleted && screen !== 'login' && (
        <HikingRecoveryNotice
          key={me.userId}
          userId={me.userId}
          visible={screen !== 'hikingTracking' && screen !== 'setup'}
          onNavigate={navigate}
        />
      )}
      {children}
    </main>
  );
}
