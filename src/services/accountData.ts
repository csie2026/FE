import { retireAccount } from './accountLifecycle.ts';

export const accountStorageKeys = (id: number) => [
  `topeak.favoriteMountainIds.member.v1.${id}`,
  `topeak.hikingSession.v1.${id}`,
];
type RemovableStorage = { removeItem(key: string): void };
export function clearWithdrawnAccountData(
  userId: number,
  stores: (() => RemovableStorage)[] = [() => window.localStorage, () => window.sessionStorage],
) {
  retireAccount(userId); // Prevent an unmount checkpoint or stale tab from writing the draft back.
  let failed = false;
  for (const getStorage of stores) {
    for (const key of accountStorageKeys(userId)) {
      try {
        getStorage().removeItem(key);
      } catch {
        failed = true;
      }
    }
  }
  return { failed };
}

let channel: BroadcastChannel | undefined;
export function startWithdrawalSync(
  onCleanup?: (userId: number, result: { failed: boolean }) => void,
) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return () => {};
  const current = new BroadcastChannel('topeak.account-withdrawal.v1');
  channel = current;
  current.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (!data || typeof data !== 'object') return;
    const message = data as { type?: string; userId?: number };
    if (
      message.type === 'withdrawn' &&
      Number.isSafeInteger(message.userId) &&
      message.userId! > 0
    ) {
      const result = clearWithdrawnAccountData(message.userId!);
      onCleanup?.(message.userId!, result);
    }
  };
  return () => {
    current.close();
    if (channel === current) channel = undefined;
  };
}
export function completeAccountWithdrawal(userId: number) {
  const result = clearWithdrawnAccountData(userId);
  try {
    channel?.postMessage({ type: 'withdrawn', userId });
  } catch {
    /* Server also rejects every old session. */
  }
  return result;
}
