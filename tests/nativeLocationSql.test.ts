import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Swift 소스의 SQL을 Node SQLite에서 실행하며 Swift 컴파일이나 iOS 동작을 검증하지는 않는다.
const source = readFileSync(new URL('../native/ios/LocationStore.swift', import.meta.url), 'utf8');
const multiline = [...source.matchAll(/try execute\("""\s*([\s\S]*?)\s*"""/g)].map((m) => m[1]);
const sql = (prefix: string) => {
  const found = multiline.find((s) => s.startsWith(prefix));
  assert.ok(found, `SQL not found: ${prefix}`);
  return found;
};
const single = (prefix: string) => {
  const found = [...source.matchAll(/try execute\("([^"\n]+)"/g)]
    .map((m) => m[1])
    .find((s) => s.startsWith(prefix));
  assert.ok(found, `SQL not found: ${prefix}`);
  return found;
};
function legacy() {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE sessions(id TEXT PRIMARY KEY NOT NULL,user_id INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('recording','stopped','interrupted','error')),
      started_at REAL NOT NULL,stopped_at REAL,error_code TEXT);
    CREATE TABLE points(sequence INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL REFERENCES sessions(id),
      timestamp REAL NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL,accuracy REAL NOT NULL,
      altitude REAL,speed REAL,UNIQUE(session_id,timestamp,latitude,longitude));
    INSERT INTO sessions VALUES('old',7,'recording',1000,NULL,NULL);
    INSERT INTO points VALUES(42,'old',2000,37,127,5,NULL,NULL);
    PRAGMA user_version=1;`);
  return db;
}
function migrate(db: DatabaseSync, fail = false) {
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try {
    db.exec(sql('CREATE TABLE sessions_v2'));
    db.exec(sql('INSERT INTO sessions_v2'));
    db.exec(single('DROP TABLE sessions'));
    if (fail) db.exec('SELECT forced_failure');
    db.exec(single('ALTER TABLE sessions_v2'));
    db.exec(single('ALTER TABLE points'));
    db.exec('PRAGMA user_version=2');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.exec('COMMIT; PRAGMA foreign_keys=ON');
  } catch (cause) {
    db.exec('ROLLBACK; PRAGMA foreign_keys=ON');
    throw cause;
  }
}

test('v1 SQLite migration preserves UUID/user/raw points/sequence and allows paused state (Node SQLite)', () => {
  const db = legacy();
  try {
    migrate(db);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 2);
    const old = db.prepare('SELECT * FROM sessions').get()!;
    assert.equal(old.id, 'old');
    assert.equal(old.user_id, 7);
    assert.equal(old.state, 'interrupted');
    assert.equal(old.accumulated_ms, 0); // 구버전에 없는 활동 시간을 추측해서 만들지 않는다.
    const point = db.prepare('SELECT * FROM points').get()!;
    assert.equal(point.sequence, 42);
    assert.equal(point.latitude, 37);
    assert.equal(point.timestamp, 2000);
    assert.equal(point.segment, 0);
    db.exec("UPDATE sessions SET state='paused'");
    db.prepare(sql('INSERT OR IGNORE INTO points')).run('old', 3000, 37.1, 127, 5, null, null, 1);
    assert.equal(db.prepare('SELECT MAX(sequence) AS n FROM points').get()!.n, 43);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('failed migration rolls back copied/dropped tables and retains the original schema and rows', () => {
  const db = legacy();
  try {
    assert.throws(() => migrate(db, true));
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 1);
    assert.equal(db.prepare('SELECT * FROM sessions').get()!.state, 'recording');
    assert.equal(db.prepare('SELECT sequence FROM points').get()!.sequence, 42);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='sessions_v2'").get()!.n,
      0,
    );
  } finally {
    db.close();
  }
});

test('restart retains only evidence-backed active time and clears recording before JS reconciliation', () => {
  const db = legacy();
  try {
    migrate(db);
    db.exec("UPDATE sessions SET state='recording',accumulated_ms=500,active_since=1500");
    db.exec(sql("UPDATE sessions SET state = 'interrupted'"));
    const stored = db.prepare('SELECT * FROM sessions').get()!;
    assert.equal(stored.accumulated_ms, 1000);
    assert.equal(stored.active_since, null);
    assert.equal(stored.state, 'interrupted');
    db.exec(sql("UPDATE sessions SET state = 'interrupted'"));
    assert.equal(db.prepare('SELECT accumulated_ms FROM sessions').get()!.accumulated_ms, 1000);
  } finally {
    db.close();
  }
});

test('new schema suppresses repeated native samples without destructive reads', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(sql('CREATE TABLE IF NOT EXISTS sessions'));
    db.exec(sql('CREATE TABLE IF NOT EXISTS points'));
    db.exec(
      "INSERT INTO sessions(id,user_id,state,started_at,active_since) VALUES('new',7,'recording',1000,1000)",
    );
    const insert = db.prepare(sql('INSERT OR IGNORE INTO points'));
    insert.run('new', 2000, 37, 127, 5, null, null, 0);
    insert.run('new', 2000, 37, 127, 5, null, null, 0);
    const querySource = source.match(
      /return try withStatement\("""\s*(SELECT sequence,[\s\S]*?)\s*"""/,
    )![1];
    const query = db.prepare(querySource);
    const first = query.all('new', 0, 501);
    assert.equal(first.length, 1);
    assert.deepEqual(query.all('new', 0, 501), first);
    assert.equal(query.all('new', first[0].sequence, 501).length, 0);
    assert.equal(db.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok');
  } finally {
    db.close();
  }
});
