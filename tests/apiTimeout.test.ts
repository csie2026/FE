import { memberResponse } from './fixtures.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, API_TIMEOUT_MS, subscribeSessionExpiry, saveHikingRecord } from '../src/api.ts';
import { submitPendingActivity, ActivitySaveFailure } from '../src/components/hiking/services/activitySave.ts';

const csrf = () => Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test' });
const never = () => new Promise<Response>(() => {});
const isTimeout = (error: unknown) => error instanceof ApiError && error.status === 0 && error.code === 'request_timeout';

for (const stage of ['read', 'csrf', 'body'] as const) {
  test(`default deadline bounds ${stage}, including a reader ignoring cancellation`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const original = globalThis.fetch;
    const paths: string[] = [];
    let requestSignal: AbortSignal | null | undefined;
    let announce: () => void = () => {};
    const started = new Promise<void>(resolve => { announce = resolve; });
    globalThis.fetch = async (path, init) => {
      paths.push(String(path)); requestSignal = init?.signal;
      if (stage !== 'body') { announce(); return never(); }
      const response = Response.json({});
      response.json = () => { announce(); return new Promise(() => {}); };
      return response;
    };
    try {
      const pending = api('/api/users/me', stage === 'csrf' ? 'PATCH' : 'GET', stage === 'csrf' ? {} : undefined);
      await started;
      t.mock.timers.tick(API_TIMEOUT_MS);
      await assert.rejects(pending,isTimeout);
      assert.equal(requestSignal?.aborted,true);
      assert.deepEqual(paths,[stage === 'csrf' ? '/api/csrf' : '/api/users/me']);
    } finally { globalThis.fetch = original; }
  });
}

test('deadline cancels nested owner verification and never sends the mutation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.fetch;
  const paths: string[] = [];
  let requestSignal: AbortSignal | null | undefined;
  let announce: () => void = () => {};
  const started = new Promise<void>(resolve => { announce = resolve; });
  globalThis.fetch = async (path,init) => {
    paths.push(String(path));
    if (path === '/api/csrf') return csrf();
    requestSignal = init?.signal;
    announce(); return never();
  };
  try {
    const pending = saveHikingRecord({} as Parameters<typeof saveHikingRecord>[0],undefined,1);
    await started;
    t.mock.timers.tick(API_TIMEOUT_MS);
    await assert.rejects(pending,isTimeout);
    assert.equal(requestSignal?.aborted,true);
    assert.deepEqual(paths,['/api/csrf','/api/users/me']);
  } finally { globalThis.fetch = original; }
});

test('late 401 after timeout cannot expire a session and no automatic request is added', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.fetch;
  let complete: (response: Response) => void = () => {};
  let calls = 0, expired = 0;
  const unsubscribe = subscribeSessionExpiry(() => { expired++; });
  globalThis.fetch = () => { calls++; return new Promise(resolve => { complete = resolve; }); };
  try {
    const pending = api('/api/users/me');
    t.mock.timers.tick(API_TIMEOUT_MS);
    await assert.rejects(pending,isTimeout);
    complete(Response.json({ error: 'unauthorized' },{ status: 401 }));
    await Promise.resolve(); await Promise.resolve();
    assert.equal(expired,0); assert.equal(calls,1);
  } finally { globalThis.fetch = original; unsubscribe(); }
});

test('caller cancellation remains AbortError and a completed request clears its deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.fetch;
  try {
    globalThis.fetch = never;
    const controller = new AbortController();
    const pending = api('/api/users/me','GET',undefined,controller.signal);
    controller.abort();
    await assert.rejects(pending,{ name: 'AbortError' });
    let completedSignal: AbortSignal | null | undefined;
    globalThis.fetch = async (_path,init) => { completedSignal = init?.signal; return Response.json(memberResponse()); };
    assert.deepEqual(await api('/api/users/me'), memberResponse());
    t.mock.timers.tick(API_TIMEOUT_MS * 2);
    assert.equal(completedSignal?.aborted,false);
  } finally { globalThis.fetch = original; }
});

test('common timeout keeps hiking save uncertain and preserves the frozen UUID and evidence', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.fetch;
  const paths: string[] = [];
  let announce: () => void = () => {};
  const started = new Promise<void>(resolve => { announce = resolve; });
  const input = Object.freeze({ mountainId: 1, courseId: null, startedAt: '2020-01-01T00:00:00Z',
    endedAt: '2020-01-01T01:00:00Z', distanceMeters: 0, elapsedMs: 3600000, completed: false,
    clientRequestId: '6c6d4570-7615-4124-a698-4eca1e634919', gpsSegments: [] });
  const before = JSON.stringify(input);
  globalThis.fetch = async (path) => {
    paths.push(String(path));
    if (path === '/api/csrf') return csrf();
    if (path === '/api/users/me') return Response.json(memberResponse(1));
    announce(); return never();
  };
  try {
    const pending = submitPendingActivity(input,1,undefined,API_TIMEOUT_MS + 1000);
    await started;
    t.mock.timers.tick(API_TIMEOUT_MS);
    await assert.rejects(pending,error => error instanceof ActivitySaveFailure && error.kind === 'uncertain');
    assert.equal(JSON.stringify(input),before);
    assert.deepEqual(paths,['/api/csrf','/api/users/me','/api/users/me/hiking-records']);
  } finally { globalThis.fetch = original; }
});
