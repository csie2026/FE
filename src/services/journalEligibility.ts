import type { HikingActivity } from '../api.ts';
import { isRecognizedHike } from './activityCertification.ts';

export const JOURNAL_ELIGIBILITY_MESSAGE =
  '등산일지는 이동 거리 500m와 일시정지 제외 활동 시간 20분을 모두 충족하거나, 서버에서 완등을 검증한 산행에 작성할 수 있습니다.';

export function canCreateHikingJournal(activity: HikingActivity | null | undefined): boolean {
  // 이미 일지가 연결된 산행은 조건을 충족해도 새 일지 작성 후보에서 제외한다.
  return !!activity && activity.journalId === null && isRecognizedHike(activity);
}
