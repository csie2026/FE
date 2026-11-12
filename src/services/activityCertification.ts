import type { HikingActivity } from '../api.ts';

// 서버의 저장된 인증 결과만 사용한다. 누락된 구버전 결과를 FE에서 추정하지 않는다.
export const isCertifiedActivity = (activity: HikingActivity) =>
  activity.scoring?.status === 'CERTIFIED';
export const isCertifiedSummit = (activity: HikingActivity) =>
  isCertifiedActivity(activity) &&
  activity.completed === true &&
  activity.gpsValidationVersion === 1 &&
  activity.scoring?.summitPoints === 70;
