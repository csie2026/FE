import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScopedRequest } from '../src/services/scopedRequest.ts';

function deferred() {
  let resolve!: (value: number) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<number>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('fast duplicate save invokes the server once and permits a later manual retry', async () => {
  const save = createScopedRequest(),
    pending = deferred();
  let sends = 0;
  const events: string[] = [];
  const handlers = {
    success: () => events.push('success'),
    failure: () => events.push('failure'),
    settled: () => events.push('settled'),
  };
  const first = save.run(() => {
    sends++;
    return pending.promise;
  }, handlers);
  assert.equal(
    await save.run(async () => {
      sends++;
      return 2;
    }, handlers),
    false,
  );
  pending.reject(new Error('network'));
  await first;
  assert.equal(sends, 1);
  assert.deepEqual(events, ['failure', 'settled']);
  await save.run(async () => {
    sends++;
    return 3;
  }, handlers);
  assert.equal(sends, 2);
  assert.deepEqual(events, ['failure', 'settled', 'success', 'settled']);
});

for (const outcome of ['success', 'failure']) {
  test(`screen/account exit ignores late ${outcome} and finally while a new save is busy`, async () => {
    const save = createScopedRequest(),
      old = deferred(),
      current = deferred();
    const events: string[] = [];
    const handlers = (label: string) => ({
      success: () => events.push(label + ':success'),
      failure: () => events.push(label + ':failure'),
      settled: () => events.push(label + ':idle'),
    });
    const previous = save.run(() => old.promise, handlers('old'));
    save.invalidate();
    const next = save.run(() => current.promise, handlers('new'));
    if (outcome === 'success') old.resolve(1);
    else old.reject(new Error('late'));
    await previous;
    assert.deepEqual(events, []);
    assert.equal(await save.run(async () => 9, handlers('duplicate')), false);
    current.resolve(2);
    await next;
    assert.deepEqual(events, ['new:success', 'new:idle']);
  });
}

test('success navigation cannot let its finally clear the next screen loading state', async () => {
  const save = createScopedRequest();
  let busy = true;
  await save.run(async () => 1, {
    success: () => {
      save.invalidate();
      busy = true;
    },
    failure: () => assert.fail('unexpected failure'),
    settled: () => {
      busy = false;
    },
  });
  assert.equal(busy, true);
});
