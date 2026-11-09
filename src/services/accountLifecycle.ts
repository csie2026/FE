// In-memory only: never retain a deleted account's identity in browser storage.
const retired = new Set<number>();
const listeners = new Set<(userId: number) => void>();
export const isRetiredAccount = (userId: number | null) => userId !== null && retired.has(userId);
export function retireAccount(userId: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('회원 정보를 확인해주세요.');
  if (retired.has(userId)) return;
  retired.add(userId);
  listeners.forEach((listener) => listener(userId));
}
export function subscribeAccountRetirement(listener: (userId: number) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
