export const GPS_FILTER = {
  maxAccuracyMeters: 50,
  minDistanceMeters: 5,
  maxSpeedMetersPerSecond: 8,
  maxSampleAgeMs: 15_000,
  maxGapMs: 30_000,
} as const;
export const SUMMIT_RADIUS_METERS = 50;
