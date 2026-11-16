import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import type { HikingActivity } from '../src/api.ts';

const require = createRequire(import.meta.url);
const componentURL = new URL('../src/components/profile/HikingRecordCard.tsx', import.meta.url);
let source = readFileSync(componentURL, 'utf8').replace(/import '\.\/HikingRecordCard.css';/, '');
for (const specifier of [
  '../../services/activityCertification',
  '../hiking/services/scoringDisplay',
]) {
  source = source.replace(
    `'${specifier}'`,
    JSON.stringify(new URL(specifier + '.ts', componentURL).href),
  );
}
const code = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2023,
  },
}).outputText;
const moduleSource = `import * as React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};\n${code}`;
const { default: Card } = await import(
  'data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64')
);
const record = (overrides: Partial<HikingActivity> = {}): HikingActivity => ({
  id: 1,
  mountainId: 1,
  mountainName: '테스트산',
  courseId: 1,
  startedAt: '2026-11-15T01:00:00Z',
  endedAt: '2026-11-15T01:01:00Z',
  hikingDate: '2026-11-15',
  distanceMeters: 200,
  elapsedMs: 60000,
  completed: false,
  journalId: null,
  scoring: null,
  gpsValidationVersion: 1,
  ...overrides,
});
const certified = {
  status: 'CERTIFIED' as const,
  certificationDate: '2026-11-15',
  visitPoints: 200,
  summitPoints: 70,
  policyVersion: 'visit-general-or-verified-summit-multi-v2',
};
const render = (
  value: HikingActivity,
  children: React.ReactNode = React.createElement('button', null, '등산일지 작성'),
) => renderToStaticMarkup(React.createElement(Card, { record: value }, children));

test('short verified summit displays exact server scores, date and separately labelled distance/time', () => {
  const html = render(record({ completed: true, scoring: certified }));
  for (const text of [
    '테스트산',
    '2026-11-15',
    '인증 완등',
    '이동 거리',
    '산행 시간',
    '0.2',
    'km',
    'GPS 정상 인증',
    '확인됨',
    '방문 점수',
    '완등 점수',
    '200',
    '70',
    '등산일지 작성',
  ])
    assert.ok(html.includes(text), text);
  assert.match(html, /<time dateTime="2026-11-15">/);
  assert.equal((html.match(/<article /g) || []).length, 1);
});

test('noncertified records keep journal actions, split explanations and do not invent visit or GPS-distance certification', () => {
  for (const [name, distance, elapsed] of [
    ['테스트산', 0, 0],
    ['감악산 (경기)', 0, 0],
    ['원미산', 200, 60000],
  ] as const) {
    const html = render(
      record({
        mountainName: name,
        distanceMeters: distance,
        elapsedMs: elapsed,
        scoring: { ...certified, status: 'GPS_REQUIRED', visitPoints: 0, summitPoints: 0 },
      }),
    );
    assert.ok(html.includes(name));
    assert.match(html, /산행 종료/);
    assert.match(html, /산행 기록 저장 완료<\/p>/);
    assert.match(html, /유효한 GPS 거리 근거가 없어 산행 점수가 지급되지 않았습니다/);
    assert.match(html, /확인되지 않음/);
    assert.match(html, /등산일지 작성/);
    assert.doesNotMatch(html, /인증 완등|방문 인증|방문 점수/);
  }
});

test('legacy completion, missing scoring and every existing score status retain their meanings', () => {
  const legacy = render(record({ completed: true, gpsValidationVersion: null }));
  assert.match(legacy, /정상 도달 기록/);
  assert.doesNotMatch(legacy, /인증 완등/);
  assert.match(legacy, /인증·점수 산정 결과를 확인하지 못했습니다/);
  const below = render(
    record({ scoring: { ...certified, status: 'BELOW_MINIMUM', visitPoints: 0, summitPoints: 0 } }),
  );
  assert.match(below, /500m·일시정지 제외 20분 또는 GPS 정상 도달 조건 미충족/);
  const daily = render(
    record({ scoring: { ...certified, status: 'DAILY_LIMIT', visitPoints: 0, summitPoints: 0 } }),
  );
  assert.match(daily, /이전 정책의 일일 인증 제한/);
  const general = render(record({ scoring: { ...certified, visitPoints: 100, summitPoints: 0 } }));
  assert.match(general, /산행 인증/);
  assert.doesNotMatch(general, /인증 완등/);
  assert.match(general, /100/);
});

test('action elements and click handlers are preserved verbatim by the card', () => {
  for (const title of ['등산일지 작성', '등산일지 보기']) {
    let clicks = 0;
    const button = React.createElement(
      'button',
      {
        onClick: () => {
          clicks++;
        },
      },
      title,
    );
    const element = Card({ record: record(), children: button });
    const footer = React.Children.toArray(element.props.children).at(-1) as React.ReactElement<{
      children: typeof button;
    }>;
    assert.equal(footer.props.children, button);
    footer.props.children.props.onClick();
    assert.equal(clicks, 1);
  }
});

test('all records retain input order, safe escaped names and original metric rounding', () => {
  const records = [
    record({
      id: 7,
      mountainName: '<긴 산 이름>&'.repeat(10),
      distanceMeters: 149,
      elapsedMs: 119999,
    }),
    record({ id: 2, mountainName: '두번째 산' }),
  ];
  const html = renderToStaticMarkup(
    React.createElement(
      'section',
      null,
      records.map((r) => React.createElement(Card, { key: r.id, record: r }, null)),
    ),
  );
  assert.equal((html.match(/<article /g) || []).length, records.length);
  assert.ok(html.indexOf('hike-title-7') < html.indexOf('hike-title-2'));
  assert.match(html, /&lt;긴 산 이름&gt;&amp;/);
  assert.match(html, /<strong>0.1<\/strong>/);
  assert.match(html, /<strong>1<\/strong>/);
});

test('App keeps the journalId branch and existing navigation; list adds no filtering or sorting', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const section = app.slice(
    app.indexOf("{screen === 'hikingRecords' &&"),
    app.indexOf("{screen === 'accountSettings'"),
  );
  assert.match(section, /hikingRecords\.map/);
  assert.match(section, /HikingRecordDetails/);
  assert.match(section, /recordId=\{record\.id\}/);
  assert.doesNotMatch(section, /\.filter\(|\.sort\(|isRecognizedHike|isCertifiedActivity/);
  assert.match(section, /record\.journalId !== null/);
  assert.match(section, /openJournal\(record\.journalId!\)/);
  assert.match(section, /go\('write'\);\s*setSelectedRecordId\(record\.id\)/);
  assert.match(section, /저장된 등산기록이 없습니다/);
});

test('mobile cards wrap long text, keep spacing and avoid overflow at 280/320/375/430px', (t) => {
  const browser = process.env.TOPEAK_UI_BROWSER;
  if (!browser) {
    t.skip(
      'Set TOPEAK_UI_BROWSER to a working headless Chromium executable; sandbox GPU/renderer launch is unavailable here',
    );
    return;
  }
  const tempRoot = resolve(tmpdir());
  const folder = mkdtempSync(join(tempRoot, 'topeak-card-ui-'));
  assert.ok(
    resolve(folder).startsWith(tempRoot + '\\') || resolve(folder).startsWith(tempRoot + '/'),
  );
  try {
    const css =
      readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(
        /^@import.*$/gm,
        '',
      ) +
      readFileSync(new URL('../src/App.css', import.meta.url), 'utf8') +
      readFileSync(
        new URL('../src/components/profile/HikingRecordCard.css', import.meta.url),
        'utf8',
      );
    const html = [
      record({ mountainName: '아주긴산이름'.repeat(18) }),
      record({
        id: 2,
        scoring: { ...certified, status: 'BELOW_MINIMUM', visitPoints: 0, summitPoints: 0 },
      }),
    ]
      .map((r) => render(r))
      .join('');
    const file = join(folder, 'cards.html');
    writeFileSync(
      file,
      `<!doctype html><meta charset="utf-8"><style>${css}</style>
      <main id="fixture" class="scroll-content hiking-records-list">${html}</main><output id="result"></output>
      <script>const results=[];for(const width of [280,320,375,430]){
        const fixture=document.getElementById('fixture');fixture.style.width=width+'px';
        const cards=[...fixture.querySelectorAll('article')];
        const overflow=[fixture,...fixture.querySelectorAll('*')].some(e=>e.scrollWidth>e.clientWidth+1);
        const touch=[...fixture.querySelectorAll('button')].every(e=>e.getBoundingClientRect().height>=44);
        const spacing=cards[1].getBoundingClientRect().top-cards[0].getBoundingClientRect().bottom;
        results.push({width,overflow,touch,spacing});}
        document.getElementById('result').textContent=JSON.stringify(results);</script>`,
      'utf8',
    );
    const run = spawnSync(
      browser,
      [
        '--headless',
        '--disable-gpu',
        '--in-process-gpu',
        '--no-first-run',
        '--disable-background-networking',
        '--no-default-browser-check',
        '--user-data-dir=' + join(folder, 'profile'),
        '--dump-dom',
        pathToFileURL(file).href,
      ],
      { encoding: 'utf8', timeout: 30000, windowsHide: true },
    );
    assert.equal(run.status, 0, run.error?.message || run.stderr);
    const match = run.stdout.match(/<output id="result">([^<]+)<\/output>/);
    assert.ok(match, 'Headless browser did not return layout measurements');
    const sizes = JSON.parse(match[1]);
    for (const size of sizes) {
      assert.equal(size.overflow, false, JSON.stringify(size));
      assert.equal(size.touch, true, JSON.stringify(size));
      assert.ok(size.spacing >= 14, JSON.stringify(size));
    }
  } finally {
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
