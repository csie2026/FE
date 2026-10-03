import { useEffect, useRef } from 'react';
import './SideDrawer.css';

export type DrawerDestination =
  | 'explore'
  | 'ranking'
  | 'diary'
  | 'hikingTracking'
  | 'profile'
  | 'accountSettings'
  | 'setup'
  | 'about';
type Props = {
  open: boolean;
  activeScreen: string;
  onClose: () => void;
  onNavigate: (destination: DrawerDestination) => void;
  onLogout: () => void;
  busy: boolean;
};
const mainMenus: { destination: DrawerDestination; label: string }[] = [
  { destination: 'explore', label: '산탐색' },
  { destination: 'ranking', label: '랭킹' },
  { destination: 'diary', label: '등산일지' },
  { destination: 'hikingTracking', label: '등산' },
  { destination: 'profile', label: '마이페이지' },
];
const utilities: { destination: DrawerDestination; label: string }[] = [
  { destination: 'accountSettings', label: '계정 설정' },
  { destination: 'about', label: '앱 정보' },
];

export default function SideDrawer({
  open,
  activeScreen,
  onClose,
  onNavigate,
  onLogout,
  busy,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    let frame = 0;
    let timer = 0;
    if (open) {
      if (!dialog.open) dialog.showModal();
      frame = requestAnimationFrame(() => dialog.classList.add('is-open'));
    } else {
      dialog.classList.remove('is-open');
      timer = window.setTimeout(() => dialog.close(), 220);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open]);

  const menu = (destination: DrawerDestination, label: string) => (
    <button
      key={destination}
      type="button"
      aria-current={activeScreen === destination ? 'page' : undefined}
      onClick={() => {
        onClose();
        onNavigate(destination);
      }}
    >
      {label}
    </button>
  );

  return (
    <dialog
      ref={dialogRef}
      className="side-drawer"
      aria-labelledby="drawer-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        type="button"
        className="side-drawer__backdrop"
        aria-label="메뉴 닫기"
        onClick={onClose}
        tabIndex={-1}
      />
      <aside className="side-drawer__panel">
        <div className="side-drawer__heading">
          <strong id="drawer-title">ToPeak</strong>
          <button type="button" onClick={onClose} aria-label="메뉴 닫기">
            ×
          </button>
        </div>
        <nav className="side-drawer__main" aria-label="메인 메뉴">
          {mainMenus.map((item) => menu(item.destination, item.label))}
        </nav>
        <nav className="side-drawer__utilities" aria-label="설정 메뉴">
          {utilities.map((item) => menu(item.destination, item.label))}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onClose();
              onLogout();
            }}
          >
            로그아웃
          </button>
        </nav>
      </aside>
    </dialog>
  );
}
