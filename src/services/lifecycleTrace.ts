// 개발 진단용 허용 목록. URL·ID·회원 정보·오류 메시지·응답 본문은 받지 않는다.
export const TRACE_KEY = 'topeak:dev:lifecycle:v1';
export const TRACE_TTL_MS = 30 * 60 * 1000;
export const TRACE_LIMIT = 80;
const events = [
  'document-start',
  'app-mount',
  'app-unmount',
  'auth-start',
  'auth-finish',
  'global-loading',
  'pagehide',
  'pageshow',
  'visibilitychange',
  'focus',
  'blur',
  'freeze',
  'resume',
  'vite-update',
  'vite-full-reload',
  'vite-connect',
  'vite-disconnect',
  'screen-change',
  'query-start',
  'query-end',
] as const;
const screens = [
  'login',
  'explore',
  'detail',
  'hikingTracking',
  'diary',
  'journalDetail',
  'write',
  'profile',
  'accountSettings',
  'hikingRecords',
  'ranking',
  'setup',
  'myJournals',
  'publicProfile',
  'favorites',
  'conquered',
  'about',
] as const;
const queries = [
  'session',
  'mountains',
  'courses',
  'weather',
  'journals',
  'journal-detail',
  'my-journals',
  'public-profile',
  'public-journals',
  'hiking-records',
  'ranking',
  'monthly-goals',
] as const;
export type TraceEvent = (typeof events)[number];
export type TraceDetails = {
  loading?: boolean;
  persisted?: boolean;
  screen?: string;
  query?: (typeof queries)[number];
  requestId?: number;
  outcome?: 'success' | 'error' | 'cancelled' | 'timeout';
  status?: number;
};
export type TraceEntry = TraceDetails & {
  event: TraceEvent;
  atMs: number;
  visibility: DocumentVisibilityState;
};
export type TraceDocument = {
  documentId: string;
  navigationType: string;
  startedAt: number;
  updatedAt: number;
  events: TraceEntry[];
};
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function safeEntry(value: unknown): TraceEntry | null {
  if (
    !record(value) ||
    !events.includes(value.event as TraceEvent) ||
    typeof value.atMs !== 'number' ||
    !Number.isFinite(value.atMs) ||
    value.atMs < 0 ||
    (value.visibility !== 'hidden' && value.visibility !== 'visible')
  )
    return null;
  const entry: TraceEntry = {
    event: value.event as TraceEvent,
    atMs: value.atMs,
    visibility: value.visibility,
  };
  for (const key of ['loading', 'persisted'] as const)
    if (typeof value[key] === 'boolean') entry[key] = value[key];
  if (screens.includes(value.screen as (typeof screens)[number]))
    entry.screen = value.screen as string;
  if (queries.includes(value.query as (typeof queries)[number]))
    entry.query = value.query as (typeof queries)[number];
  if (Number.isSafeInteger(value.requestId) && Number(value.requestId) > 0)
    entry.requestId = Number(value.requestId);
  if (['success', 'error', 'cancelled', 'timeout'].includes(value.outcome as string))
    entry.outcome = value.outcome as TraceDetails['outcome'];
  if (Number.isInteger(value.status) && Number(value.status) >= 0 && Number(value.status) <= 599)
    entry.status = Number(value.status);
  return entry;
}

export function readTraceHistory(storage: Store | undefined, now: number): TraceDocument[] {
  try {
    const serialized = storage?.getItem(TRACE_KEY) ?? 'null';
    if (serialized.length > 128_000) {
      storage?.removeItem(TRACE_KEY);
      return [];
    }
    const raw: unknown = JSON.parse(serialized);
    if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.documents)) {
      storage?.removeItem(TRACE_KEY);
      return [];
    }
    const documents: TraceDocument[] = [];
    for (const item of raw.documents.slice(-2)) {
      if (
        !record(item) ||
        typeof item.documentId !== 'string' ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(item.documentId) ||
        !['navigate', 'reload', 'back_forward', 'prerender', 'unknown'].includes(
          item.navigationType as string,
        ) ||
        typeof item.startedAt !== 'number' ||
        !Number.isFinite(item.startedAt) ||
        item.startedAt < 0 ||
        typeof item.updatedAt !== 'number' ||
        !Number.isFinite(item.updatedAt) ||
        item.startedAt > item.updatedAt ||
        item.updatedAt > now ||
        now - item.updatedAt > TRACE_TTL_MS ||
        !Array.isArray(item.events)
      )
        continue;
      documents.push({
        documentId: item.documentId,
        navigationType: item.navigationType as string,
        startedAt: item.startedAt,
        updatedAt: item.updatedAt,
        events: item.events
          .slice(-TRACE_LIMIT)
          .map(safeEntry)
          .filter((e): e is TraceEntry => e !== null),
      });
    }
    // 조회 시에도 만료된 항목을 정리하며, 저장 실패는 앱 동작에 영향을 주지 않는다.
    storage?.setItem(TRACE_KEY, JSON.stringify({ version: 1, documents }));
    return documents;
  } catch {
    return [];
  }
}

export function persistTrace(
  storage: Store | undefined,
  previous: TraceDocument[],
  current: TraceDocument,
  now: number,
) {
  try {
    const documents = [
      ...previous
        .filter(
          (d) =>
            d.documentId !== current.documentId &&
            now >= d.updatedAt &&
            now - d.updatedAt <= TRACE_TTL_MS,
        )
        .slice(-1),
      {
        ...current,
        events: current.events
          .slice(-TRACE_LIMIT)
          .map(safeEntry)
          .filter((e): e is TraceEntry => e !== null),
      },
    ];
    storage?.setItem(TRACE_KEY, JSON.stringify({ version: 1, documents }));
    return storage !== undefined;
  } catch {
    return false;
  }
}

export function classifyPageQuery(path: string): TraceDetails['query'] | undefined {
  if (path === '/api/users/me') return 'session';
  if (path === '/api/mountains') return 'mountains';
  if (/^\/api\/mountains\/\d+\/courses$/.test(path)) return 'courses';
  if (/^\/api\/mountains\/\d+\/weather$/.test(path)) return 'weather';
  if (path === '/api/journals') return 'journals';
  if (/^\/api\/journals\/\d+$/.test(path)) return 'journal-detail';
  if (path === '/api/users/me/journals') return 'my-journals';
  if (path === '/api/users/me/hiking-records') return 'hiking-records';
  if (/^\/api\/users\/\d+\/profile$/.test(path)) return 'public-profile';
  if (/^\/api\/users\/\d+\/journals$/.test(path)) return 'public-journals';
  if (/^\/api\/rankings(?:\/summary)?(?:\?[^#]*)?$/.test(path)) return 'ranking';
  if (/^\/api\/users\/me\/monthly-goals\/\d{4}-\d{2}$/.test(path)) return 'monthly-goals';
  return undefined;
}
