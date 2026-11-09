import { GPS_FILTER } from '../config.ts';
import type { HikingState } from '../types.ts';

export type GpsReception = 'waiting' | 'receiving' | 'stale';

// Successful watch callbacks refresh reception even when movement filters reject the point.
export function gpsReception(
  watchStartedAt: number | null,
  lastReceivedAt: number | null,
  now: number,
): GpsReception {
  const reference = lastReceivedAt ?? watchStartedAt;
  if (reference !== null && now - reference >= GPS_FILTER.maxSampleAgeMs) return 'stale';
  return lastReceivedAt === null ? 'waiting' : 'receiving';
}

export function gpsReceptionWarning(state: HikingState, reception: GpsReception): string | null {
  if (state !== 'TRACKING') return null;
  if (reception === 'stale')
    return '15초 이상 새 GPS 위치를 받지 못해 새 GPS 경로가 기록되지 않고 있습니다. 기기 위치 서비스와 브라우저 위치 권한을 확인하고, 탁 트인 곳에서 위치 다시 확인을 눌러주세요. 활동 시간은 계속 계산됩니다.';
  if (reception === 'waiting')
    return '첫 GPS 위치를 기다리고 있습니다. 위치가 수신되기 전에는 새 GPS 경로가 기록되지 않습니다.';
  return null;
}
