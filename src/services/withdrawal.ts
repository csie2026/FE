import { api, ApiError, getCurrentMember } from '../api.ts';

export async function withdrawAccount(userId: number, confirmation: string, signal?: AbortSignal) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || confirmation !== '탈퇴')
    throw new Error('탈퇴 확인 문구를 정확히 입력하십시오.');
  const result = await api<unknown>(
    '/api/users/me',
    'DELETE',
    { expectedUserId: userId, confirmation },
    signal,
    async (requestSignal) => {
      if ((await getCurrentMember(requestSignal)).userId !== userId)
        throw new ApiError(409, '로그인 계정이 변경되었습니다. 다시 확인하십시오.');
    },
  );
  // 계약에 명시된 빈 204 응답만 탈퇴 성공으로 확정하고 다른 2xx 응답은 결과 미확인으로 처리한다.
  if (result !== undefined)
    throw new Error('회원탈퇴 완료 응답을 확인하지 못했습니다. 로그인 상태를 확인하십시오.');
}
