import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activityResponse } from './fixtures.ts';
import {
  canCreateHikingJournal,
  JOURNAL_ELIGIBILITY_MESSAGE,
} from '../src/services/journalEligibility.ts';
import { isRecognizedHike } from '../src/services/activityCertification.ts';

test('journal eligibility reuses recognized hiking boundaries without requiring GPS points or scoring', () => {
  const cases = [
    { distanceMeters: 500, elapsedMs: 1200000, allowed: true },
    { distanceMeters: 499, elapsedMs: 1200000, allowed: false },
    { distanceMeters: 499.999, elapsedMs: 1200000, allowed: false },
    { distanceMeters: 500, elapsedMs: 1140000, allowed: false },
    { distanceMeters: 500, elapsedMs: 1199999, allowed: false },
    { distanceMeters: 600, elapsedMs: 1500000, allowed: true },
    { distanceMeters: 0, elapsedMs: 0, allowed: false },
  ];
  for (const c of cases) {
    const activity = activityResponse({
      ...c,
      completed: false,
      gpsValidationVersion: null,
      scoring: null,
    });
    assert.equal(canCreateHikingJournal(activity), c.allowed, JSON.stringify(c));
    assert.equal(canCreateHikingJournal(activity), isRecognizedHike(activity));
  }
});

test('short server-verified summits qualify but legacy completion and scoring alone never establish eligibility', () => {
  const short = activityResponse({
    distanceMeters: 200,
    elapsedMs: 60000,
    completed: true,
    gpsValidationVersion: 1,
  });
  assert.equal(canCreateHikingJournal(short), true);
  assert.equal(canCreateHikingJournal({ ...short, gpsValidationVersion: null }), false);
  assert.equal(canCreateHikingJournal({ ...short, gpsValidationVersion: 2 }), false);
  assert.equal(canCreateHikingJournal({ ...short, completed: false }), false);
  assert.equal(
    canCreateHikingJournal({
      ...short,
      completed: false,
      scoring: {
        status: 'CERTIFIED',
        certificationDate: '2026-01-01',
        visitPoints: 200,
        summitPoints: 70,
        policyVersion: 'legacy',
      },
    }),
    false,
  );
});

test('same-day and same-mountain activities stay independent; linked journals block only new creation', () => {
  const activities = [1, 2, 3].map((id) => activityResponse({ id, mountainId: 1 }));
  assert.equal(activities.filter(canCreateHikingJournal).length, 3);
  const linked = { ...activities[0], journalId: 9 };
  assert.equal(canCreateHikingJournal(linked), false);
  assert.equal(canCreateHikingJournal({ ...linked, journalId: null }), true);
  assert.equal(canCreateHikingJournal(null), false);
  assert.equal(canCreateHikingJournal(undefined), false);
});

test('UI checks list candidates, selected-record submission, direct entry and card action while preserving existing journal viewing', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /availableRecords = hikingRecords\.filter\(canCreateHikingJournal\)/);
  const save = app.slice(
    app.indexOf('const saveJournal ='),
    app.indexOf('const saveJournal =') + 1400,
  );
  assert.match(save, /!editing && selectedRecord && !canCreateHikingJournal\(selectedRecord\)/);
  assert.ok(
    save.indexOf('!canCreateHikingJournal(selectedRecord)') < save.indexOf('createJournal('),
  );
  assert.match(app, /!editing && selectedRecord && !canCreateHikingJournal\(selectedRecord\) &&/);
  assert.match(app, /busy \|\| \(!editing && !canCreateHikingJournal\(selectedRecord\)\)/);
  const cards = app.slice(
    app.indexOf("{screen === 'hikingRecords' &&"),
    app.indexOf("{screen === 'accountSettings'"),
  );
  assert.match(
    cards,
    /record\.journalId !== null \? \(\s*<button onClick=\{\(\) => openJournal\(record\.journalId!\)\}/,
  );
  assert.match(cards, /disabled=\{!canCreateHikingJournal\(record\)\}/);
  assert.match(cards, /if \(!canCreateHikingJournal\(record\)\) return;/);
  assert.match(cards, /JOURNAL_ELIGIBILITY_MESSAGE/);
  assert.match(JOURNAL_ELIGIBILITY_MESSAGE, /500m/);
  assert.match(JOURNAL_ELIGIBILITY_MESSAGE, /20분/);
});
