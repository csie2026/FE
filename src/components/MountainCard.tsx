import type { ReactNode } from 'react';

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
