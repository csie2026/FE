import { useRef, useState } from 'react';
import MountainCard from '../MountainCard';

export interface CollectionMountain {
  id: string;
  name: string;
  height: string;
  distance: string;
  city: string;
  region: string;
}

type Props = {
  title: string;
  description: string;
  items: CollectionMountain[];
  favoriteIds: string[];
  completedIds: string[];
  onFavoriteToggle: (id: string) => void;
  onCompletedToggle: (id: string) => void;
  mode: 'favorites' | 'conquered';
};

export default function MountainCollection({
  title,
  description,
  items,
  favoriteIds,
  completedIds,
  onFavoriteToggle,
  onCompletedToggle,
  mode,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<CollectionMountain | null>(null);

  return (
    <section className="mountain-list-screen">
      <h1>{title}</h1>
      <p>{description}</p>
      {items.length ? (
        items.map((item) => (
          <div className="collection-mountain" key={item.id}>
            <MountainCard
              mountain={item}
              compact
              isFavorite={favoriteIds.includes(item.id)}
              onFavoriteToggle={() => onFavoriteToggle(item.id)}
              onClick={() => {
                setSelected(item);
                dialog.current?.showModal();
              }}
            >
              <small>
                {item.city} · {item.region}
              </small>
            </MountainCard>
            {mode === 'conquered' && (
              <button
                className={`collection-complete ${completedIds.includes(item.id) ? 'is-complete' : ''}`}
                onClick={() => onCompletedToggle(item.id)}
              >
                {completedIds.includes(item.id) ? '✓ 완등 기록됨' : '완등 기록하기'}
              </button>
            )}
          </div>
        ))
      ) : (
        <div className="mountain-list-empty">
          <strong>
            {mode === 'favorites' ? '아직 찜한 산이 없어요' : '아직 완등한 산이 없어요'}
          </strong>
          <span>
            {mode === 'favorites'
              ? '산 탐색에서 하트를 눌러 저장해보세요.'
              : '산 탐색에서 산 상세를 열어 완등으로 기록해보세요.'}
          </span>
        </div>
      )}
      <dialog
        className="region-mountain-dialog"
        ref={dialog}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        {selected && (
          <>
            <div className="section-heading">
              <b>{selected.name}</b>
              <button onClick={() => dialog.current?.close()}>닫기</button>
            </div>
            <p>
              {selected.city} · {selected.region}
            </p>
            <div className="stats">
              <div>
                <b>{selected.height}</b>
                <small>높이</small>
              </div>
              <div>
                <b>{selected.distance}</b>
                <small>코스 거리</small>
              </div>
            </div>
            <button
              type="button"
              className="collection-dialog-complete"
              aria-pressed={completedIds.includes(selected.id)}
              onClick={() => onCompletedToggle(selected.id)}
            >
              {completedIds.includes(selected.id) ? '완등 기록 해제' : '완등으로 기록'}
            </button>
          </>
        )}
      </dialog>
    </section>
  );
}
