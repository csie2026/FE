import type { HikingActivity } from '../api.ts';

// A repeat summit is another completed activity, while the mountain collection is unique.
export function summarizeCompletedHikes(activities: HikingActivity[]) {
  const completed = activities.filter(
    (activity) =>
      activity.completed === true &&
      Number.isSafeInteger(activity.mountainId) &&
      activity.mountainId > 0,
  );
  return {
    count: completed.length,
    mountainIds: new Set(completed.map((activity) => String(activity.mountainId))),
  };
}
