import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemberFavoritesStore,
  EMPTY_FAVORITES,
  memberFavoritesKey,
  parseFavoriteIds,
  type FavoriteStorage,
} from '../src/services/memberFavorites.ts';
const known = new Set(['1', '2', '3']);
function fixture() {
  const values = new Map<string, string>();
  const reads: string[] = [];
  let failRead = false,
    failWrite = false;
  const storage: FavoriteStorage = {
    getItem(key) {
      reads.push(key);
      if (failRead) throw new Error('denied');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (failWrite) throw new Error('full');
      values.set(key, value);
    },
  };
  return {
    values,
    reads,
    storage,
    store: createMemberFavoritesStore(() => storage),
    blockRead: (value: boolean) => {
      failRead = value;
    },
    blockWrite: (value: boolean) => {
      failWrite = value;
    },
  };
}

test('member keys are disjoint and anonymous/invalid users cannot read or write favorites', () => {
  const f = fixture();
  assert.notEqual(memberFavoritesKey(1), memberFavoritesKey(2));
  for (const user of [null, 0, -1, 1.5, NaN, Infinity]) {
    assert.equal(memberFavoritesKey(user), null);
    assert.equal(f.store.snapshot(user), EMPTY_FAVORITES);
    assert.equal(f.store.toggle(user, '1', known), false);
  }
  assert.deepEqual(f.reads, []);
  assert.equal(f.values.size, 0);
});

test('shared legacy list has no automatic owner and is never read or imported', () => {
  const f = fixture();
  f.values.set('topeak.favoriteMountainIds', '["1","2"]');
  assert.deepEqual(f.store.snapshot(1).ids, []);
  assert.deepEqual(f.store.snapshot(2).ids, []);
  assert.ok(!f.reads.includes('topeak.favoriteMountainIds'));
  assert.equal(f.values.get('topeak.favoriteMountainIds'), '["1","2"]');
});

test('A/B logout and relogin retain only the correct members persisted list', () => {
  const f = fixture();
  f.store.toggle(1, '1', known);
  f.store.toggle(2, '2', known);
  assert.deepEqual(f.store.snapshot(1).ids, ['1']);
  assert.deepEqual(f.store.snapshot(null).ids, []);
  assert.deepEqual(f.store.snapshot(2).ids, ['2']);
  f.store.toggle(2, '2', known);
  assert.deepEqual(f.store.snapshot(2).ids, []);
  assert.deepEqual(f.store.snapshot(1).ids, ['1']);
  const reload = createMemberFavoritesStore(() => f.storage);
  assert.deepEqual(reload.snapshot(1).ids, ['1']);
  assert.deepEqual(reload.snapshot(2).ids, []);
});

test('canonical BE IDs and catalog membership are required; duplicates and sample IDs are ignored', () => {
  const f = fixture();
  assert.deepEqual(
    parseFavoriteIds('["1","1","2","sample-3","01",0,3,"-1","1.5","9007199254740992"]'),
    ['1', '2'],
  );
  for (const id of ['sample-1', '01', '-1', '1.5', '999'])
    assert.equal(f.store.toggle(1, id, known), false);
  assert.equal(f.values.size, 0);
  assert.equal(f.store.toggle(1, '1', known), true);
  f.values.set(memberFavoritesKey(1)!, '["1","999"]');
  f.store.externalChange(memberFavoritesKey(1));
  f.store.toggle(1, '2', known);
  assert.deepEqual(JSON.parse(f.values.get(memberFavoritesKey(1)!)!), ['1', '2']);
});

test('rapid toggles use the latest member state and same-tab subscribers stay in sync', () => {
  const f = fixture();
  let calls = 0;
  const unsubscribe = f.store.subscribe(() => calls++);
  f.store.toggle(1, '1', known);
  f.store.toggle(1, '2', known);
  f.store.toggle(1, '1', known);
  assert.deepEqual(f.store.snapshot(1).ids, ['2']);
  assert.equal(calls, 3);
  assert.equal(f.store.snapshot(1), f.store.snapshot(1));
  unsubscribe();
  f.store.toggle(1, '3', known);
  assert.equal(calls, 3);
});

test('quota failures keep temporary favorites in the same member only and recover on a successful write', () => {
  const f = fixture();
  f.blockWrite(true);
  f.store.toggle(1, '1', known);
  f.store.toggle(1, '2', known);
  assert.deepEqual(f.store.snapshot(1).ids, ['1', '2']);
  assert.ok(f.store.snapshot(1).error);
  assert.deepEqual(f.store.snapshot(2).ids, []);
  assert.deepEqual(f.store.snapshot(null).ids, []);
  assert.equal(f.values.size, 0);
  f.blockWrite(false);
  f.store.toggle(1, '3', known);
  assert.equal(f.store.snapshot(1).error, '');
  assert.deepEqual(JSON.parse(f.values.get(memberFavoritesKey(1)!)!), ['1', '2', '3']);
});

test('other-tab storage events refresh only scoped data and never import shared legacy data', () => {
  const f = fixture();
  f.store.toggle(1, '1', known);
  f.store.toggle(2, '2', known);
  let calls = 0;
  f.store.subscribe(() => calls++);
  f.values.set(memberFavoritesKey(1)!, '["3"]');
  f.store.externalChange(memberFavoritesKey(1));
  assert.deepEqual(f.store.snapshot(1).ids, ['3']);
  assert.deepEqual(f.store.snapshot(2).ids, ['2']);
  const before = calls;
  f.store.externalChange('topeak.favoriteMountainIds');
  assert.equal(calls, before);
  f.values.clear();
  f.store.externalChange(null);
  assert.deepEqual(f.store.snapshot(1).ids, []);
  assert.deepEqual(f.store.snapshot(2).ids, []);
});

test('blocked or corrupt storage reports an error with stable account-specific snapshots', () => {
  const f = fixture();
  f.blockRead(true);
  const a = f.store.snapshot(1);
  assert.ok(a.error);
  assert.equal(a, f.store.snapshot(1));
  assert.deepEqual(f.store.snapshot(2).ids, []);
  f.blockRead(false);
  f.values.set(memberFavoritesKey(1)!, 'broken json');
  f.store.externalChange(memberFavoritesKey(1));
  const corrupt = f.store.snapshot(1);
  assert.deepEqual(corrupt.ids, []);
  assert.ok(corrupt.error);
  assert.equal(corrupt, f.store.snapshot(1));
  assert.deepEqual(f.store.snapshot(2).ids, []);
  f.store.toggle(1, '1', known);
  assert.equal(f.store.snapshot(1).error, '');
});
