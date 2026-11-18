import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getHistoryScreen,
  getInitialHistoryScreen,
  readAppHash,
  readHistoryHikingSelection,
} from '../src/services/appHistory.ts';

test('initial load and browser back accept their existing sets of saved screens', () => {
  const noHash = readAppHash('');
  for (const screen of ['explore', 'profile', 'hikingTracking', 'hikingRecords']) {
    assert.equal(getInitialHistoryScreen(screen), screen);
    assert.equal(getHistoryScreen(screen, noHash), screen);
  }
  for (const screen of ['write', 'journalDetail', 'publicProfile']) {
    assert.equal(getInitialHistoryScreen(screen), null);
    assert.equal(getHistoryScreen(screen, noHash), screen);
  }
  for (const screen of ['login', 'unknown', undefined, null]) {
    assert.equal(getInitialHistoryScreen(screen), null);
    assert.equal(getHistoryScreen(screen, noHash), 'explore');
  }
});

test('valid detail links override saved browser screens and malformed links are ignored', () => {
  const journal = readAppHash('#journals/21');
  assert.equal(journal.detailMatch?.[1], '21');
  assert.equal(getHistoryScreen('profile', journal), 'journalDetail');

  const user = readAppHash('#users/12');
  assert.equal(user.match?.[1], '12');
  assert.equal(getHistoryScreen('explore', user), 'publicProfile');

  for (const hash of ['#users/-1', '#journals/21/extra', '#users/abc']) {
    assert.equal(getHistoryScreen('profile', readAppHash(hash)), 'profile');
  }
});

test('saved hiking course restoration requires a tracking screen, matching account and valid IDs', () => {
  const selection = { mountainId: 12, courseId: 21 };
  const state = { toPeakHikingUserId: 7, toPeakHikingSelection: selection };
  assert.deepEqual(readHistoryHikingSelection('hikingTracking', state, 7), selection);
  assert.equal(readHistoryHikingSelection('hikingTracking', state, 8), null);
  assert.equal(readHistoryHikingSelection('explore', state, 7), null);
  assert.equal(readHistoryHikingSelection('hikingTracking', null, 7), null);
  assert.equal(
    readHistoryHikingSelection(
      'hikingTracking',
      { ...state, toPeakHikingSelection: { mountainId: 12, courseId: '21' } },
      7,
    ),
    null,
  );
});
