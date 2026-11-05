import type { ActivityScoring } from '../../../api.ts';

// Display the server result. FE never awards visit or journal points.
export function scoringText(scoring?: ActivityScoring | null): string {
  if (!scoring) return '인증·점수 산정 결과를 확인하지 못했습니다.';
  switch (scoring.status) {
    case 'CERTIFIED':
      return `산행 인증 · 방문 ${scoring.visitPoints}점 · 완등 ${scoring.summitPoints}점`;
    case 'GPS_REQUIRED':
      return '기록 저장 완료 · 유효 GPS 근거가 없어 산행 점수 미지급';
    case 'BELOW_MINIMUM':
      return '기록 저장 완료 · 500m·휴식 제외 20분 조건 미충족으로 산행 점수 미지급';
    case 'DAILY_LIMIT':
      return '기록 저장 완료 · 해당 날짜의 인증 산행이 있어 산행 점수 미지급';
    default:
      return '인증·점수 산정 결과를 확인하지 못했습니다.';
  }
}
