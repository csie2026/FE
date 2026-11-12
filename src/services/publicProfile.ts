import { api, ApiError, type Journal, type PublicProfileDetails } from '../api.ts';

export async function getPublicProfileSummary(userId: number, signal?: AbortSignal) {
  if (!Number.isSafeInteger(userId) || userId <= 0)
    throw new ApiError(400, '사용자를 확인할 수 없습니다.');
  const profile = await api<PublicProfileDetails>(
    `/api/users/${userId}/profile`,
    'GET',
    undefined,
    signal,
  );
  if (profile.userId !== userId)
    throw new ApiError(200, '공개 프로필 정보를 확인하지 못했습니다.', 'invalid_response');
  return profile;
}

export async function getPublicProfileView(userId: number, signal?: AbortSignal) {
  if (!Number.isSafeInteger(userId) || userId <= 0)
    throw new ApiError(400, '사용자를 확인할 수 없습니다.');
  const [profile, journals] = await Promise.all([
    getPublicProfileSummary(userId, signal),
    api<Journal[]>(`/api/users/${userId}/journals`, 'GET', undefined, signal),
  ]);
  // 대상 회원과 공개 여부까지 확인한 두 응답을 함께 반영한다.
  if (journals.some((journal) => journal.userId !== userId || !journal.isPublic))
    throw new ApiError(200, '공개 프로필 정보를 확인하지 못했습니다.', 'invalid_response');
  return { profile, journals };
}
