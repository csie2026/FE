import { api, ApiError, getCurrentMember } from '../api.ts';
export interface MonthlyGoals {
  distanceKm: number | null;
  hikeCount: number | null;
}
export interface MonthlyGoalResponse extends MonthlyGoals {
  userId: number;
  month: string;
}
export const EMPTY_GOALS: MonthlyGoals = { distanceKm: null, hikeCount: null };
export function validGoalMonth(value: string) {
  return /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900;
}
export function validGoals(goals: MonthlyGoals) {
  return (
    (goals.distanceKm === null ||
      (typeof goals.distanceKm === 'number' &&
        Number.isFinite(goals.distanceKm) &&
        goals.distanceKm >= 1 &&
        goals.distanceKm <= 1000 &&
        Math.abs(goals.distanceKm * 1000 - Math.round(goals.distanceKm * 1000)) < 1e-7)) &&
    (goals.hikeCount === null ||
      (Number.isInteger(goals.hikeCount) && goals.hikeCount >= 1 && goals.hikeCount <= 1000))
  );
}
function checked(data: MonthlyGoalResponse, userId: number, month: string) {
  if (data?.userId !== userId)
    throw new ApiError(401, '로그인한 회원이 변경되었습니다. 다시 로그인해주세요.');
  if (
    data.month !== month ||
    !('distanceKm' in data) ||
    !('hikeCount' in data) ||
    !(
      data.distanceKm === null ||
      (typeof data.distanceKm === 'number' &&
        Number.isFinite(data.distanceKm) &&
        data.distanceKm > 0)
    ) ||
    !(
      data.hikeCount === null ||
      (typeof data.hikeCount === 'number' && Number.isInteger(data.hikeCount) && data.hikeCount > 0)
    )
  )
    throw new Error('서버의 월별 목표 응답을 확인하지 못했습니다. 다시 조회해주세요.');
  return data;
}
export async function getMonthlyGoals(userId: number, month: string, signal?: AbortSignal) {
  if (!validGoalMonth(month)) throw new Error('목표 월을 확인해주세요.');
  return checked(
    await api<MonthlyGoalResponse>(
      `/api/users/me/monthly-goals/${month}`,
      'GET',
      undefined,
      signal,
    ),
    userId,
    month,
  );
}
export async function putMonthlyGoals(
  userId: number,
  month: string,
  goals: MonthlyGoals,
  signal?: AbortSignal,
) {
  if (!validGoalMonth(month) || !validGoals(goals))
    throw new Error(
      '목표는 1~1,000 사이이며 거리는 소수점 세 자리까지, 산행 횟수는 정수로 입력해주세요.',
    );
  return checked(
    await api<MonthlyGoalResponse>(
      `/api/users/me/monthly-goals/${month}`,
      'PUT',
      goals,
      signal,
      async () => {
        const member = await getCurrentMember(signal);
        if (member.userId !== userId)
          throw new ApiError(401, '로그인한 회원이 변경되었습니다. 다시 로그인해주세요.');
      },
    ),
    userId,
    month,
  );
}

// A rounded percentage must not announce success before the actual target is reached.
export function goalProgress(actual: number | null, target: number | null) {
  if (
    actual === null ||
    target === null ||
    !Number.isFinite(actual) ||
    !Number.isFinite(target) ||
    actual < 0 ||
    target <= 0
  )
    return null;
  return actual >= target ? 100 : Math.min(99, Math.round((actual / target) * 100));
}
