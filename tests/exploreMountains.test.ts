import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { regions } from '../src/data/exploreRegions.ts';
import {
  groupExploreMountains,
  matchesMountain,
  toExploreMountain,
} from '../src/services/exploreMountains.ts';
import {
  getMountains,
  getCourses,
  type MountainOption,
} from '../src/components/hiking/services/courseApi.ts';

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

test('all 140 BE mountains appear once under the existing four regions and 31 cities', () => {
  assert.equal(mountains.length, 140);
  assert.equal(regions.flatMap((region) => region.cities).length, 31);
  assert.ok(regions.every((region) => region.cities.every((city) => !city.mountains.length)));
  const grouped = groupExploreMountains(mountains.map(toExploreMountain));
  assert.equal(grouped.length, 4);
  const displayed = grouped.flatMap((region) => region.cities.flatMap((city) => city.mountains));
  assert.equal(displayed.length, 140);
  assert.equal(new Set(displayed.map((item) => item.id)).size, 140);
  for (const source of mountains) {
    const actual = displayed.find((item) => item.id === String(source.id))!;
    assert.equal(actual.name, source.name);
    assert.equal(actual.city, source.city);
    assert.equal(actual.lat, source.lat);
    assert.equal(actual.lng, source.lng);
    assert.equal(
      actual.height,
      `${source.height.toLocaleString('ko-KR', { maximumFractionDigits: 10 })}m`,
    );
  }
});

test('course-specific values are not invented and missing height is not replaced with a number', () => {
  const mountain = toExploreMountain({ ...mountains[0], courseCount: 3 });
  assert.equal(mountain.distance, '코스별 확인');
  assert.ok(!('difficulty' in mountain));
  assert.equal(toExploreMountain(mountains[0]).distance, '등록 코스 없음');
  assert.equal(toExploreMountain({ ...mountains[0], height: Number.NaN }).height, '높이 미제공');
  assert.equal(toExploreMountain({ ...mountains[0], height: 0 }).height, '0m');
});

test('search and favorites share GPS DB IDs without conflating legacy sample IDs', () => {
  const catalog = mountains.map(toExploreMountain);
  const bucheon = catalog.filter((item) => matchesMountain(item, ' 부천 시 '));
  assert.deepEqual(bucheon.map((item) => item.name).sort(), ['성주산', '원미산'].sort());
  const ids = [bucheon[0].id, '부천시-0', 'featured:천안산'];
  assert.deepEqual(
    catalog.filter((item) => ids.includes(item.id)),
    [bucheon[0]],
  );
  assert.equal(catalog.filter((item) => matchesMountain(item, '')).length, 140);
  assert.equal(catalog.filter((item) => matchesMountain(item, '존재하지않는산')).length, 0);
  assert.equal(
    catalog.filter((item) => matchesMountain(item, '북한산'.normalize('NFD'))).length,
    1,
  );
});

test('empty and unexpected-city responses do not inject samples or lose actual records', () => {
  assert.ok(
    groupExploreMountains([]).every((region) =>
      region.cities.every((city) => !city.mountains.length),
    ),
  );
  const changedCity = toExploreMountain({ ...mountains[0], city: '추가된시군' });
  const grouped = groupExploreMountains([changedCity]);
  assert.deepEqual(grouped.find((region) => region.id === 'other')?.cities[0].mountains, [
    changedCity,
  ]);
});

test('explore reads the same authenticated API as GPS and forwards cancellation and failures', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    paths.push(String(input));
    assert.equal(init?.credentials, 'include');
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init.signal.aborted, false);
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    assert.deepEqual(await getMountains(controller.signal), []);
    assert.deepEqual(await getCourses(47, controller.signal), []);
    assert.deepEqual(paths, ['/api/mountains', '/api/mountains/47/courses']);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: '조회 실패' }), { status: 500 });
    await assert.rejects(getMountains(), (error: { status: number }) => error.status === 500);
    let pendingSignal: AbortSignal | null | undefined;
    globalThis.fetch = async (_path, init) => {
      assert.equal(init?.credentials, 'include');
      pendingSignal = init?.signal;
      return new Promise(() => {});
    };
    const pending = getMountains(controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(pendingSignal?.aborted, true);
  } finally {
    globalThis.fetch = original;
  }
});
