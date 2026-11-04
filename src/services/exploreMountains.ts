import { regions, type Mountain, type Region } from '../data/exploreRegions.ts';
import type { MountainOption } from '../components/hiking/services/courseApi.ts';

// No representative course is invented: lengths and difficulties belong to individual courses.
export function toExploreMountain(item: MountainOption): Mountain {
  const region = regions.find((region) => region.cities.some((city) => city.name === item.city));
  return {
    id: String(item.id),
    name: item.name,
    city: item.city,
    region: region?.name ?? '기타 지역',
    height:
      typeof item.height === 'number' && Number.isFinite(item.height)
        ? `${item.height.toLocaleString('ko-KR', { maximumFractionDigits: 10 })}m`
        : '높이 미제공',
    distance: item.courseCount === 0 ? '등록 코스 없음' : '코스별 확인',
    lat: typeof item.lat === 'number' && Number.isFinite(item.lat) ? item.lat : null,
    lng: typeof item.lng === 'number' && Number.isFinite(item.lng) ? item.lng : null,
    courseCount: item.courseCount,
  };
}

export function groupExploreMountains(mountains: Mountain[]): Region[] {
  const grouped = regions.map((region) => ({
    ...region,
    cities: region.cities.map((city) => ({
      ...city,
      mountains: mountains.filter((mountain) => mountain.city === city.name),
    })),
  }));
  // Unknown cities remain discoverable rather than silently dropping BE records.
  const known = new Set(regions.flatMap((region) => region.cities.map((city) => city.name)));
  const unknown = [...new Set(mountains.map((mountain) => mountain.city))].filter(
    (city) => !known.has(city),
  );
  if (unknown.length)
    grouped.push({
      id: 'other',
      name: '기타 지역',
      cities: unknown.map((city) => ({
        id: city,
        name: city,
        mountains: mountains.filter((mountain) => mountain.city === city),
      })),
    });
  return grouped;
}

const normalize = (value: string) =>
  value.normalize('NFC').replace(/\s+/gu, '').toLocaleLowerCase();
export function matchesMountain(mountain: Mountain, query: string) {
  const search = normalize(query);
  return (
    !search ||
    normalize(mountain.name).includes(search) ||
    normalize(mountain.city).includes(search)
  );
}
