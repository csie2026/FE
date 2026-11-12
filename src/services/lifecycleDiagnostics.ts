import {
  classifyPageQuery,
  persistTrace,
  readTraceHistory,
  safeEntry,
  TRACE_LIMIT,
  TRACE_TTL_MS,
  type TraceDetails,
  type TraceDocument,
  type TraceEvent,
} from './lifecycleTrace.ts';

type Diagnostics = TraceDocument & {
  previousDocuments: TraceDocument[];
  storageAvailable: boolean;
};
declare global {
  interface Window {
    __TOPEAK_LIFECYCLE__?: Diagnostics;
  }
}
let currentScreen: string | undefined;
let requestSequence = 0;
function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

// 개발용 로그만 유지한다. URL·회원 정보·응답·토큰·쿠키·입력값은 기록하지 않는다.
export function recordLifecycle(event: TraceEvent, details: TraceDetails = {}) {
  if (!import.meta.env?.DEV) return;
  try {
    const trace = window.__TOPEAK_LIFECYCLE__;
    if (!trace) return;
    const entry = safeEntry({
      event,
      atMs: Math.round(performance.now()),
      visibility: document.visibilityState,
      screen: currentScreen,
      ...details,
    });
    if (!entry) return;
    if (event === 'screen-change') currentScreen = entry.screen;
    trace.events.push(entry);
    if (trace.events.length > TRACE_LIMIT) trace.events.shift();
    trace.updatedAt = Date.now();
    trace.previousDocuments = trace.previousDocuments.filter(
      (d) => trace.updatedAt >= d.updatedAt && trace.updatedAt - d.updatedAt <= TRACE_TTL_MS,
    );
    const current: TraceDocument = {
      documentId: trace.documentId,
      navigationType: trace.navigationType,
      startedAt: trace.startedAt,
      updatedAt: trace.updatedAt,
      events: trace.events,
    };
    trace.storageAvailable = persistTrace(
      storage(),
      trace.previousDocuments,
      current,
      trace.updatedAt,
    );
    console.debug('[ToPeak lifecycle]', trace.documentId, entry);
  } catch {
    /* 진단 실패가 화면·요청 동작에 영향을 주지 않게 한다. */
  }
}

export function beginPageQuery(path: string, method: string) {
  if (!import.meta.env?.DEV || method !== 'GET') return undefined;
  const query = classifyPageQuery(path);
  if (!query) return undefined;
  const requestId = ++requestSequence;
  recordLifecycle('query-start', { query, requestId });
  return (outcome: TraceDetails['outcome'], status?: number) =>
    recordLifecycle('query-end', { query, requestId, outcome, status });
}

export function installLifecycleDiagnostics() {
  if (!import.meta.env?.DEV || window.__TOPEAK_LIFECYCLE__) return;
  const navigation = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined;
  const now = Date.now();
  const previousDocuments = readTraceHistory(storage(), now).slice(-1);
  window.__TOPEAK_LIFECYCLE__ = {
    documentId:
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : String(performance.timeOrigin).replace('.', '-'),
    navigationType: navigation?.type ?? 'unknown',
    startedAt: now,
    updatedAt: now,
    events: [],
    previousDocuments,
    storageAvailable: false,
  };
  recordLifecycle('document-start');
  window.addEventListener('pagehide', (event) =>
    recordLifecycle('pagehide', { persisted: event.persisted }),
  );
  window.addEventListener('pageshow', (event) =>
    recordLifecycle('pageshow', { persisted: event.persisted }),
  );
  window.addEventListener('focus', () => recordLifecycle('focus'));
  window.addEventListener('blur', () => recordLifecycle('blur'));
  document.addEventListener('visibilitychange', () => recordLifecycle('visibilitychange'));
  // 지원 브라우저가 발생시킨 경우에만 기록하며 Safari의 이벤트 발생을 보장하지 않는다.
  document.addEventListener('freeze', () => recordLifecycle('freeze'));
  document.addEventListener('resume', () => recordLifecycle('resume'));
  import.meta.hot?.on('vite:ws:connect', () => recordLifecycle('vite-connect'));
  import.meta.hot?.on('vite:ws:disconnect', () => recordLifecycle('vite-disconnect'));
  import.meta.hot?.on('vite:beforeUpdate', () => recordLifecycle('vite-update'));
  import.meta.hot?.on('vite:beforeFullReload', () => recordLifecycle('vite-full-reload'));
}
