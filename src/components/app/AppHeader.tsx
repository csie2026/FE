type Props = {
  title: string;
  back?: boolean;
  ranking?: boolean;
  menuVisible: boolean;
  disabled?: boolean;
  onBack: () => void;
  onOpenMenu: () => void;
};

// 모든 최상위 화면이 같은 탐색 규칙과 접근성 속성을 사용하도록 헤더를 한곳에서 관리한다.
export default function AppHeader({
  title,
  back = false,
  ranking = false,
  menuVisible,
  disabled = false,
  onBack,
  onOpenMenu,
}: Props) {
  return (
    <header className={`topbar${ranking ? ' topbar--ranking' : ''}`}>
      {back ? (
        <button
          type="button"
          className="back"
          onClick={onBack}
          aria-label="뒤로가기"
          disabled={disabled}
        >
          ‹
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
      <strong>{title}</strong>
      {menuVisible ? (
        <button
          type="button"
          className="icon-button menu-button"
          onClick={onOpenMenu}
          disabled={disabled}
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
}
