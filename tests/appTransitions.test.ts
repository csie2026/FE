import assert from 'node:assert/strict';
import test from 'node:test';
import type { Member } from '../src/api.ts';
import { createActivityActions, type useActivityState } from '../src/hooks/useActivityFlow.ts';
import { createAppNavigation, createScreenTransition } from '../src/hooks/useAppNavigation.ts';
import { JOURNAL_ELIGIBILITY_MESSAGE } from '../src/services/journalEligibility.ts';
import { createScopedRequest } from '../src/services/scopedRequest.ts';
import { activityResponse } from './fixtures.ts';

test('screen transitions invalidate writes and preserve course ownership and history indexes', (t) => {
  const entries: Array<{ method: string; url: string }> = [];
  const history = {
    state: { toPeakScreen: 'explore', toPeakIndex: 2 } as Record<string, unknown>,
    pushState(state: Record<string, unknown>, _unused: string, url: string) {
      this.state = state;
      entries.push({ method: 'push', url });
    },
    replaceState(state: Record<string, unknown>, _unused: string, url: string) {
      this.state = state;
      entries.push({ method: 'replace', url });
    },
  };
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { history, location: { pathname: '/', search: '?source=app' } },
  });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const profileSave = createScopedRequest();
  const journalSave = createScopedRequest();
  const profileCurrent = profileSave.capture();
  const journalCurrent = journalSave.capture();
  const setCurrentScreen = t.mock.fn();
  const setHikingSelection = t.mock.fn();
  const transition = createScreenTransition({
    loading: false,
    publicId: null,
    selected: null,
    journalId: null,
    me: { userId: 7 } as Member,
    invalidateSaves: () => {
      profileSave.invalidate();
      journalSave.invalidate();
    },
    setCurrentScreen,
    setHikingSelection,
  });

  const course = { mountainId: 4, courseId: 5 };
  transition('hikingTracking', null, '4', null, false, course);
  assert.equal(profileCurrent(), false);
  assert.equal(journalCurrent(), false);
  assert.equal(history.state.toPeakHikingUserId, 7);
  assert.equal(history.state.toPeakIndex, 3);
  assert.deepEqual(setHikingSelection.mock.calls[0].arguments, [course]);
  transition('hikingTracking', null, '4', null, false, course);
  assert.equal(entries.length, 1);

  transition('journalDetail', null, '4', 32);
  assert.equal(history.state.toPeakHikingSelection, null);
  assert.equal(history.state.toPeakIndex, 4);
  transition('myJournals', null, '4', null, true);
  assert.equal(history.state.toPeakIndex, 4);
  transition('login');
  assert.equal(history.state.toPeakIndex, 0);
  assert.deepEqual(setCurrentScreen.mock.calls.at(-1)?.arguments, ['login']);
  assert.deepEqual(entries, [
    { method: 'push', url: '/?source=app' },
    { method: 'push', url: '/?source=app#journals/32' },
    { method: 'replace', url: '/?source=app' },
    { method: 'replace', url: '/?source=app' },
  ]);
});

test('menu navigation keeps account gates and resets the draft before entering write', () => {
  const calls: unknown[][] = [];
  const makeNavigation = (me: Member | null, locked = false) =>
    createAppNavigation({
      screen: 'explore',
      selected: '4',
      publicId: null,
      me,
      isWithdrawalPending: () => locked,
      setScreen: (...args) => calls.push(['screen', ...args]),
      setDrawerOpen: (open) => calls.push(['drawer', open]),
      setError: (error) => calls.push(['error', error]),
      setBusy: (busy) => calls.push(['busy', busy]),
      resetDraft: () => calls.push(['draft']),
      clearResults: () => calls.push(['results']),
      journalOwnerId: undefined,
    });

  const member = { userId: 7, profileCompleted: true } as Member;
  makeNavigation(member, true).go('write');
  assert.deepEqual(calls, []);
  makeNavigation(null).go('write');
  assert.deepEqual(calls.splice(0), [
    ['drawer', false],
    ['error', ''],
    ['screen', 'login'],
  ]);
  makeNavigation({ ...member, profileCompleted: false }).go('write');
  assert.deepEqual(calls.splice(0), [
    ['drawer', false],
    ['error', ''],
    ['screen', 'setup'],
  ]);
  makeNavigation(member).go('write');
  assert.deepEqual(calls, [
    ['drawer', false],
    ['error', ''],
    ['draft'],
    ['busy', true],
    ['results'],
    ['screen', 'write', null, '4'],
  ]);
});

test('tracking journal entry checks eligibility before navigation and selects the record afterwards', () => {
  const calls: unknown[][] = [];
  const journalSave = createScopedRequest();
  const actions = createActivityActions({
    activity: {
      setSelectedRecordId: (id) => calls.push(['record', id]),
    } as ReturnType<typeof useActivityState>,
    screen: 'hikingTracking',
    me: null,
    busy: false,
    getAccountVersion: () => 0,
    getJournalSave: () => journalSave,
    setBusy: () => {},
    setError: (error) => calls.push(['error', error]),
    fail: assert.fail,
    setScreen: assert.fail,
    go: (screen) => calls.push(['go', screen]),
    publicId: null,
    selected: null,
  });

  const record = activityResponse({ id: 9, distanceMeters: 500, elapsedMs: 1_200_000 });
  actions.writeJournalFromTracking({ ...record, distanceMeters: 499, completed: false });
  assert.deepEqual(calls.splice(0), [['error', JOURNAL_ELIGIBILITY_MESSAGE]]);
  actions.writeJournalFromTracking({ ...record, journalId: 21 });
  assert.equal(calls[0]?.[0], 'error');
  assert.equal(calls.length, 1);
  calls.length = 0;
  actions.writeJournalFromTracking(record);
  assert.deepEqual(calls, [
    ['go', 'write'],
    ['record', 9],
  ]);
});
