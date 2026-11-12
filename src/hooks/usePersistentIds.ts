import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createMemberFavoritesStore, EMPTY_FAVORITES } from '../services/memberFavorites';

const favorites = createMemberFavoritesStore(() => window.localStorage);

// 저장 키를 userId에 맞춰 즉시 전환해 로그인·로그아웃·계정 변경 후
// 이펙트 실행을 기다리는 동안에도 이전 회원의 목록이 노출되지 않게 한다.
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
