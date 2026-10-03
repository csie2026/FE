import { useState } from 'react';

export interface MonthlyGoals {
  distanceKm: number | null;
  hikeCount: number | null;
}

const STORAGE_KEY = 'topeak.monthlyGoals';
const isGoal = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 1000;

function readGoals(): MonthlyGoals {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const value: unknown = JSON.parse(stored);
      if (value && typeof value === 'object') {
        const goals = value as Record<string, unknown>;
        return {
          distanceKm: isGoal(goals.distanceKm) ? goals.distanceKm : null,
          hikeCount:
            isGoal(goals.hikeCount) && Number.isInteger(goals.hikeCount) ? goals.hikeCount : null,
        };
      }
    }
    // 새 목표 형식이 없으면 기존 거리 목표를 읽어 브라우저에 남아 있는 설정을 이어받는다.
    const legacyGoal = Number(localStorage.getItem('topeak.monthlyGoalKm'));
    return { distanceKm: isGoal(legacyGoal) ? legacyGoal : null, hikeCount: null };
  } catch {
    return { distanceKm: null, hikeCount: null };
  }
}

export function useMonthlyGoals() {
  const [goals, setGoals] = useState<MonthlyGoals>(readGoals);
  const [error, setError] = useState('');

  function saveGoals(next: MonthlyGoals) {
    if (
      (next.distanceKm !== null && !isGoal(next.distanceKm)) ||
      (next.hikeCount !== null && (!isGoal(next.hikeCount) || !Number.isInteger(next.hikeCount)))
    ) {
      setError('목표는 1~1,000 사이로 입력해 주세요. 산행 횟수는 정수로 입력해 주세요.');
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setGoals(next);
      setError('');
      return true;
    } catch {
      setError('목표를 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
      return false;
    }
  }
  return { goals, saveGoals, error };
}
