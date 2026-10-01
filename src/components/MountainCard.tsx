import type { ReactNode } from 'react';

export function MountainArt({ small = false }: { small?: boolean }) {
  return (
    <div className={`mountain-art ${small ? 'small' : ''}`}>
      <svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="360" height="180" fill="#dce9db" />
        <path d="M0 135 84 42l54 60 69-83 92 117 61-55v99H0Z" fill="#7cad88" />
        <path d="m0 150 92-70 67 49 80-69 121 81v39H0Z" fill="#3e8061" />
        <path d="m50 180 108-80 67 52 78-62 57 56v34Z" fill="#21634a" />
      </svg>
    </div>
  );
}

type Props = {
  mountain: { id?: string; name: string; height: string; distance: string };
  compact?: boolean;
  onClick: () => void;
  children?: ReactNode;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
};

export default function MountainCard({
  mountain,
  compact = false,
  onClick,
  children,
  isFavorite = false,
  onFavoriteToggle,
}: Props) {
  return (
    <article className={`mountain-card ${compact ? 'compact' : ''}`}>
      <button type="button" className="mountain-card__main" onClick={onClick}>
        <MountainArt small />
        <span className="mountain-info">
          <b>{mountain.name}</b>
          <small>
            {mountain.height} · {mountain.distance}
          </small>
          {children}
        </span>
        <span className="badge">보기</span>
      </button>
      {onFavoriteToggle && (
        <button
          type="button"
          className={`mountain-card__favorite ${isFavorite ? 'is-favorite' : ''}`}
          aria-label={
            isFavorite ? `${mountain.name} 즐겨찾기 해제` : `${mountain.name} 즐겨찾기 추가`
          }
          aria-pressed={isFavorite}
          onClick={onFavoriteToggle}
        >
          {isFavorite ? '♥' : '♡'}
        </button>
      )}
    </article>
  );
}
