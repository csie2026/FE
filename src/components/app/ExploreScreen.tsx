import { lazy, Suspense } from 'react';
import type { Region } from '../../data/exploreRegions';
import type { HikingSelection } from '../hiking/services/hikingNavigation';

const RegionExplorer = lazy(() => import('../RegionExplorer'));

type Props = {
  regions: Region[];
  loading: boolean;
  error: string;
  activeRegionIndex: number;
  selectedCity: string | null;
  favoriteIds: string[];
  onRetry: () => void;
  onRegionChange: (index: number) => void;
  onSelectCity: (cityId: string | null) => void;
  onFavoriteToggle: (id: string) => void;
  onSelectCourse: (selection: HikingSelection) => void;
};

export default function ExploreScreen(props: Props) {
  return (
    <div className="scroll-content">
      <Suspense
        fallback={
          <p className="region-loading" role="status">
            경기도 권역 지도를 불러오는 중…
          </p>
        }
      >
        <RegionExplorer {...props} />
      </Suspense>
    </div>
  );
}
