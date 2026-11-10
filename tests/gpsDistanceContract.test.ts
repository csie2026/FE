import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackDistance } from '../src/components/hiking/trackUtils.ts';
import { activityInput, initialSession, draftFromSession, sessionFromDraft } from '../src/components/hiking/services/sessionRecovery.ts';
import type { GpsPoint } from '../src/components/hiking/types.ts';

test('10,000 unrounded coordinates share the backend golden Haversine distance', () => {
  const points = Array.from({ length: 10000 }, (_, i) => ({
    lat: 37 + i * 0.00001, lng: 127 + (i % 2) * 0.00001,
    timestamp: 1577836800000 + i * 1000, accuracy: 5,
  })) as GpsPoint[];
  assert.ok(Math.abs(trackDistance([[], points]) - 14225.35696292904) < 0.000001);
});

test('transmission and compact recovery preserve exactly the coordinates used for distance, without connecting gaps', () => {
  const startedAt = 1577836800000;
  const point = (lat: number, lng: number, seconds: number) => ({
    lat, lng, timestamp: startedAt + seconds * 1000, accuracy: 5, altitude: null, speed: null,
  }) as GpsPoint;
  const segments = [[point(37,127,1),point(37.01,127,10)], [], [point(38,128,1000),point(38.01,128,1010)]];
  const session = { ...initialSession(), state: 'COMPLETED' as const, startedAt,
    endedAt: startedAt + 1200000, accumulatedMs: 1100000,
    clientRequestId: '6c6d4570-7615-4124-a698-4eca1e634919', segments };
  const course = { mountainId: '1', courseId: '2', mountainName: '산', courseName: '코스' };
  const input = activityInput(session, course);
  assert.equal(input.distanceMeters, trackDistance(segments));
  assert.deepEqual(input.gpsSegments?.map(s => s.map(p => [p.lat,p.lng])), segments.map(s => s.map(p => [p.lat,p.lng])));
  const restored = sessionFromDraft(draftFromSession(session,course,1,'owner',session.endedAt));
  assert.deepEqual(activityInput(restored,course),input);
  assert.equal(input.elapsedMs,1100000);
});
