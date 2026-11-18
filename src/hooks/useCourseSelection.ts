import { useMemo, useState } from 'react';
import type { Member } from '../api';
import type { HikingSelection } from '../components/hiking/services/hikingNavigation';
import { groupExploreMountains } from '../services/exploreMountains';
import { useExploreMountains } from './useExploreMountains';
import { usePersistentIds } from './usePersistentIds';

export function useCourseSelectionState() {
  const [selected, setSelected] = useState<string | null>(null);
  const [hikingSelection, setHikingSelection] = useState<HikingSelection | null>(null);
  return { selected, setSelected, hikingSelection, setHikingSelection };
}

export function useCourseSelection(
  me: Member | null,
  { selected, setSelected, setHikingSelection }: ReturnType<typeof useCourseSelectionState>,
) {
  const [exploreRegion, setExploreRegion] = useState(0);
  const [exploreCity, setExploreCity] = useState<string | null>(null);
  const explore = useExploreMountains(me?.profileCompleted ? me.userId : null);
  const mountainCatalog = explore.items;
  const knownMountainIds = useMemo(
    () => new Set(mountainCatalog.map((item) => item.id)),
    [mountainCatalog],
  );
  const {
    ids: favoriteIds,
    toggle: toggleFavorite,
    error: favoriteError,
  } = usePersistentIds(me?.profileCompleted ? me.userId : null, knownMountainIds);
  const exploreRegions = useMemo(() => groupExploreMountains(mountainCatalog), [mountainCatalog]);
  const mountain = mountainCatalog.find((item) => item.id === selected);
  const favoriteMountains = mountainCatalog.filter((item) => favoriteIds.includes(item.id));
  const clearHikingSelection = () => {
    setHikingSelection(null);
    window.history.replaceState(
      { ...window.history.state, toPeakHikingSelection: null, toPeakHikingUserId: null },
      '',
      window.location.href,
    );
  };
  const restoreHikingSelection = (selection: HikingSelection) => {
    setSelected(String(selection.mountainId));
    setHikingSelection(selection);
    window.history.replaceState(
      {
        ...window.history.state,
        toPeakMountainId: String(selection.mountainId),
        toPeakHikingSelection: selection,
        toPeakHikingUserId: me!.userId,
      },
      '',
      window.location.href,
    );
  };
  return {
    exploreRegion,
    setExploreRegion,
    exploreCity,
    setExploreCity,
    explore,
    mountainCatalog,
    mountain,
    exploreRegions,
    favoriteIds,
    toggleFavorite,
    favoriteError,
    favoriteMountains,
    clearHikingSelection,
    restoreHikingSelection,
  };
}
