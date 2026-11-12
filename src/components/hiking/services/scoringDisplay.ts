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
      return '기록 저장 완료 · 500m·일시정지 제외 20분 또는 GPS 정상 도달 조건 미충족으로 산행 점수 미지급';
    case 'DAILY_LIMIT':
      return '기록 저장 완료 · 이전 정책의 일일 인증 제한이 적용된 기록입니다';
    default:
      return '인증·점수 산정 결과를 확인하지 못했습니다.';
  }
}
