import { completedHikeDate, type CompletedMountainSummary } from '../../services/completedHikes';
import type { HikingSelection } from '../hiking/services/hikingNavigation';
import { useRef, useState } from 'react';
import MountainCard from '../MountainCard';
import MountainCourseInfo from '../MountainCourseInfo';

export interface CollectionMountain {
  id: string;
  name: string;
  height: string;
  distance: string;
  city: string;
  region: string;
  completion?: CompletedMountainSummary;
}

type Props = {
  onSelectCourse: (selection: HikingSelection) => void;
  title: string;
  description: string;
  items: CollectionMountain[];
  favoriteIds: string[];
  onFavoriteToggle: (id: string) => void;
  mode: 'favorites' | 'conquered';
  missingCount?: number;
  onRefreshMountains?: () => void;
};

export default function MountainCollection({
  onSelectCourse,
  title,
  description,
  items,
  favoriteIds,
  onFavoriteToggle,
  mode,
  missingCount = 0,
  onRefreshMountains,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<CollectionMountain | null>(null);

  return (
    <section className="mountain-list-screen">
      <h1>{title}</h1>
      <p>{description}</p>
      {mode === 'conquered' && missingCount > 0 && (
        <div role="alert" className="mountain-list-empty">
          <span>완등한 산 {missingCount}개의 정보를 확인하지 못했습니다.</span>
          {onRefreshMountains && (
            <button type="button" onClick={onRefreshMountains}>
              산 정보 다시 불러오기
            </button>
          )}
        </div>
      )}
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
              {mode === 'conquered' && item.completion && (
                <small>
                  완등 {item.completion.completedCount}회
                  {completedHikeDate(item.completion.latestStartedAt) && (
                    <> · 최근 완등 산행일 {completedHikeDate(item.completion.latestStartedAt)}</>
                  )}
                </small>
              )}
            </MountainCard>
          </div>
        ))
      ) : missingCount > 0 && mode === 'conquered' ? null : (
        <div className="mountain-list-empty">
          <strong>
            {mode === 'favorites' ? '아직 찜한 산이 없어요' : '아직 완등한 산이 없어요'}
          </strong>
          <span>
            {mode === 'favorites'
              ? '산 탐색에서 하트를 눌러 저장해보세요.'
              : 'GPS 산행에서 정상 도달 후 저장한 기록이 여기에 표시됩니다.'}
          </span>
        </div>
      )}
      <dialog
        onClose={() => setSelected(null)}
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
            {mode === 'conquered' && selected.completion && (
              <p>
                완등 {selected.completion.completedCount}회
                {completedHikeDate(selected.completion.latestStartedAt) && (
                  <> · 최근 완등 산행일 {completedHikeDate(selected.completion.latestStartedAt)}</>
                )}
              </p>
            )}
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
            <MountainCourseInfo
              key={selected.id}
              mountainId={selected.id}
              onSelectCourse={(selection) => {
                dialog.current?.close();
                onSelectCourse(selection);
              }}
            />
          </>
        )}
      </dialog>
    </section>
  );
}
