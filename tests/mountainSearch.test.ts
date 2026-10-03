import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterMountains } from '../src/components/hiking/services/mountainSearch.ts';
import type { MountainOption } from '../src/components/hiking/services/courseApi.ts';

// Read the actual BE seed; no replacement mountain fixtures.
const sql = readFileSync(
  new URL('../../BE/src/main/resources/db/migration/V2__mountains.sql', import.meta.url),
  'utf8',
);
const mountains: MountainOption[] = [
  ...sql.matchAll(
    /^\((\d+), '([^']+)', '[^']+', '[^']+', '([^']+)', '[^']+', ([\d.]+), ([\d.]+), ([\d.]+),/gm,
  ),
].map(([, id, name, city, height, lat, lng]) => ({
  id: Number(id),
  name,
  city,
  height: Number(height),
  lat: Number(lat),
  lng: Number(lng),
  courseCount: 0,
}));

test('empty search and clearing search restore all 140 seeded mountains', () => {
  assert.equal(mountains.length, 140);
  assert.equal(filterMountains(mountains, '').length, 140);
  assert.equal(filterMountains(mountains, '  \t ').length, 140);
  assert.equal(filterMountains(mountains, '북한산').length, 1);
  assert.equal(filterMountains(mountains, '').length, 140);
});
test('exact, partial, whitespace and decomposed Korean searches use actual mountain names', () => {
  for (const query of ['북한산', '북한', '  북한산  ', '북 한 산', '북한산'.normalize('NFD')]) {
    assert.deepEqual(
      filterMountains(mountains, query).map((item) => item.name),
      ['북한산'],
    );
  }
});
test('city search finds both real Bucheon mountains and unknown queries return no results', () => {
  for (const query of ['부천', '부천시', ' 부천 시 ']) {
    const result = filterMountains(mountains, query);
    assert.deepEqual(result.map((item) => item.name).sort(), ['성주산', '원미산'].sort());
    assert.ok(result.every((item) => item.city === '부천시'));
  }
  assert.equal(filterMountains(mountains, '존재하지않는산이름').length, 0);
});
