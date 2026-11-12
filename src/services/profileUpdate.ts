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

export class ProfileSaveUnconfirmed extends Error {
  readonly outcome: 'saved' | 'unknown';
  constructor(outcome: 'saved' | 'unknown') {
    super(
      outcome === 'saved'
        ? '프로필 저장은 완료됐지만 현재 계정을 다시 확인하지 못했습니다. 저장 결과 확인을 눌러주세요.'
        : '저장 결과를 확인하지 못했습니다. 다시 저장하기 전에 저장 결과 확인을 눌러주세요.',
    );
    this.outcome = outcome;
  }
}

// 확인 재시도는 쓰기 요청 없이 현재 회원만 조회한다. 이전 PATCH 응답을 대신 반영하지 않는다.
export async function confirmProfileSave(
  expectedUserId: number,
  isCurrent: () => boolean,
  signal?: AbortSignal,
) {
  const check = () => {
    if (!isCurrent() || signal?.aborted)
      throw new DOMException('프로필 편집 화면이 변경되었습니다.', 'AbortError');
  };
  check();
  const member = await getCurrentMember(signal);
  check();
  requireOwner(member, expectedUserId);
  return member;
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
  let readyToSend = false;
  let updated: Member;
  try {
    updated = await api<Member>(
      '/api/users/me/profile',
      'PATCH',
      snapshot,
      signal,
      async (requestSignal) => {
        requireCurrent();
        requireOwner(await getCurrentMember(requestSignal), snapshot.expectedUserId);
        requireCurrent();
        readyToSend = true;
      },
    );
  } catch (cause) {
    requireCurrent();
    // 쓰기 직전까지 진행된 뒤 응답을 잃거나 서버 오류가 오면 저장 여부를 단정하지 않는다.
    if (
      readyToSend &&
      cause instanceof ApiError &&
      (cause.status === 0 || cause.status >= 500 || cause.code === 'invalid_response')
    )
      throw new ProfileSaveUnconfirmed('unknown');
    throw cause;
  }
  requireCurrent();
  requireOwner(updated, snapshot.expectedUserId);
  // 저장 응답을 기다리는 동안 쿠키 계정이 바뀐 경우 이전 회원 응답을 성공으로 반영하지 않는다.
  try {
    return await confirmProfileSave(snapshot.expectedUserId, isCurrent, signal);
  } catch (cause) {
    requireCurrent();
    if (
      isProfileAccountMismatch(cause) ||
      (cause instanceof ApiError && cause.status === 401) ||
      (cause instanceof DOMException && cause.name === 'AbortError')
    )
      throw cause;
    throw new ProfileSaveUnconfirmed('saved');
  }
}
