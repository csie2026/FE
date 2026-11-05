import type { HikingActivityInput } from '../../../api.ts';

const positiveId = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
// The FE stores UTC ISO instants. Check the calendar as well as parseability (e.g. reject Feb 30).
const instant = (value: unknown) => {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  return (
    !!match &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`
  );
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hasValidGpsEvidence(input: HikingActivityInput): boolean {
  const e = input.gpsEvidence;
  return (
    !!e &&
    typeof e === 'object' &&
    typeof e.latitude === 'number' &&
    Number.isFinite(e.latitude) &&
    Math.abs(e.latitude) <= 90 &&
    typeof e.longitude === 'number' &&
    Number.isFinite(e.longitude) &&
    Math.abs(e.longitude) <= 180 &&
    typeof e.accuracyMeters === 'number' &&
    Number.isFinite(e.accuracyMeters) &&
    e.accuracyMeters >= 0 &&
    e.accuracyMeters <= 50 &&
    instant(e.recordedAt) &&
    Date.parse(e.recordedAt) >= Date.parse(input.startedAt) &&
    Date.parse(e.recordedAt) <= Date.parse(input.endedAt)
  );
}
// Local consistency guard only. An API caller can bypass FE validation; BE must validate independently.
// Zero distance/time and repeated hikes remain allowed: no new completion policy is added here.
export function isValidActivityInput(
  value: unknown,
  now = Date.now(),
): value is HikingActivityInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<HikingActivityInput>;
  if (
    !positiveId(input.mountainId) ||
    !(input.courseId === null || positiveId(input.courseId)) ||
    typeof input.clientRequestId !== 'string' ||
    !uuid.test(input.clientRequestId) ||
    typeof input.completed !== 'boolean' ||
    !instant(input.startedAt) ||
    !instant(input.endedAt) ||
    typeof input.distanceMeters !== 'number' ||
    !Number.isFinite(input.distanceMeters) ||
    input.distanceMeters < 0 ||
    typeof input.elapsedMs !== 'number' ||
    !Number.isSafeInteger(input.elapsedMs) ||
    input.elapsedMs < 0
  )
    return false;
  const start = Date.parse(input.startedAt!);
  const end = Date.parse(input.endedAt!);
  return (
    start <= end &&
    end <= now &&
    input.elapsedMs <= end - start &&
    (input.gpsEvidence === undefined || hasValidGpsEvidence(input as HikingActivityInput))
  );
}
