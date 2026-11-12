import type { HikingActivity } from '../api.ts';
import { isCertifiedSummit } from './activityCertification.ts';

export interface CompletedMountainSummary {
  mountainId: string;
  completedCount: number;
  latestStartedAt: string | null;
}

// The profile totals and collection share the same server-certified summit grouping.
// A repeated summit increases the activity count, while each mountain ID has one entry.
export function summarizeCompletedHikes(activities: HikingActivity[]) {
  const completed = activities.filter(
    (activity) =>
      isCertifiedSummit(activity) &&
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

// Display the saved completed hike's START date in KST, not a journal date or a
// fabricated summit-arrival timestamp (the API does not expose that timestamp).
export function completedHikeDate(startedAt: string | null) {
  if (startedAt === null || !Number.isFinite(Date.parse(startedAt))) return null;
  const korea = new Date(Date.parse(startedAt) + 9 * 60 * 60 * 1000);
  return `${korea.getUTCFullYear()}.${String(korea.getUTCMonth() + 1).padStart(2, '0')}.${String(korea.getUTCDate()).padStart(2, '0')}`;
}

// Join by DB ID only. Never replace missing DB metadata with a sample mountain,
// an activity's old text, or a legacy manual localStorage entry.
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
