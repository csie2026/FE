import type { HikingActivity } from '../api.ts';

export interface CompletedMountainSummary {
  mountainId: string;
  completedCount: number;
  latestStartedAt: string | null;
}

// 프로필 완등 통계와 완등한 산 목록은 동일한 completed=true 기록을 기준으로 묶는다.
// 같은 산을 다시 완등하면 횟수는 늘어나지만 목록에는 산 ID별로 한 항목만 표시한다.
export function summarizeCompletedHikes(activities: HikingActivity[]) {
  const completed = activities.filter(
    (activity) =>
      activity.completed === true &&
      Number.isSafeInteger(activity.mountainId) &&
      activity.mountainId > 0,
  );
  const mountains = new Map<string, CompletedMountainSummary>();
  for (const activity of completed) {
    const mountainId = String(activity.mountainId);
    const previous = mountains.get(mountainId);
    const validDate = Number.isFinite(Date.parse(activity.startedAt));
    const latestStartedAt =
      validDate &&
      (!previous?.latestStartedAt ||
        Date.parse(activity.startedAt) > Date.parse(previous.latestStartedAt))
        ? activity.startedAt
        : (previous?.latestStartedAt ?? null);
    mountains.set(mountainId, {
      mountainId,
      completedCount: (previous?.completedCount ?? 0) + 1,
      latestStartedAt,
    });
  }
  return { count: completed.length, mountainIds: new Set(mountains.keys()), mountains };
}

// 완등 날짜는 저장된 산행의 시작 시각을 한국 시간으로 표시한다. 일지 날짜나
// API에서 제공하지 않는 정상 도착 시각을 대신 사용하지 않는다.
export function completedHikeDate(startedAt: string | null) {
  if (startedAt === null || !Number.isFinite(Date.parse(startedAt))) return null;
  const korea = new Date(Date.parse(startedAt) + 9 * 60 * 60 * 1000);
  return `${korea.getUTCFullYear()}.${String(korea.getUTCMonth() + 1).padStart(2, '0')}.${String(korea.getUTCDate()).padStart(2, '0')}`;
}

// DB의 산 ID로만 정보를 연결한다. 누락된 메타데이터를 예제 산 정보나
// 산행에 남은 이전 텍스트, 구버전의 수동 localStorage 기록으로 채우지 않는다.
export function buildCompletedMountainCollection<T extends { id: string }>(
  catalog: T[],
  completions: ReadonlyMap<string, CompletedMountainSummary>,
) {
  const byId = new Map(catalog.map((mountain) => [mountain.id, mountain]));
  const items = [...byId.values()].flatMap((mountain) => {
    const completion = completions.get(mountain.id);
    return completion ? [{ ...mountain, completion }] : [];
  });
  const missingIds = [...completions.keys()].filter((id) => !byId.has(id));
  return { items, missingIds };
}
