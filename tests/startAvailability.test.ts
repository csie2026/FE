import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { startAvailability } from '../src/components/hiking/services/startAvailability.ts';
import type { GpsPoint, LocationStatus } from '../src/components/hiking/types.ts';

const start = { lat: 0, lng: 0 };
const now = 100_000;
const point = (meters = 0): GpsPoint => ({
  lat: ((meters / 6_371_000) * 180) / Math.PI,
  lng: 0,
  latitude: 0,
  longitude: 0,
  accuracy: 50,
  timestamp: now,
  altitude: null,
  speed: null,
});
const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL('../src/components/hiking/HikingControls.tsx', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2023,
  },
}).outputText;
const { default: Controls } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(
      `import * as React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};\n${code}`,
    ).toString('base64')
);
const render = (canStart: boolean, state = 'READY') =>
  renderToStaticMarkup(
    React.createElement(Controls, {
      state,
      canStart,
      start() {},
      pause() {},
      resume() {},
      complete() {},
      reset() {},
    }),
  );

test('출발점 거리의 반올림 전 49.999m·50m는 활성화하고 50.001m는 비활성화한다', () => {
  for (const meters of [49.999, 50, 50.001]) {
    const result = startAvailability(start, point(meters), 'AVAILABLE', now);
    assert.equal(result.allowed, meters <= 50);
    assert.equal(render(result.allowed).includes('disabled=""'), meters > 50);
  }
  assert.match(startAvailability(start, point(1000), 'AVAILABLE', now).message, /1000.00m/);
});

test('위치 확인 중·권한 거부·실패·타임아웃·미수신에서는 이전 좌표가 있어도 비활성화한다', () => {
  for (const status of [
    'IDLE',
    'REQUESTING',
    'DENIED',
    'UNAVAILABLE',
    'TIMEOUT',
  ] as LocationStatus[]) {
    assert.equal(startAvailability(start, point(), status, now).allowed, false);
  }
  assert.equal(startAvailability(start, null, 'AVAILABLE', now).allowed, false);
});

test('기존 정확도·최신성·좌표 유효성 기준과 출발점 필수 조건을 유지한다', () => {
  assert.equal(startAvailability(start, point(), 'AVAILABLE', now).allowed, true);
  for (const overrides of [
    { accuracy: 50.001 },
    { accuracy: -1 },
    { lat: NaN },
    { lng: 181 },
    { timestamp: now - 15_001 },
    { timestamp: now + 1 },
  ])
    assert.equal(
      startAvailability(start, { ...point(), ...overrides }, 'AVAILABLE', now).allowed,
      false,
    );
  assert.equal(
    startAvailability(start, { ...point(), timestamp: now - 15_000 }, 'AVAILABLE', now).allowed,
    true,
  );
  assert.equal(startAvailability({ lat: NaN, lng: 0 }, point(), 'AVAILABLE', now).allowed, false);
});

test('이동 후 범위를 벗어나거나 표본이 만료되면 비활성화하고 새 유효 표본으로 다시 활성화한다', () => {
  assert.equal(startAvailability(start, point(), 'AVAILABLE', now).allowed, true);
  assert.equal(startAvailability(start, point(51), 'AVAILABLE', now).allowed, false);
  assert.equal(startAvailability(start, point(), 'AVAILABLE', now + 15_001).allowed, false);
  assert.equal(
    startAvailability(start, { ...point(), timestamp: now + 16_000 }, 'AVAILABLE', now + 16_000)
      .allowed,
    true,
  );
});

test('시작 버튼 자격이 없더라도 일시정지·재개 버튼에는 적용하지 않는다', () => {
  assert.doesNotMatch(render(false, 'TRACKING'), /disabled/);
  assert.doesNotMatch(render(false, 'PAUSED'), /disabled/);
});
