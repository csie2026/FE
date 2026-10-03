import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJournal, updateJournal, getHikingRecords, saveHikingRecord, ApiError } from '../src/api.ts';

test('journal creation selects an owned record without submitting mountain or date; editing only sends content', async () => {
  const original = globalThis.fetch;
  const requests: [string, RequestInit | undefined][] = [];
  globalThis.fetch = async (url, init) => {
    requests.push([String(url), init]);
    return new Response(JSON.stringify(String(url) === '/api/csrf'
      ? { headerName: 'X-CSRF-TOKEN', token: 'current-session' }
      : { id: 9, hikingRecordId: 42 }));
  };
  try {
    await createJournal({ hikingRecordId: 42, title: 'Trip', content: 'Review', isPublic: false });
    await updateJournal(9, { title: 'Edited', content: 'Review', isPublic: true });
    const writes = requests.filter(([url]) => url !== '/api/csrf');
    assert.equal(writes[0][0], '/api/journals');
    assert.equal(writes[0][1]?.method, 'POST');
    assert.deepEqual(JSON.parse(writes[0][1]?.body as string), {
      hikingRecordId: 42, title: 'Trip', content: 'Review', isPublic: false,
    });
    assert.equal(writes[1][0], '/api/journals/9');
    assert.equal(writes[1][1]?.method, 'PATCH');
    assert.deepEqual(JSON.parse(writes[1][1]?.body as string), {
      title: 'Edited', content: 'Review', isPublic: true,
    });
    for (const [, init] of writes) {
      assert.ok(init);
      assert.equal(init.credentials, 'include');
      assert.equal((init.headers as Record<string, string>)['X-CSRF-TOKEN'], 'current-session');
    }
  } finally { globalThis.fetch = original; }
});

test('activity save retries keep their idempotency key and list retains journal linkage', async () => {
  const original = globalThis.fetch;
  const writes: unknown[] = [];
  const input = {
    mountainId: 1, courseId: 2, startedAt: '2020-01-01T01:00:00.000Z',
    endedAt: '2020-01-01T02:00:00.000Z', distanceMeters: 5800,
    elapsedMs: 3600000, completed: true, clientRequestId: '00000000-0000-0000-0000-000000000001',
  };
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/api/csrf') return new Response(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'token' }));
    assert.equal(String(url), '/api/users/me/hiking-records');
    assert.equal(init?.credentials, 'include');
    if (init?.method === 'POST') {
      writes.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ id: 4, journalId: null }));
    }
    return new Response(JSON.stringify([{ id: 4, journalId: 9 }, { id: 5, journalId: null }]));
  };
  try {
    assert.equal((await saveHikingRecord(input)).id, 4);
    assert.equal((await saveHikingRecord(input)).id, 4);
    assert.deepEqual(writes, [input, input]);
    const records = await getHikingRecords();
    assert.equal(records[0].journalId, 9);
    assert.equal(records[1].journalId, null);
  } finally { globalThis.fetch = original; }
});

test('a stale journal candidate reports the duplicate conflict without silently succeeding', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => String(url) === '/api/csrf'
    ? new Response(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
    : new Response(JSON.stringify({ message: 'Already written' }), { status: 409 });
  try {
    await assert.rejects(createJournal({ hikingRecordId: 42, title: 'Trip', content: '', isPublic: false }),
      error => error instanceof ApiError && error.status === 409);
  } finally { globalThis.fetch = original; }
});
