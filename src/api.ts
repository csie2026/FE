export interface PublicProfile {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  score: number | null;
}
export interface RankingMember {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  score: number;
}

export const getRankings = () => api<RankingMember[]>('/api/rankings');
export interface Member extends PublicProfile {
  backgroundImageUrl: string | null;
  birthYear: number | null;
  age: number | null;
  profileCompleted: boolean;
}
export interface Journal {
  id: number;
  userId: number;
  nickname: string;
  mountainName: string;
  title: string;
  content: string;
  hikingDate: string;
  isPublic: boolean;
}
export type JournalInput = Pick<
  Journal,
  'mountainName' | 'title' | 'content' | 'hikingDate' | 'isPublic'
>;
export const deleteJournal = (id: number) => api<void>(`/api/journals/${id}`, 'DELETE');
export const getJournal = (id: number) => api<Journal>(`/api/journals/${id}`);
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
// 세션 쿠키와 서버 오류 상태를 모든 도메인 요청에서 일관되게 다루는 공통 진입점이다.
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {};
  const multipart = body instanceof FormData;
  // 변경 요청은 현재 세션의 CSRF 토큰과 헤더 이름을 서버에서 받아 사용한다.
  // FormData는 브라우저가 multipart 경계를 지정해야 하므로 Content-Type을 직접 설정하지 않는다.
  if (method !== 'GET') {
    const csrfResponse = await fetch('/api/csrf', {
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    if (!csrfResponse.ok)
      throw new ApiError(csrfResponse.status, '인증 정보를 확인할 수 없습니다.');
    const csrf = (await csrfResponse.json()) as { headerName: string; token: string };
    headers[csrf.headerName] = csrf.token;
    if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    cache: 'no-store',
    signal,
    body: multipart ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(response.status, error.message ?? '요청을 처리할 수 없습니다.');
  }
  // 삭제·로그아웃의 빈 응답을 JSON으로 읽지 않아 정상 처리 후 파싱 오류가 발생하지 않게 한다.
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export type MemberImageKind = 'profile' | 'background';
export const getCurrentMember = (signal?: AbortSignal) =>
  api<Member>('/api/users/me', 'GET', undefined, signal);
export function uploadMemberImage(kind: MemberImageKind, file: File, signal?: AbortSignal) {
  const body = new FormData();
  body.append('file', file);
  return api<Member>(`/api/users/me/images/${kind}`, 'PUT', body, signal);
}
// 삭제 응답에는 회원 정보가 없으므로 다시 조회해 기본 프로필 이미지로의 복귀까지 반영한다.
export async function deleteMemberImage(kind: MemberImageKind, signal?: AbortSignal) {
  await api<void>(`/api/users/me/images/${kind}`, 'DELETE', undefined, signal);
  return getCurrentMember(signal);
}
export const scoreText = (score: number | null) =>
  score === null ? '점수 미산정' : `${score.toLocaleString()} P`;
