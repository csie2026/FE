import { getCourse, getMountains, toHikingCourse } from './courseApi.ts';

export type HikingSelection = { mountainId: number; courseId: number };
const validId = (id: unknown): id is number =>
  typeof id === 'number' && Number.isSafeInteger(id) && id > 0;

export function readHikingSelection(value: unknown): HikingSelection | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<HikingSelection>;
  return validId(candidate.mountainId) && validId(candidate.courseId)
    ? { mountainId: candidate.mountainId, courseId: candidate.courseId }
    : null;
}

// History stores IDs only. Re-fetch current BE records instead of trusting cached names or geometry.
export async function loadHikingSelection(selection: HikingSelection, signal?: AbortSignal) {
  if (!readHikingSelection(selection))
    throw new Error('산과 등산로 ID가 올바르지 않습니다. 다시 선택해주세요.');
  const [mountains, detail] = await Promise.all([
    getMountains(signal),
    getCourse(selection.courseId, signal),
  ]);
  const mountain = mountains.find((mountain) => mountain.id === selection.mountainId);
  if (!mountain) throw new Error('선택한 산을 찾을 수 없습니다. 산 탐색에서 다시 선택해주세요.');
  if (detail.course.id !== selection.courseId)
    throw new Error('선택한 등산로와 조회된 등산로가 일치하지 않습니다.');
  return toHikingCourse(mountain, detail);
}
