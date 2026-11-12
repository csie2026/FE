import { api, ApiError, getCurrentMember, type Member } from '../api.ts';

export type ProfileUpdate = { expectedUserId: number; nickname: string; birthYear: number };
export const PROFILE_ACCOUNT_CHANGED =
  '로그인 계정이 변경되었습니다. 현재 계정을 다시 확인해주세요.';
export const isProfileAccountMismatch = (cause: unknown): cause is ApiError =>
  cause instanceof ApiError && cause.status === 409 && cause.code === 'profile_account_mismatch';

function requireOwner(member: Member, expectedUserId: number) {
  if (member.userId !== expectedUserId)
    throw new ApiError(409, PROFILE_ACCOUNT_CHANGED, 'profile_account_mismatch');
}

export async function updateProfile(
  input: ProfileUpdate,
  isCurrent: () => boolean,
  signal?: AbortSignal,
) {
  // await 중 편집값·회원이 바뀌어도 저장 시작 시점의 대상과 입력을 유지한다.
  const snapshot = { ...input };
  if (!Number.isSafeInteger(snapshot.expectedUserId) || snapshot.expectedUserId <= 0)
    throw new Error('프로필을 수정할 회원을 확인해주세요.');
  const requireCurrent = () => {
    if (!isCurrent() || signal?.aborted)
      throw new DOMException('프로필 편집 화면이 변경되었습니다.', 'AbortError');
  };
  requireCurrent();
  const updated = await api<Member>(
    '/api/users/me/profile',
    'PATCH',
    snapshot,
    signal,
    async (requestSignal) => {
      requireCurrent();
      requireOwner(await getCurrentMember(requestSignal), snapshot.expectedUserId);
      requireCurrent();
    },
  );
  requireCurrent();
  requireOwner(updated, snapshot.expectedUserId);
  // 저장 응답을 기다리는 동안 쿠키 계정이 바뀐 경우 이전 회원 응답을 성공으로 반영하지 않는다.
  requireOwner(await getCurrentMember(signal), snapshot.expectedUserId);
  requireCurrent();
  return updated;
}
