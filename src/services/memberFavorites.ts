import { isRetiredAccount, subscribeAccountRetirement } from './accountLifecycle.ts';
const PREFIX = 'topeak.favoriteMountainIds.member.v1.';
const READ_ERROR = '찜 목록을 읽지 못했습니다. 브라우저 저장소 설정을 확인해주세요.';
export interface FavoriteSnapshot {
  readonly ids: readonly string[];
  readonly error: string;
}
export interface FavoriteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const EMPTY_FAVORITES: FavoriteSnapshot = { ids: [], error: '' };

export function memberFavoritesKey(userId: number | null) {
  return userId !== null && Number.isSafeInteger(userId) && userId > 0
    ? `${PREFIX}${userId}`
    : null;
}
export function isMountainId(id: unknown): id is string {
  return typeof id === 'string' && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}
export function parseFavoriteIds(raw: string | null): string[] {
  const value: unknown = raw === null ? [] : JSON.parse(raw);
  return Array.isArray(value) ? [...new Set(value.filter(isMountainId))] : [];
}

// No legacy shared-key reads or automatic migration: the old list has no known owner.
// Snapshots are scoped to the authenticated member and stable for useSyncExternalStore.
export function createMemberFavoritesStore(storage: () => FavoriteStorage) {
  const cache = new Map<string, { raw: string | null | undefined; snapshot: FavoriteSnapshot }>();
  const volatile = new Map<string, FavoriteSnapshot>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  function snapshot(userId: number | null): FavoriteSnapshot {
    const key = memberFavoritesKey(userId);
    if (key === null || isRetiredAccount(userId)) return EMPTY_FAVORITES;
    const temporary = volatile.get(key);
    if (temporary) return temporary;
    let raw: string | null;
    try {
      raw = storage().getItem(key);
    } catch {
      const previous = cache.get(key)?.snapshot;
      if (previous?.error === READ_ERROR) return previous;
      const result = { ids: previous?.ids ?? [], error: READ_ERROR };
      cache.set(key, { raw: undefined, snapshot: result });
      return result;
    }
    const previous = cache.get(key);
    if (previous && previous.raw === raw) return previous.snapshot;
    let ids: string[] = [];
    let error = '';
    try {
      ids = parseFavoriteIds(raw);
    } catch {
      error = '저장된 찜 목록을 확인하지 못했습니다. 산을 다시 선택해주세요.';
    }
    const result = { ids, error };
    cache.set(key, { raw, snapshot: result });
    return result;
  }
  function toggle(userId: number | null, id: string, knownIds: ReadonlySet<string>) {
    const key = memberFavoritesKey(userId);
    if (key === null || isRetiredAccount(userId) || !isMountainId(id) || !knownIds.has(id))
      return false;
    const current = snapshot(userId).ids.filter((value) => knownIds.has(value));
    const ids = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    const raw = JSON.stringify(ids);
    try {
      storage().setItem(key, raw);
      volatile.delete(key);
      cache.set(key, { raw, snapshot: { ids, error: '' } });
    } catch {
      // Keep the unsaved interaction in this member's memory only; never spill into another account.
      volatile.set(key, {
        ids,
        error:
          '찜 변경을 저장하지 못했습니다. 현재 탭에서만 임시 반영되며 새로고침하면 사라질 수 있습니다.',
      });
    }
    emit();
    return true;
  }
  function externalChange(key: string | null) {
    if (key !== null && !key.startsWith(PREFIX)) return;
    if (key === null) {
      cache.clear();
      volatile.clear();
    } else {
      cache.delete(key);
      volatile.delete(key);
    }
    emit();
  }
  subscribeAccountRetirement((id) => {
    const key = memberFavoritesKey(id);
    if (key) {
      cache.delete(key);
      volatile.delete(key);
    }
    emit();
  });
  return {
    snapshot,
    toggle,
    externalChange,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
