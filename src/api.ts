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
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {};
  const multipart = body instanceof FormData;
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
export async function deleteMemberImage(kind: MemberImageKind, signal?: AbortSignal) {
  await api<void>(`/api/users/me/images/${kind}`, 'DELETE', undefined, signal);
  return getCurrentMember(signal);
}
export const scoreText = (score: number | null) =>
  score === null ? '점수 미산정' : `${score.toLocaleString()} P`;
