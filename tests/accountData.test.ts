import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearWithdrawnAccountData, accountStorageKeys } from '../src/services/accountData.ts';
import { isRetiredAccount } from '../src/services/accountLifecycle.ts';
import { createMemberFavoritesStore } from '../src/services/memberFavorites.ts';
import {
  completeSession,
  initialSession,
  draftFromSession,
  writeRecovery,
} from '../src/components/hiking/services/sessionRecovery.ts';

function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}
test('cleanup removes only the withdrawn accounts known personal keys in local and session stores', () => {
  const a = storage(),
    b = storage();
  for (const store of [a, b]) {
    for (const key of [...accountStorageKeys(801), ...accountStorageKeys(802)])
      store.setItem(key, 'private');
    store.setItem('unrelated', 'keep');
    store.setItem('topeak.favoriteMountainIds', 'unowned legacy');
  }
  assert.equal(clearWithdrawnAccountData(801, [() => a, () => b]).failed, false);
  for (const store of [a, b]) {
    for (const key of accountStorageKeys(801)) assert.equal(store.getItem(key), null);
    for (const key of accountStorageKeys(802)) assert.equal(store.getItem(key), 'private');
    assert.equal(store.getItem('unrelated'), 'keep');
    assert.equal(store.getItem('topeak.favoriteMountainIds'), 'unowned legacy');
  }
});
test('blocked storage reports remaining data, tries every key and allows cleanup retry', () => {
  const a = storage();
  let calls = 0;
  const failed = clearWithdrawnAccountData(803, [
    () => {
      calls++;
      throw Error('blocked');
    },
    () => a,
  ]);
  assert.equal(failed.failed, true);
  assert.equal(calls, 2);
  assert.ok(isRetiredAccount(803));
  assert.equal(clearWithdrawnAccountData(803, [() => a]).failed, false);
});
test('retirement clears volatile favorite caches and rejects stale callbacks without affecting another member', () => {
  const disk = storage();
  let denied = false;
  const favorites = createMemberFavoritesStore(() => ({
    ...disk,
    setItem(k: string, v: string) {
      if (denied) throw Error('quota');
      disk.setItem(k, v);
    },
  }));
  const catalog = new Set(['47']);
  assert.ok(favorites.toggle(804, '47', catalog));
  denied = true;
  assert.ok(favorites.toggle(805, '47', catalog));
  assert.deepEqual(favorites.snapshot(805).ids, ['47']);
  clearWithdrawnAccountData(805, [() => disk]);
  assert.deepEqual(favorites.snapshot(805).ids, []);
  assert.equal(favorites.toggle(805, '47', catalog), false);
  assert.deepEqual(favorites.snapshot(804).ids, ['47']);
});
test('an old GPS checkpoint cannot recreate deleted data during unmount or in another notified tab', () => {
  const disk = storage(),
    now = Date.now() - 100;
  const session = completeSession(
    {
      ...initialSession(),
      state: 'PAUSED',
      startedAt: now - 1000,
      accumulatedMs: 1000,
      clientRequestId: crypto.randomUUID(),
      segments: [[]],
    },
    { mountainId: '47', courseId: '300' },
    now,
  );
  const draft = draftFromSession(
    session,
    { mountainId: '47', courseId: '300', mountainName: 'Test', courseName: 'Course' },
    806,
    crypto.randomUUID(),
  );
  writeRecovery(draft, 'create', disk as Storage);
  clearWithdrawnAccountData(806, [() => disk]);
  assert.throws(() => writeRecovery(draft, 'update', disk as Storage), /탈퇴한 회원/);
  assert.equal(disk.getItem(accountStorageKeys(806)[1]), null);
});
test('cleanup is idempotent and a newly registered member ID has an independent namespace', () => {
  const disk = storage();
  clearWithdrawnAccountData(807, [() => disk]);
  clearWithdrawnAccountData(807, [() => disk]);
  assert.equal(isRetiredAccount(808), false);
  assert.ok(createMemberFavoritesStore(() => disk).toggle(808, '47', new Set(['47'])));
  assert.equal(disk.getItem(accountStorageKeys(807)[0]), null);
  assert.equal(disk.getItem(accountStorageKeys(808)[0]), '["47"]');
});
test('invalid cleanup identity never removes browser data', () => {
  let removes = 0;
  for (const id of [0, -1, NaN, 1.5])
    assert.throws(() =>
      clearWithdrawnAccountData(id, [
        () => ({
          removeItem() {
            removes++;
          },
        }),
      ]),
    );
  assert.equal(removes, 0);
});
