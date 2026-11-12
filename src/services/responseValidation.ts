// 현재 화면에서 사용하는 응답 DTO만 검증한다. 그 외 API 경로의 기존 처리는
// 유지하며, 이 검증이 서버 검증을 대신하지는 않는다.
type Check = (value: unknown) => boolean;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const text: Check = (v) => typeof v === 'string';
const number: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const integer: Check = (v) => typeof v === 'number' && Number.isSafeInteger(v);
const positiveId: Check = (v) => integer(v) && (v as number) > 0;
const nonnegative: Check = (v) => number(v) && (v as number) >= 0;
const bool: Check = (v) => typeof v === 'boolean';
const nullable =
  (check: Check): Check =>
  (v) =>
    v === null || check(v);
const optional =
  (check: Check): Check =>
  (v) =>
    v === undefined || check(v);
const array =
  (check: Check): Check =>
  (v) =>
    Array.isArray(v) && v.every(check);
const fields =
  (checks: Record<string, Check>): Check =>
  (v) =>
    object(v) && Object.entries(checks).every(([key, check]) => check(v[key]));
const oneOf =
  (...values: unknown[]): Check =>
  (v) =>
    values.includes(v);
const date: Check = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const instant: Check = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
  Number.isFinite(Date.parse(v));
const localTime: Check = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(v) &&
  Number.isFinite(Date.parse(v));
const profileFields = {
  userId: positiveId,
  nickname: nullable(text),
  profileImageUrl: nullable(text),
  score: nullable(nonnegative),
};
const profile = fields(profileFields);
const publicProfileDetails: Check = (value) =>
  fields({
    ...profileFields,
    totalHikeCount: (count) => integer(count) && nonnegative(count),
    completedHikeCount: (count) => integer(count) && nonnegative(count),
  })(value) &&
  object(value) &&
  (value.completedHikeCount as number) <= (value.totalHikeCount as number);
const member = fields({
  ...profileFields,
  backgroundImageUrl: nullable(text),
  birthYear: nullable(integer),
  age: nullable(integer),
  profileCompleted: bool,
  provider: optional(nullable(text)),
  email: optional(nullable(text)),
  joinedAt: optional(nullable(instant)),
});
const journal = fields({
  id: positiveId,
  userId: positiveId,
  nickname: nullable(text),
  mountainName: text,
  title: text,
  content: text,
  hikingDate: date,
  isPublic: bool,
  hikingRecordId: nullable(positiveId),
});
const scoring = fields({
  status: oneOf('CERTIFIED', 'GPS_REQUIRED', 'BELOW_MINIMUM', 'DAILY_LIMIT'),
  certificationDate: date,
  visitPoints: nonnegative,
  summitPoints: nonnegative,
  policyVersion: text,
});
const activity = fields({
  id: positiveId,
  mountainId: positiveId,
  mountainName: text,
  courseId: nullable(positiveId),
  startedAt: instant,
  endedAt: instant,
  hikingDate: date,
  distanceMeters: nonnegative,
  elapsedMs: (v) => integer(v) && nonnegative(v),
  completed: bool,
  journalId: nullable(positiveId),
  scoring: optional(nullable(scoring)),
  gpsValidationVersion: optional(nullable(integer)),
});
const ranked = fields({ ...profileFields, rank: positiveId });
const ranking = fields({
  members: array(ranked),
  mine: nullable(ranked),
  totalMembers: (v) => integer(v) && nonnegative(v),
});
const latitude: Check = (v) => number(v) && Math.abs(v as number) <= 90;
const longitude: Check = (v) => number(v) && Math.abs(v as number) <= 180;
const mountain = fields({
  id: positiveId,
  name: text,
  city: text,
  height: nonnegative,
  lat: latitude,
  lng: longitude,
  courseCount: (v) => integer(v) && nonnegative(v),
});
const course = fields({
  id: positiveId,
  mountainId: positiveId,
  name: text,
  startName: text,
  startLat: latitude,
  startLng: longitude,
  lengthKm: nonnegative,
  upMin: (v) => integer(v) && nonnegative(v),
  downMin: (v) => integer(v) && nonnegative(v),
  difficulty: oneOf('EASY', 'NORMAL', 'HARD'),
  risk: nullable(text),
  source: oneOf('FOREST', 'OSM'),
});
const courseDetail = fields({
  course,
  path: array((v) => Array.isArray(v) && v.length === 2 && longitude(v[0]) && latitude(v[1])),
});
const hour = fields({
  time: localTime,
  temperature: nullable(number),
  sky: nullable(integer),
  pty: nullable(integer),
  pop: nullable(integer),
  precipitationMm: number,
  snowCm: number,
  windSpeed: nullable(number),
  humidity: nullable(integer),
});
const weather = fields({
  mountainId: positiveId,
  mountainName: text,
  baseTime: localTime,
  source: nullable(text),
  days: nullable(
    array(
      fields({
        date,
        level: nullable(oneOf('GOOD', 'CAUTION', 'BAD')),
        message: nullable(text),
        notes: nullable(array(text)),
        hours: nullable(array(hour)),
      }),
    ),
  ),
});
export const monthlyGoalResponse = fields({
  userId: positiveId,
  month: (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v),
  distanceKm: nullable((v) => number(v) && (v as number) > 0),
  hikeCount: nullable(positiveId),
});

export function validApiResponse(path: string, method: string, value: unknown): boolean {
  if (method === 'DELETE') return true;
  if (
    path === '/api/users/me' ||
    path === '/api/users/me/profile' ||
    /^\/api\/users\/me\/images\/(profile|background)$/.test(path)
  )
    return member(value);
  if (/^\/api\/users\/\d+\/profile$/.test(path)) return publicProfileDetails(value);
  if (path === '/api/rankings/summary') return ranking(value);
  if (path === '/api/rankings') return array(profile)(value);
  if (path === '/api/journals') return method === 'GET' ? array(journal)(value) : journal(value);
  if (/^\/api\/journals\/\d+$/.test(path)) return journal(value);
  if (/^\/api\/users\/(me|\d+)\/journals$/.test(path)) return array(journal)(value);
  // POST 저장 성공 여부는 activitySave에서 확정된 원본 요청과 비교해 별도로 확인한다.
  if (path === '/api/users/me/hiking-records' && method === 'GET') return array(activity)(value);
  if (path === '/api/mountains') return array(mountain)(value);
  if (/^\/api\/mountains\/\d+\/courses$/.test(path)) return array(course)(value);
  if (/^\/api\/courses\/\d+$/.test(path)) return courseDetail(value);
  if (/^\/api\/mountains\/\d+\/weather$/.test(path)) return weather(value);
  if (/^\/api\/users\/me\/monthly-goals\/\d{4}-\d{2}$/.test(path))
    return monthlyGoalResponse(value);
  return true;
}
