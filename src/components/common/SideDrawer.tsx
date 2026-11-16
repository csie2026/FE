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
  { destination: 'accountSettings', label: '계정' },
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
      // 닫힘 애니메이션이 끝난 뒤에만 대화상자를 닫아 패널이 갑자기 사라지지 않게 한다.
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
        // 모달 상태를 먼저 해제한 뒤 화면을 바꿔 새 화면의 포커스 이동을 막지 않게 한다.
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
        <nav className="side-drawer__utilities" aria-label="계정 메뉴">
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
