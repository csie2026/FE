import type { ReactNode } from 'react';
import type { Member } from '../../api';
import type { useCourseSelection } from '../../hooks/useCourseSelection';
import type { useProfileData } from '../../hooks/useProfileData';
import type { Screen } from '../../services/appHistory';
import type { HikingSelection } from '../hiking/services/hikingNavigation';
import ExploreScreen from './ExploreScreen';
import MountainCollectionScreen from './MountainCollectionScreen';
import MountainDetailScreen from './MountainDetailScreen';

type Props = {
  screen: Screen;
  header: (title: string, back?: boolean) => ReactNode;
  userId: Member['userId'] | undefined;
  mountains: ReturnType<typeof useCourseSelection>;
  completion: Pick<ReturnType<typeof useProfileData>, 'completedHikes' | 'conqueredCollection'>;
  go: (screen: Screen) => void;
  openHikingCourse: (selection: HikingSelection) => void;
};

export default function MountainScreens({
  screen,
  header,
  userId,
  mountains,
  completion: { completedHikes, conqueredCollection },
  go,
  openHikingCourse,
}: Props) {
  const {
    exploreRegion,
    setExploreRegion,
    exploreCity,
    setExploreCity,
    explore,
    mountain,
    exploreRegions,
    favoriteIds,
    toggleFavorite,
    favoriteMountains,
  } = mountains;
  return (
    <>
      {screen === 'explore' && (
        <>
          {header('산 탐색')}
          <ExploreScreen
            onSelectCourse={openHikingCourse}
            regions={exploreRegions}
            loading={explore.loading}
            error={explore.error}
            onRetry={explore.retry}
            activeRegionIndex={exploreRegion}
            onRegionChange={setExploreRegion}
            selectedCity={exploreCity}
            onSelectCity={setExploreCity}
            favoriteIds={favoriteIds}
            onFavoriteToggle={toggleFavorite}
          />
        </>
      )}
      {screen === 'detail' && (
        <>
          {header('상세', true)}
          <MountainDetailScreen
            mountain={mountain}
            loading={explore.loading}
            error={explore.error}
            favorite={Boolean(mountain && favoriteIds.includes(mountain.id))}
            onRetry={explore.retry}
            onExplore={() => go('explore')}
            onFavoriteToggle={toggleFavorite}
            onSelectCourse={openHikingCourse}
            onOpenDiary={() => go('diary')}
            onOpenHiking={() => go('hikingTracking')}
          />
        </>
      )}
      {(screen === 'favorites' || screen === 'conquered') && (
        <>
          {header(screen === 'favorites' ? '찜한 산' : '완등한 산', true)}
          <div className="scroll-content collection-scroll">
            <MountainCollectionScreen
              key={`${screen}:${userId}`}
              mode={screen}
              loading={explore.loading || (screen === 'conquered' && completedHikes.loading)}
              error={
                screen === 'conquered' && completedHikes.error
                  ? completedHikes.error
                  : explore.error
              }
              items={screen === 'favorites' ? favoriteMountains : conqueredCollection.items}
              missingCount={screen === 'conquered' ? conqueredCollection.missingIds.length : 0}
              favoriteIds={favoriteIds}
              onRetry={
                screen === 'conquered' && completedHikes.error
                  ? completedHikes.retry
                  : explore.retry
              }
              onRefreshMountains={explore.retry}
              onFavoriteToggle={toggleFavorite}
              onSelectCourse={openHikingCourse}
            />
          </div>
        </>
      )}
    </>
  );
}
