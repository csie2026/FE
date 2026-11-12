import { beginPageQuery } from './services/lifecycleDiagnostics.ts';
import { validApiResponse } from './services/responseValidation.ts';
import {
  getErrorMessage,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from './utils/errorMessages.ts';

export interface PublicProfile {
  userId: number;
  nickname: string | null;
  profileImageUrl: string | null;
  score: number | null;
}
export interface RankingMember {
  userId: number;
  nickname: string | null;
  profileImageUrl: string | null;
  score: number | null;
  rank: number;
}

export const getRankings = () => api<PublicProfile[]>('/api/rankings');
export interface RankingSummary {
  members: RankingMember[];
  mine: RankingMember | null;
  totalMembers: number;
}
export const getRankingSummary = (signal?: AbortSignal) =>
  api<RankingSummary>('/api/rankings/summary', 'GET', undefined, signal);
export interface Member extends PublicProfile {
  provider?: string | null;
  email?: string | null;
  joinedAt?: string | null;
  backgroundImageUrl: string | null;
  birthYear: number | null;
  age: number | null;
  profileCompleted: boolean;
}
export interface Journal {
  hikingRecordId: number | null;
  id: number;
  userId: number;
  nickname: string | null;
  mountainName: string;
  title: string;
  content: string;
  hikingDate: string;
  isPublic: boolean;
}
export type JournalInput = Pick<Journal, 'title' | 'content' | 'isPublic'> & {
  hikingRecordId: number;
};
export type JournalUpdate = Pick<Journal, 'title' | 'content' | 'isPublic'>;
export interface GpsEvidence {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  recordedAt: string;
}
export interface ActivityScoring {
  status: 'CERTIFIED' | 'GPS_REQUIRED' | 'BELOW_MINIMUM' | 'DAILY_LIMIT';
  certificationDate: string;
  visitPoints: number;
  summitPoints: number;
  policyVersion: string;
}
export interface HikingActivity {
  id: number;
  mountainId: number;
  mountainName: string;
  courseId: number | null;
  startedAt: string;
  endedAt: string;
  hikingDate: string;
  distanceMeters: number;
  elapsedMs: number;
  completed: boolean;
  journalId: number | null;
  scoring?: ActivityScoring | null;
  gpsValidationVersion?: number | null;
}
export type HikingActivityInput = Pick<
  HikingActivity,
  'mountainId' | 'courseId' | 'startedAt' | 'endedAt' | 'distanceMeters' | 'elapsedMs' | 'completed'
> & {
  clientRequestId: string;
  gpsEvidence?: GpsEvidence;
  gpsSegments?: GpsEvidencePoint[][];
};
export type GpsEvidencePoint = {
  lat: number;
  lng: number;
  measuredAt: string;
  accuracyMeters: number;
};
export const getHikingRecords = (signal?: AbortSignal) =>
  api<HikingActivity[]>('/api/users/me/hiking-records', 'GET', undefined, signal);
export const saveHikingRecord = (
  input: HikingActivityInput,
  signal?: AbortSignal,
  expectedUserId?: number,
) =>
  api<HikingActivity>(
    '/api/users/me/hiking-records',
    'POST',
    input,
    signal,
    expectedUserId === undefined
      ? undefined
      : async (requestSignal) => {
          const member = await getCurrentMember(requestSignal);
          if (member.userId !== expectedUserId)
            throw new ApiError(
              401,
              '산행을 기록한 회원과 현재 로그인한 회원이 다릅니다. 같은 회원으로 로그인해주세요.',
            );
        },
  );
export const createJournal = (input: JournalInput) => api<Journal>('/api/journals', 'POST', input);
export const updateJournal = (id: number, input: JournalUpdate) =>
  api<Journal>(`/api/journals/${id}`, 'PATCH', input);
export const deleteJournal = (id: number) => api<void>(`/api/journals/${id}`, 'DELETE');
export const getJournal = (id: number, signal?: AbortSignal) =>
  api<Journal>(`/api/journals/${id}`, 'GET', undefined, signal);
let sessionGeneration = 0;
let sessionExpired: ((code?: string, userId?: number) => void) | undefined;

export function subscribeSessionExpiry(listener: (code?: string, userId?: number) => void) {
  const generation = ++sessionGeneration;
  sessionExpired = listener;
  return () => {
    if (generation === sessionGeneration) {
      sessionGeneration++;
      sessionExpired = undefined;
    }
  };
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
type ErrorBody = { message?: unknown; error?: unknown; userId?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasErrorName(value: unknown, name: string) {
  return isRecord(value) && value.name === name;
}

function preserveCancellation(cause: unknown, signal?: AbortSignal) {
  if (
    hasErrorName(cause, 'TimeoutError') ||
    (signal?.aborted && hasErrorName(signal.reason, 'TimeoutError'))
  ) {
    throw new ApiError(0, TIMEOUT_ERROR_MESSAGE, 'request_timeout');
  }
  // 화면 이탈에 따른 취소는 네트워크 장애로 바꾸지 않는다.
  if (hasErrorName(cause, 'AbortError')) throw cause;
  if (signal?.aborted) throw new DOMException('요청이 취소되었습니다.', 'AbortError');
}

async function fetchResponse(path: string, options: RequestInit) {
  try {
    const response = await fetch(path, options);
    if (options.signal?.aborted) preserveCancellation(options.signal.reason, options.signal);
    return response;
  } catch (cause) {
    preserveCancellation(cause, options.signal ?? undefined);
    throw new ApiError(0, NETWORK_ERROR_MESSAGE, 'network_error');
  }
}

async function readJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  try {
    const value: unknown = await response.json();
    if (signal?.aborted) preserveCancellation(signal.reason, signal);
    return value;
  } catch (cause) {
    preserveCancellation(cause, signal);
    throw new ApiError(
      response.status,
      '서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',
      'invalid_response',
    );
  }
}

function fallbackMessage(status: number, code?: string) {
  switch (code) {
    case 'invalid_csrf':
      return '인증 정보를 확인할 수 없습니다. 다시 시도해주세요.';
    case 'account_unavailable':
      return '더 이상 이용할 수 없는 계정입니다. 다시 로그인해주세요.';
    case 'session_upgrade_required':
      return '로그인 정보를 갱신해야 합니다. 다시 로그인해주세요.';
    case 'oauth_login_failed':
      return '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.';
    case 'duplicate_hiking_activity':
      return '같은 산행 기록이 이미 저장되어 있습니다. 저장된 기록을 확인해주세요.';
  }
  if (status >= 500) return '서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';
  switch (status) {
    case 400:
    case 422:
      return '입력한 정보를 확인하고 다시 시도해주세요.';
    case 401:
      return '로그인이 필요합니다. 다시 로그인해주세요.';
    case 403:
      return '이 요청에 대한 권한이 없습니다.';
    case 404:
      return '요청한 정보를 찾을 수 없습니다.';
    case 405:
      return '지원하지 않는 요청입니다.';
    case 408:
      return TIMEOUT_ERROR_MESSAGE;
    case 409:
      return '기존 정보와 요청 내용이 충돌합니다. 최신 정보를 확인해주세요.';
    case 413:
      return '전송할 데이터의 용량이 너무 큽니다. 용량을 줄여 다시 시도해주세요.';
    case 415:
      return '지원하지 않는 데이터 형식입니다.';
    case 429:
      return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
    default:
      return '요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.';
  }
}

async function readHttpError(response: Response, signal?: AbortSignal) {
  let error: ErrorBody = {};
  try {
    const value: unknown = await response.json();
    if (isRecord(value)) error = value;
  } catch (cause) {
    preserveCancellation(cause, signal);
    // HTML 또는 빈 오류 응답도 원래 HTTP 상태를 유지한다.
  }
  if (signal?.aborted) preserveCancellation(signal.reason, signal);
  const code = typeof error.error === 'string' ? error.error : undefined;
  return {
    code,
    userId:
      typeof error.userId === 'number' && Number.isSafeInteger(error.userId) && error.userId > 0
        ? error.userId
        : undefined,
    // 서버의 한글 안내는 유지하고 영문 기본 검증 문구는 상태별 안내로 대체한다.
    message: getErrorMessage(error, fallbackMessage(response.status, code)),
  };
}
// 세션 쿠키와 서버 오류 상태를 모든 도메인 요청에서 일관되게 다루는 공통 진입점이다.
export const API_TIMEOUT_MS = 20_000;
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
  beforeSend?: (signal?: AbortSignal) => Promise<void>,
): Promise<T> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal?.reason);
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => {
      try {
        preserveCancellation(controller.signal.reason, controller.signal);
      } catch (cause) {
        reject(cause);
      }
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  signal?.addEventListener('abort', forwardAbort, { once: true });
  if (signal?.aborted) forwardAbort();
  const timer = setTimeout(
    () => controller.abort(new DOMException('요청 시간이 초과되었습니다.', 'TimeoutError')),
    API_TIMEOUT_MS,
  );
  const finishDiagnostic = beginPageQuery(path, method);
  try {
    if (controller.signal.aborted) return await cancelled;
    // Race also bounds adapters/body readers that ignore AbortSignal. Never automatically retry.
    const result = await Promise.race([
      apiRequest<T>(path, method, body, controller.signal, beforeSend),
      cancelled,
    ]);
    finishDiagnostic?.('success');
    return result;
  } catch (cause) {
    const outcome = cause instanceof ApiError && cause.code === 'request_timeout'
      ? 'timeout' : signal?.aborted ? 'cancelled' : 'error';
    finishDiagnostic?.(outcome, cause instanceof ApiError ? cause.status : undefined);
    throw cause;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

async function apiRequest<T>(
  path: string,
  method: string,
  body: unknown,
  signal: AbortSignal,
  beforeSend?: (signal?: AbortSignal) => Promise<void>,
): Promise<T> {
  const generation = sessionGeneration;
  const checkSession = (status: number, code?: string, userId?: number) => {
    if (status === 401 && path !== '/api/logout' && generation === sessionGeneration)
      sessionExpired?.(code, userId);
  };
  const headers: Record<string, string> = {};
  const multipart = body instanceof FormData;
  // 변경 요청은 현재 세션의 CSRF 토큰과 헤더 이름을 서버에서 받아 사용한다.
  // FormData는 브라우저가 multipart 경계를 지정해야 하므로 Content-Type을 직접 설정하지 않는다.
  if (method !== 'GET') {
    const csrfResponse = await fetchResponse('/api/csrf', {
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    if (!csrfResponse.ok) {
      const error = await readHttpError(csrfResponse, signal);
      checkSession(csrfResponse.status, error.code, error.userId);
      throw new ApiError(csrfResponse.status, error.message, error.code);
    }
    const csrf = await readJson(csrfResponse, signal);
    if (
      !isRecord(csrf) ||
      typeof csrf.headerName !== 'string' ||
      !/^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+$/.test(csrf.headerName) ||
      typeof csrf.token !== 'string' ||
      !csrf.token.trim() ||
      /[\r\n]/.test(csrf.token)
    ) {
      throw new ApiError(
        csrfResponse.status,
        '인증 정보를 확인할 수 없습니다. 다시 시도해주세요.',
        'invalid_csrf_response',
      );
    }
    headers[csrf.headerName] = csrf.token;
    if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  }
  // Activity retries recheck the member after CSRF retrieval, immediately before sending.
  if (beforeSend) await beforeSend(signal);
  if (signal?.aborted) throw new DOMException('요청이 취소되었습니다.', 'AbortError');
  const response = await fetchResponse(path, {
    method,
    headers,
    credentials: 'include',
    cache: 'no-store',
    signal,
    body: multipart ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await readHttpError(response, signal);
    checkSession(response.status, error.code, error.userId);
    throw new ApiError(response.status, error.message, error.code);
  }
  // 삭제·로그아웃의 빈 응답을 JSON으로 읽지 않아 정상 처리 후 파싱 오류가 발생하지 않게 한다.
  const value = response.status === 204 ? undefined : await readJson(response, signal);
  if (!validApiResponse(path, method, value))
    throw new ApiError(
      response.status,
      '서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',
      'invalid_response',
    );
  return value as T;
}

export type MemberImageKind = 'profile' | 'background';
export const getCurrentMember = (signal?: AbortSignal) =>
  api<Member>('/api/users/me', 'GET', undefined, signal);
const checkImageOwner = async (expectedUserId: number | undefined, signal?: AbortSignal) => {
  if (expectedUserId !== undefined && (await getCurrentMember(signal)).userId !== expectedUserId)
    throw new ApiError(401, '로그인 계정이 변경되었어요. 다시 로그인해 주세요.');
};
const ownedImageResponse = (member: Member, expectedUserId?: number) => {
  if (expectedUserId !== undefined && member.userId !== expectedUserId)
    throw new ApiError(401, '로그인 계정이 변경되었어요. 다시 로그인해 주세요.');
  return member;
};
export async function uploadMemberImage(
  kind: MemberImageKind,
  file: File,
  signal?: AbortSignal,
  expectedUserId?: number,
) {
  const body = new FormData();
  body.append('file', file);
  const member = await api<Member>(
    `/api/users/me/images/${kind}`,
    'PUT',
    body,
    signal,
    expectedUserId === undefined
      ? undefined
      : (requestSignal) => checkImageOwner(expectedUserId, requestSignal),
  );
  return ownedImageResponse(member, expectedUserId);
}
// Read the resolved fallback again after deletion; no old uploaded URL is retained locally.
export async function deleteMemberImage(
  kind: MemberImageKind,
  signal?: AbortSignal,
  expectedUserId?: number,
) {
  await api<void>(
    `/api/users/me/images/${kind}`,
    'DELETE',
    undefined,
    signal,
    expectedUserId === undefined
      ? undefined
      : (requestSignal) => checkImageOwner(expectedUserId, requestSignal),
  );
  return ownedImageResponse(await getCurrentMember(signal), expectedUserId);
}
export const scoreText = (score: number | null) =>
  score === null ? '점수 미산정' : `${score.toLocaleString()}점`;

export interface WeatherHour {
  time: string;
  temperature: number | null;
  sky: number | null;
  pty: number | null;
  pop: number | null;
  precipitationMm: number | null;
  snowCm: number | null;
  windSpeed: number | null;
  humidity: number | null;
}
export interface MountainWeather {
  mountainId: number;
  mountainName: string;
  baseTime: string;
  days:
    | {
        date: string;
        level: 'GOOD' | 'CAUTION' | 'BAD' | null;
        message: string | null;
        notes: string[] | null;
        hours: WeatherHour[] | null;
      }[]
    | null;
  source: string | null;
}
export const getMountainWeather = (mountainId: number, signal?: AbortSignal) =>
  api<MountainWeather>(`/api/mountains/${mountainId}/weather`, 'GET', undefined, signal);
