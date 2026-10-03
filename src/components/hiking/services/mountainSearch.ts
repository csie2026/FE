import type { MountainOption } from './courseApi';

// 한글 조합 방식과 입력 공백 차이 때문에 동일한 산·시군 검색이 누락되지 않도록 정규화한다.
const normalize = (value: string) =>
  value.normalize('NFC').replace(/\s+/gu, '').toLocaleLowerCase();

export function filterMountains(mountains: MountainOption[], query: string): MountainOption[] {
  const search = normalize(query);
  if (!search) return mountains;
  return mountains.filter(
    (item) => normalize(item.name).includes(search) || normalize(item.city).includes(search),
  );
}
