// 브라우저와 네이티브 산행이 공유하는 GPS 표본 허용 기준이다.
export const GPS_FILTER = {
  maxAccuracyMeters: 50,
  minDistanceMeters: 5,
  maxSpeedMetersPerSecond: 8,
  maxSampleAgeMs: 15_000,
  maxGapMs: 30_000,
} as const;
// 정상 도달 판정 반경은 GPS 정확도 허용 범위와 별도의 정책 값으로 유지한다.
export const SUMMIT_RADIUS_METERS = 30;
