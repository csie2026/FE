import type { HikingActivity, Journal, Member, MountainWeather } from '../src/api.ts';

export const memberResponse = (userId = 1, overrides: Partial<Member> = {}): Member => ({
  userId,
  nickname: 'Member',
  profileCompleted: true,
  birthYear: 2000,
  age: 27,
  profileImageUrl: null,
  backgroundImageUrl: null,
  score: 0,
  provider: 'google',
  email: null,
  joinedAt: null,
  ...overrides,
});
export const activityResponse = (overrides: Partial<HikingActivity> = {}): HikingActivity => ({
  id: 4,
  mountainId: 1,
  mountainName: 'Mountain',
  courseId: null,
  startedAt: '2026-01-01T01:00:00Z',
  endedAt: '2026-01-01T02:00:00Z',
  hikingDate: '2026-01-01',
  distanceMeters: 2000,
  elapsedMs: 3600000,
  completed: false,
  journalId: null,
  scoring: null,
  gpsValidationVersion: null,
  ...overrides,
});
export const journalResponse = (overrides: Partial<Journal> = {}): Journal => ({
  id: 9,
  userId: 1,
  nickname: 'Member',
  mountainName: 'Mountain',
  title: 'Trip',
  content: '',
  hikingDate: '2026-01-01',
  isPublic: false,
  hikingRecordId: 42,
  ...overrides,
});
export const weatherResponse = (
  mountainId = 1,
  days: MountainWeather['days'] = [],
): MountainWeather => ({
  mountainId,
  mountainName: 'Mountain',
  baseTime: '2026-11-10T06:00:00',
  days,
  source: null,
});
