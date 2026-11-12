import type { HikingActivity } from '../api.ts';

// 점수 인증 결과는 횟수 인정과 별개다. 저장된 점수 상태의 의미는 유지한다.
export const isCertifiedActivity = (activity: HikingActivity) =>
  activity.scoring?.status === 'CERTIFIED';

// 검증 버전 1에서는 completed가 서버의 GPS 정상 도달 판정 결과로 저장된다.
// 검증 버전이 없는 과거 완료 기록이나 점수 원장만으로 완등을 추정하지 않는다.
export const isVerifiedSummit = (activity: HikingActivity) =>
  activity.completed === true && activity.gpsValidationVersion === 1;

// 정상 저장된 거리·일시정지 제외 시간 또는 서버 검증 완등으로 활동마다 한 번 인정한다.
export const isRecognizedHike = (activity: HikingActivity) =>
  (Number.isFinite(activity.distanceMeters) &&
    activity.distanceMeters >= 500 &&
    Number.isFinite(activity.elapsedMs) &&
    activity.elapsedMs >= 20 * 60 * 1000) ||
  isVerifiedSummit(activity);
