import type { HikingSelection } from '../hiking/services/hikingNavigation';
import MountainCollection, { type CollectionMountain } from '../profile/MountainCollection';

type Props = {
  mode: 'favorites' | 'conquered';
  loading: boolean;
  error: string;
  items: CollectionMountain[];
  missingCount: number;
  favoriteIds: string[];
  onRetry: () => void;
  onRefreshMountains: () => void;
  onFavoriteToggle: (id: string) => void;
  onSelectCourse: (selection: HikingSelection) => void;
};

export default function MountainCollectionScreen({
  mode,
  loading,
  error,
  items,
  missingCount,
  favoriteIds,
  onRetry,
  onRefreshMountains,
  onFavoriteToggle,
  onSelectCourse,
}: Props) {
  if (loading) {
    return (
      <p role="status">
        {mode === 'conquered' ? '완등한 산을 불러오는 중…' : '산 목록을 불러오는 중…'}
      </p>
    );
  }
  if (error) {
    return (
      <div role="alert">
        <p>{error}</p>
        <button type="button" onClick={onRetry}>
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <MountainCollection
      mode={mode}
      title={mode === 'favorites' ? '내가 찜한 산' : '완등한 산'}
      description={
        mode === 'favorites'
          ? '마음에 담아둔 산을 모아봤어요.'
          : 'GPS 정상 도달과 산행 인증이 모두 확인된 산을 모았어요.'
      }
      items={items}
      missingCount={missingCount}
      onRefreshMountains={onRefreshMountains}
      favoriteIds={favoriteIds}
      onFavoriteToggle={onFavoriteToggle}
      onSelectCourse={onSelectCourse}
    />
  );
}
