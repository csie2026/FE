import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import {
  classifyPageQuery,
  persistTrace,
  readTraceHistory,
  safeEntry,
  TRACE_KEY,
  TRACE_LIMIT,
  TRACE_TTL_MS,
  type TraceDocument,
} from '../src/services/lifecycleTrace.ts';
import {
  beginPageQuery,
  installLifecycleDiagnostics,
  recordLifecycle,
} from '../src/services/lifecycleDiagnostics.ts';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
const now = 1_800_000_000_000;
function trace(documentId: string, updatedAt = now): TraceDocument {
  return {
    documentId,
    navigationType: 'reload',
    startedAt: updatedAt,
    updatedAt,
    events: [{ event: 'document-start', atMs: 0, visibility: 'visible' }],
  };
}

test('reload history retains only previous and current documents, capped at 80 events', () => {
  const storage = memoryStorage();
  const current = trace('current');
  current.events = Array.from({ length: 100 }, (_, atMs) => ({
    event: 'focus',
    atMs,
    visibility: 'visible',
  }));
  persistTrace(storage, [trace('oldest'), trace('previous')], current, now);
  const loaded = readTraceHistory(storage, now);
  assert.deepEqual(
    loaded.map((d) => d.documentId),
    ['previous', 'current'],
  );
  assert.equal(loaded[1].events.length, TRACE_LIMIT);
  assert.equal(loaded[1].events[0].atMs, 20);
});

test('expired, future and corrupt history cannot become diagnostic evidence', () => {
  const storage = memoryStorage();
  persistTrace(storage, [trace('expired', now - TRACE_TTL_MS - 1)], trace('valid'), now);
  assert.deepEqual(
    readTraceHistory(storage, now).map((d) => d.documentId),
    ['valid'],
  );
  assert.deepEqual(readTraceHistory(storage, now + TRACE_TTL_MS + 1), []);
  storage.setItem(TRACE_KEY, '{broken');
  assert.deepEqual(readTraceHistory(storage, now), []);
  storage.setItem(TRACE_KEY, JSON.stringify({ version: 1, documents: [trace('future', now + 1)] }));
  assert.deepEqual(readTraceHistory(storage, now), []);
});

test('storage denied or quota exceeded does not escape into app behavior', () => {
  const denied = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('quota');
    },
    removeItem() {
      throw new Error('denied');
    },
  };
  assert.deepEqual(readTraceHistory(denied, now), []);
  assert.equal(persistTrace(denied, [], trace('current'), now), false);
  assert.equal(persistTrace(undefined, [], trace('current'), now), false);
});

test('stored and live event allowlists omit arbitrary sensitive details', () => {
  const unsafe = {
    event: 'query-end',
    atMs: 4,
    visibility: 'hidden',
    query: 'session',
    outcome: 'error',
    status: 401,
    requestId: 1,
    screen: 'profile',
    token: 'SECRET',
    url: '/users/142',
    body: { email: 'SECRET' },
    coordinates: [1, 2],
  };
  const entry = safeEntry(unsafe);
  assert.deepEqual(entry, {
    event: 'query-end',
    atMs: 4,
    visibility: 'hidden',
    query: 'session',
    outcome: 'error',
    status: 401,
    requestId: 1,
    screen: 'profile',
  });
  assert.equal(safeEntry({ ...unsafe, event: 'SECRET' }), null);
  assert.equal(safeEntry({ ...unsafe, query: 'SECRET', screen: 'SECRET' })?.screen, undefined);
  const storage = memoryStorage();
  storage.setItem(
    TRACE_KEY,
    JSON.stringify({
      version: 1,
      documents: [{ ...trace('current'), token: 'SECRET', events: [unsafe] }],
    }),
  );
  readTraceHistory(storage, now);
  assert.equal(storage.getItem(TRACE_KEY)?.includes('SECRET'), false);
});

test('page query labels contain no account ids, query parameters or request bodies', () => {
  assert.equal(classifyPageQuery('/api/users/142/profile'), 'public-profile');
  assert.equal(classifyPageQuery('/api/rankings/summary'), 'ranking');
  assert.equal(classifyPageQuery('/api/users/me/monthly-goals/2026-11'), 'monthly-goals');
  assert.equal(classifyPageQuery('/api/mountains/421/weather'), 'weather');
  assert.equal(classifyPageQuery('/oauth2/authorization/google'), undefined);
  assert.equal(classifyPageQuery('/api/users/me/images/profile'), undefined);
});

test('without Vite DEV, diagnostics do not access browser globals or storage', () => {
  assert.doesNotThrow(() => installLifecycleDiagnostics());
  assert.doesNotThrow(() => recordLifecycle('app-mount'));
  assert.equal(beginPageQuery('/api/users/me', 'GET'), undefined);
});

test('DEV events survive a simulated document restart without HMR payloads or browser state changes', async () => {
  const storage = memoryStorage();
  const page = Object.assign(new EventTarget(), { sessionStorage: storage });
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const callbacks = new Map<string, () => void>();
  const keys = ['window', 'document', '__traceOn'];
  const descriptors = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  const debug = console.debug;
  try {
    Object.defineProperty(globalThis, 'window', { value: page, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
    Object.defineProperty(globalThis, '__traceOn', {
      value: (name: string, callback: () => void) => callbacks.set(name, callback),
      configurable: true,
    });
    console.debug = () => {};
    const helperUrl = new URL('../src/services/lifecycleTrace.ts', import.meta.url).href;
    const source = (
      await readFile(new URL('../src/services/lifecycleDiagnostics.ts', import.meta.url), 'utf8')
    )
      .replace("'./lifecycleTrace.ts'", JSON.stringify(helperUrl))
      .replaceAll('import.meta.env?.DEV', 'true')
      .replaceAll('import.meta.hot', '({ on: globalThis.__traceOn })');
    const code = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    }).outputText;
    const runtime = await import(
      'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
    );
    runtime.installLifecycleDiagnostics();
    runtime.installLifecycleDiagnostics();
    runtime.recordLifecycle('screen-change', { screen: 'profile', userId: 142 });
    page.dispatchEvent(new Event('blur'));
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    callbacks.get('vite:ws:disconnect')?.();
    const finish = runtime.beginPageQuery('/api/users/142/profile', 'GET');
    finish('error', 401);
    assert.equal(runtime.beginPageQuery('/api/journals', 'POST'), undefined);
    const saved = readTraceHistory(storage, Date.now());
    assert.equal(saved.length, 1);
    assert.equal(saved[0].events.filter((e) => e.event === 'document-start').length, 1);
    assert.equal(
      saved[0].events.some((e) => e.event === 'blur'),
      true,
    );
    assert.equal(
      saved[0].events.some((e) => e.event === 'vite-disconnect'),
      true,
    );
    const start = saved[0].events.find((e) => e.event === 'query-start');
    const end = saved[0].events.find((e) => e.event === 'query-end');
    assert.equal(start?.requestId, end?.requestId);
    assert.equal(end?.status, 401);
    assert.equal(JSON.stringify(saved).includes('/api/users/142/profile'), false);
    assert.equal(JSON.stringify(saved).includes('"userId"'), false);
    // A fresh window simulates the next document; no location or fetch is supplied.
    Object.defineProperty(globalThis, 'window', {
      value: Object.assign(new EventTarget(), { sessionStorage: storage }),
      configurable: true,
    });
    runtime.installLifecycleDiagnostics();
    const next = readTraceHistory(storage, Date.now());
    assert.equal(next.length, 2);
    assert.notEqual(next[0].documentId, next[1].documentId);
    assert.equal(next[0].documentId, saved[0].documentId);
  } finally {
    console.debug = debug;
    keys.forEach((key, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
