import { validateStartPosition } from './startValidation.ts';
import type { Coordinate, GpsPoint, LocationStatus } from '../types.ts';

// 버튼 표시용 사전 확인이며 클릭 후 새 GPS를 요청하는 시작 검증을 대체하지 않는다.
export function startAvailability(
  start: Coordinate,
  point: GpsPoint | null,
  status: LocationStatus,
  now = Date.now(),
): { allowed: boolean; message: string } {
  if (status !== 'AVAILABLE' || !point)
    return {
      allowed: false,
      message: '출발점 50m 이내인지 확인할 수 있도록 현재 위치를 확인해주세요.',
    };
  try {
    validateStartPosition(start, point, point.timestamp, now);
    return { allowed: true, message: '출발점 50m 이내입니다. 등산을 시작할 수 있습니다.' };
  } catch (cause) {
    return { allowed: false, message: (cause as Error).message };
  }
}
