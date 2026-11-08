import { api, ApiError, getCurrentMember } from '../api.ts';

export async function withdrawAccount(userId: number, confirmation: string, signal?: AbortSignal) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || confirmation !== '탈퇴')
    throw new Error('탈퇴 확인 문구를 정확히 입력하십시오.');
  const result = await api<unknown>(
    '/api/users/me',
    'DELETE',
    { expectedUserId: userId, confirmation },
    signal,
    async () => {
      if ((await getCurrentMember(signal)).userId !== userId)
        throw new ApiError(409, '로그인 계정이 변경되었습니다. 다시 확인하십시오.');
    },
  );
  // Only the documented empty 204 confirms deletion. A mismatched 2xx is an unknown outcome.
  if (result !== undefined)
    throw new Error('회원탈퇴 완료 응답을 확인하지 못했습니다. 로그인 상태를 확인하십시오.');
}
