import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createMemberFavoritesStore, EMPTY_FAVORITES } from '../services/memberFavorites';

const favorites = createMemberFavoritesStore(() => window.localStorage);

// The active key follows userId synchronously, so no previous-member list is exposed
// while waiting for an effect after login, logout or an account change.
export function usePersistentIds(userId: number | null, knownMountainIds: ReadonlySet<string>) {
  const getSnapshot = useCallback(() => favorites.snapshot(userId), [userId]);
  const subscribe = useCallback((listener: () => void) => {
    const unsubscribe = favorites.subscribe(listener);
    const sync = (event: StorageEvent) => {
      if (event.storageArea !== null) {
        try {
          if (event.storageArea !== window.localStorage) return;
        } catch {
          return;
        }
      }
      favorites.externalChange(event.key);
    };
    window.addEventListener('storage', sync);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', sync);
    };
  }, []);
  const current = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_FAVORITES);
  const ids = useMemo(
    () => current.ids.filter((id) => knownMountainIds.has(id)),
    [current, knownMountainIds],
  );
  const toggle = useCallback(
    (id: string) => favorites.toggle(userId, id, knownMountainIds),
    [userId, knownMountainIds],
  );
  return { ids, toggle, error: current.error };
}
