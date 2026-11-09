import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readHikingRecoveryNotice,
  visibleHikingRecoveryNotice,
  openHikingRecoveryNotice,
} from '../src/services/hikingRecoveryNotice.ts';
import {
  initialSession,
  completeSession,
  draftFromSession,
  writeRecovery,
  removeRecovery,
  recoveryKey,
} from '../src/components/hiking/services/sessionRecovery.ts';

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

function fixture(completed = true) {
  const storage = new MemoryStorage();
  const now = Date.now();
  const course = {
    mountainId: '47',
    courseId: '10',
    mountainName: '테스트 산',
    courseName: '테스트 코스',
  };
  const running = {
    ...initialSession(),
    state: 'TRACKING' as const,
    startedAt: now - 60000,
    activeSince: now - 60000,
    clientRequestId: crypto.randomUUID(),
    segments: [[]],
  };
  const draft = draftFromSession(
    completed ? completeSession(running, course, now) : running,
    course,
    1,
    crypto.randomUUID(),
    now,
  );
  writeRecovery(draft, 'create', storage);
  return { storage, draft };
}

test('returning same member discovers pending-save and paused records distinctly', () => {
  for (const completed of [true, false]) {
    const { storage } = fixture(completed);
    const notice = readHikingRecoveryNotice(1, storage)!;
    assert.equal(notice.userId, 1);
    assert.equal(notice.kind, completed ? 'pending-save' : 'paused');
    assert.ok(visibleHikingRecoveryNotice(notice, 1, null));
    assert.match(notice.message, completed ? /저장을 기다리는/ : /이어서 진행/);
  }
});

test('a member without a draft sees no notice', () => {
  assert.equal(readHikingRecoveryNotice(1, new MemoryStorage()), null);
});

test('another member cannot discover, display or open the owners record', () => {
  const { storage } = fixture();
  const notice = readHikingRecoveryNotice(1, storage)!;
  assert.equal(readHikingRecoveryNotice(2, storage), null);
  assert.equal(visibleHikingRecoveryNotice(notice, 2, null), null);
  assert.equal(
    openHikingRecoveryNotice(notice, 2, () => assert.fail('navigation'), storage),
    false,
  );
});

test('notice navigates to the existing hiking recovery page without changing the request', () => {
  const { storage } = fixture();
  const before = storage.getItem(recoveryKey(1));
  let destination = '';
  assert.equal(
    openHikingRecoveryNotice(
      readHikingRecoveryNotice(1, storage)!,
      1,
      (screen) => {
        destination = screen;
      },
      storage,
    ),
    true,
  );
  assert.equal(destination, 'hikingTracking');
  assert.equal(storage.getItem(recoveryKey(1)), before);
});

test('dismissing only hides the notice; the same member can discover the draft after a fresh login', () => {
  const { storage } = fixture();
  const notice = readHikingRecoveryNotice(1, storage)!;
  const before = storage.getItem(recoveryKey(1));
  assert.equal(visibleHikingRecoveryNotice(notice, 1, notice.clientRequestId), null);
  assert.equal(storage.getItem(recoveryKey(1)), before);
  assert.ok(visibleHikingRecoveryNotice(readHikingRecoveryNotice(1, storage), 1, null));
});

test('successful-save cleanup removes the notice and stale links cannot navigate', () => {
  const { storage, draft } = fixture();
  const old = readHikingRecoveryNotice(1, storage)!;
  removeRecovery(1, draft.clientRequestId, draft.ownerToken, storage);
  assert.equal(readHikingRecoveryNotice(1, storage), null);
  assert.equal(
    openHikingRecoveryNotice(old, 1, () => assert.fail('navigation'), storage),
    false,
  );
});
