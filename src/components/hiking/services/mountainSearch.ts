import type { MountainOption } from './courseApi';

const normalize = (value: string) => value.normalize('NFC').replace(/\s+/gu, '').toLocaleLowerCase();

export function filterMountains(mountains: MountainOption[], query: string): MountainOption[] {
  const search = normalize(query);
  if (!search) return mountains;
  return mountains.filter(item => normalize(item.name).includes(search) || normalize(item.city).includes(search));
}
