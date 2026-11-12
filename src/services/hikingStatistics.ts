import type { HikingActivity } from '../api.ts';
import { summarizeCompletedHikes } from './completedHikes.ts';
import { isCertifiedActivity } from './activityCertification.ts';

const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000;

// All devices use the same month, independently of their own locale/time zone.
export function koreanMonthBounds(now: number = Date.now()) {
  if (!Number.isFinite(now)) throw new Error('통계 기준 시각을 확인할 수 없습니다.');
  const korea = new Date(now + KOREA_OFFSET_MS);
  const year = korea.getUTCFullYear();
  const month = korea.getUTCMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    start: Date.UTC(year, month, 1) - KOREA_OFFSET_MS,
    end: Date.UTC(year, month + 1, 1) - KOREA_OFFSET_MS,
  };
}

export interface HikingStatistics {
  month: string;
  totalHikeCount: number;
  monthlyHikeCount: number;
  totalDistanceMeters: number;
  monthlyDistanceMeters: number;
  completedHikeCount: number;
  completedMountainCount: number;
}

export function summarizeHikingActivities(activities: HikingActivity[], now = Date.now()) {
  const month = koreanMonthBounds(now);
  let totalDistanceMeters = 0;
  let monthlyDistanceMeters = 0;
  let monthlyHikeCount = 0;
  for (const activity of activities) {
    const startedAt = Date.parse(activity.startedAt);
    if (
      !Number.isSafeInteger(activity.id) ||
      activity.id <= 0 ||
      !Number.isSafeInteger(activity.mountainId) ||
      activity.mountainId <= 0 ||
      !Number.isFinite(startedAt) ||
      typeof activity.completed !== 'boolean' ||
      typeof activity.distanceMeters !== 'number' ||
      !Number.isFinite(activity.distanceMeters) ||
      activity.distanceMeters < 0
    ) {
      throw new Error('산행 통계에 필요한 기록을 확인할 수 없습니다. 다시 시도해주세요.');
    }
    totalDistanceMeters += activity.distanceMeters;
    if (startedAt >= month.start && startedAt < month.end) {
      if (isCertifiedActivity(activity)) monthlyHikeCount++;
      monthlyDistanceMeters += activity.distanceMeters;
    }
  }
  if (!Number.isFinite(totalDistanceMeters))
    throw new Error('산행 거리 합계를 확인할 수 없습니다.');
  const completed = summarizeCompletedHikes(activities);
  const statistics: HikingStatistics = {
    month: month.key,
    totalHikeCount: activities.filter(isCertifiedActivity).length,
    monthlyHikeCount,
    totalDistanceMeters,
    monthlyDistanceMeters,
    completedHikeCount: completed.count,
    completedMountainCount: completed.mountainIds.size,
  };
  return {
    statistics,
    mountainIds: completed.mountainIds,
    completedMountains: completed.mountains,
  };
}

// Sum the original meters first; round only the final displayed km (up to 2 decimals).
export function distanceKmText(meters: number) {
  return (meters / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}
