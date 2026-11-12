import Foundation
import CoreLocation
import SQLite3

struct LocationFailure: Error {
    let code: String
    let message: String
}

struct LocationSessionKey: Equatable {
    let userId: Int64
    let clientRequestId: String
}

struct StoredLocationSession {
    let key: LocationSessionKey
    let state: String
    let startedAt: Double
    let stoppedAt: Double?
    let errorCode: String?
    let activeSince: Double?
    let accumulatedMs: Double
    let segment: Int64
}

/// LocationRecorder가 메인 큐에서만 접근하며 JavaScript 실행에 의존하지 않는다.
final class LocationStore {
    private var db: OpaquePointer?
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private enum Value {
        case text(String), number(Double), integer(Int64), null
    }

    init() throws {
        do {
            let manager = FileManager.default
            var directory = try manager.url(
                for: .applicationSupportDirectory, in: .userDomainMask,
                appropriateFor: nil, create: true
            ).appendingPathComponent("ToPeakLocation", isDirectory: true)
            let protection = FileProtectionType.completeUntilFirstUserAuthentication
            try manager.createDirectory(at: directory, withIntermediateDirectories: true,
                                        attributes: [.protectionKey: protection])
            try manager.setAttributes([.protectionKey: protection], ofItemAtPath: directory.path)
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = true
            try directory.setResourceValues(resourceValues)
            let file = directory.appendingPathComponent("locations.sqlite")
            guard sqlite3_open_v2(file.path, &db,
                                 SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX,
                                 nil) == SQLITE_OK else { throw storageFailure() }
            try manager.setAttributes([.protectionKey: protection], ofItemAtPath: file.path)
            sqlite3_busy_timeout(db, 1000)
            try execute("PRAGMA foreign_keys = ON")
            try execute("PRAGMA journal_mode = DELETE")
            try execute("PRAGMA synchronous = FULL")
            let version = try withStatement("PRAGMA user_version") { statement -> Int32 in
                guard sqlite3_step(statement) == SQLITE_ROW else { throw self.storageFailure() }
                return sqlite3_column_int(statement, 0)
            }
            guard version >= 0 && version <= 2 else {
                throw LocationFailure(code: "STORAGE_ERROR", message: "Unsupported location database version.")
            }
            // CHECK 제약을 확장하기 위해 v1 sessions 테이블만 다시 구성한다.
            // 연결을 사용하기 전에 외래 키 검사를 다시 켜고 참조 무결성을 확인한다.
            if version == 1 { try execute("PRAGMA foreign_keys = OFF") }
            try transaction {
                if version == 1 {
                    try execute("""
                        CREATE TABLE sessions_v2 (
                            id TEXT PRIMARY KEY NOT NULL, user_id INTEGER NOT NULL,
                            state TEXT NOT NULL CHECK(state IN ('recording','paused','stopped','interrupted','error')),
                            started_at REAL NOT NULL, stopped_at REAL, error_code TEXT,
                            active_since REAL, accumulated_ms REAL NOT NULL DEFAULT 0,
                            segment INTEGER NOT NULL DEFAULT 0
                        )
                        """)
                    try execute("""
                        INSERT INTO sessions_v2(id,user_id,state,started_at,stopped_at,error_code)
                        SELECT id,user_id,CASE WHEN state='recording' THEN 'interrupted' ELSE state END,
                               started_at,stopped_at,
                               CASE WHEN state='recording' THEN 'SERVICE_INTERRUPTED' ELSE error_code END
                        FROM sessions
                        """)
                    try execute("DROP TABLE sessions")
                    try execute("ALTER TABLE sessions_v2 RENAME TO sessions")
                    try execute("ALTER TABLE points ADD COLUMN segment INTEGER NOT NULL DEFAULT 0")
                }
                try execute("""
                    CREATE TABLE IF NOT EXISTS sessions (
                        id TEXT PRIMARY KEY NOT NULL,
                        user_id INTEGER NOT NULL,
                        state TEXT NOT NULL CHECK(state IN ('recording','paused','stopped','interrupted','error')),
                        started_at REAL NOT NULL,
                        stopped_at REAL,
                        error_code TEXT,
                        active_since REAL,
                        accumulated_ms REAL NOT NULL DEFAULT 0,
                        segment INTEGER NOT NULL DEFAULT 0
                    )
                    """)
                try execute("""
                    CREATE TABLE IF NOT EXISTS points (
                        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL REFERENCES sessions(id),
                        timestamp REAL NOT NULL,
                        latitude REAL NOT NULL,
                        longitude REAL NOT NULL,
                        accuracy REAL NOT NULL,
                        altitude REAL,
                        speed REAL,
                        segment INTEGER NOT NULL DEFAULT 0,
                        UNIQUE(session_id, timestamp, latitude, longitude)
                    )
                    """)
                try execute("CREATE INDEX IF NOT EXISTS points_session_sequence ON points(session_id, sequence)")
                try execute("PRAGMA user_version = 2")
                // 새 프로세스에서는 이전 프로세스의 위치 수집이 계속된다고 간주하지 않는다.
                try execute("""
                    UPDATE sessions SET state = 'interrupted', error_code = 'SERVICE_INTERRUPTED',
                        accumulated_ms = accumulated_ms + CASE WHEN active_since IS NULL THEN 0
                            ELSE MAX(0, COALESCE((SELECT MAX(timestamp) FROM points WHERE session_id=sessions.id), active_since) - active_since) END,
                        active_since = NULL
                    WHERE state = 'recording'
                    """)
                try withStatement("PRAGMA foreign_key_check") { statement in
                    guard sqlite3_step(statement) == SQLITE_DONE else { throw self.storageFailure() }
                }
            }
            try execute("PRAGMA foreign_keys = ON")
        } catch {
            if let db = db { sqlite3_close(db) }
            db = nil
            if let failure = error as? LocationFailure { throw failure }
            throw LocationFailure(code: "STORAGE_ERROR", message: "Cannot open the protected location database.")
        }
    }

    deinit {
        if let db = db { sqlite3_close(db) }
    }

    func session(_ key: LocationSessionKey) throws -> StoredLocationSession? {
        try withStatement(
            "SELECT user_id, state, started_at, stopped_at, error_code, active_since, accumulated_ms, segment FROM sessions WHERE id = ?",
            [.text(key.clientRequestId)]
        ) { statement in
            let result = sqlite3_step(statement)
            if result == SQLITE_DONE { return nil }
            guard result == SQLITE_ROW else { throw self.storageFailure() }
            guard sqlite3_column_int64(statement, 0) == key.userId else {
                throw LocationFailure(code: "SESSION_CONFLICT", message: "Session belongs to another user.")
            }
            return StoredLocationSession(
                key: key, state: self.text(statement, 1)!, startedAt: sqlite3_column_double(statement, 2),
                stoppedAt: self.optionalDouble(statement, 3), errorCode: self.text(statement, 4),
                activeSince: self.optionalDouble(statement, 5), accumulatedMs: sqlite3_column_double(statement, 6),
                segment: sqlite3_column_int64(statement, 7)
            )
        }
    }

    func create(_ key: LocationSessionKey, startedAt: Double) throws {
        try execute(
            "INSERT INTO sessions(id, user_id, state, started_at, active_since) VALUES (?, ?, 'recording', ?, ?)",
            [.text(key.clientRequestId), .integer(key.userId), .number(startedAt), .number(startedAt)]
        )
    }

    func transition(_ session: StoredLocationSession, state: String, errorCode: String?, at: Double) throws {
        let duration = session.accumulatedMs + (session.activeSince.map { max(0, at - $0) } ?? 0)
        let resuming = state == "recording"
        try execute(
            "UPDATE sessions SET state = ?, error_code = ?, stopped_at = ?, active_since = ?, accumulated_ms = ?, segment = ? WHERE id = ? AND user_id = ?",
            [.text(state), errorCode.map(Value.text) ?? .null,
             state == "stopped" ? .number(at) : .null,
             resuming ? .number(at) : .null, .number(duration.rounded(.down)),
             .integer(session.segment + (resuming ? 1 : 0)),
             .text(session.key.clientRequestId), .integer(session.key.userId)]
        )
    }

    /// 전체 CLLocation 묶음의 저장을 완료한 뒤 호출자가 lastRecordedAt을 갱신한다.
    func append(_ locations: [CLLocation], to session: StoredLocationSession) throws {
        try transaction {
            for location in locations {
                let time = (location.timestamp.timeIntervalSince1970 * 1000).rounded(.down)
                let coordinate = location.coordinate
                guard CLLocationCoordinate2DIsValid(coordinate),
                      time.isFinite, time >= (session.activeSince ?? session.startedAt), time <= Date().timeIntervalSince1970 * 1000,
                      location.horizontalAccuracy.isFinite, location.horizontalAccuracy >= 0 else { continue }
                let altitude: Value = location.verticalAccuracy >= 0 && location.altitude.isFinite
                    ? .number(location.altitude) : .null
                let speed: Value = location.speed >= 0 && location.speed.isFinite
                    ? .number(location.speed) : .null
                try execute("""
                    INSERT OR IGNORE INTO points
                    (session_id, timestamp, latitude, longitude, accuracy, altitude, speed, segment)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, [.text(session.key.clientRequestId), .number(time), .number(coordinate.latitude),
                          .number(coordinate.longitude), .number(location.horizontalAccuracy), altitude, speed,
                          .integer(session.segment)])
            }
        }
    }

    func summary(_ key: LocationSessionKey) throws -> (count: Int64, last: Double?, sequence: Int64) {
        try withStatement("SELECT COUNT(*), MAX(timestamp), COALESCE(MAX(sequence),0) FROM points WHERE session_id = ?",
                          [.text(key.clientRequestId)]) { statement in
            guard sqlite3_step(statement) == SQLITE_ROW else { throw self.storageFailure() }
            return (sqlite3_column_int64(statement, 0), self.optionalDouble(statement, 1), sqlite3_column_int64(statement, 2))
        }
    }

    func read(_ key: LocationSessionKey, after: Int64, limit: Int) throws -> [String: Any] {
        guard try session(key) != nil else {
            throw LocationFailure(code: "NOT_FOUND", message: "No such native location session.")
        }
        return try withStatement("""
            SELECT sequence, timestamp, latitude, longitude, accuracy, altitude, speed, segment
            FROM points WHERE session_id = ? AND sequence > ? ORDER BY sequence LIMIT ?
            """, [.text(key.clientRequestId), .integer(after), .integer(Int64(limit + 1))]) { statement in
            var points = [[String: Any]]()
            var result = sqlite3_step(statement)
            while result == SQLITE_ROW {
                points.append([
                    "sequence": sqlite3_column_int64(statement, 0),
                    "timestamp": sqlite3_column_double(statement, 1),
                    "latitude": sqlite3_column_double(statement, 2),
                    "longitude": sqlite3_column_double(statement, 3),
                    "accuracy": sqlite3_column_double(statement, 4),
                    "altitude": self.optionalDouble(statement, 5).map { $0 as Any } ?? NSNull(),
                    "speed": self.optionalDouble(statement, 6).map { $0 as Any } ?? NSNull(),
                    "segment": sqlite3_column_int64(statement, 7)
                ])
                result = sqlite3_step(statement)
            }
            guard result == SQLITE_DONE else { throw self.storageFailure() }
            let hasMore = points.count > limit
            if hasMore { points.removeLast() }
            return ["points": points, "hasMore": hasMore,
                    "nextSequence": points.last?["sequence"] as? Int64 ?? after]
        }
    }

    private func transaction<T>(_ operation: () throws -> T) throws -> T {
        try execute("BEGIN IMMEDIATE")
        do {
            let result = try operation()
            try execute("COMMIT")
            return result
        } catch {
            // 롤백을 시도하되 롤백 실패로 최초 저장 오류를 덮어쓰지 않는다.
            try? execute("ROLLBACK")
            throw error
        }
    }

    private func execute(_ sql: String, _ values: [Value] = []) throws {
        try withStatement(sql, values) { statement in
            var result = sqlite3_step(statement)
            while result == SQLITE_ROW { result = sqlite3_step(statement) }
            guard result == SQLITE_DONE else { throw self.storageFailure() }
        }
    }

    private func withStatement<T>(
        _ sql: String, _ values: [Value] = [], _ operation: (OpaquePointer) throws -> T
    ) throws -> T {
        var prepared: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &prepared, nil) == SQLITE_OK, let statement = prepared else {
            if let prepared = prepared { sqlite3_finalize(prepared) }
            throw storageFailure()
        }
        defer { sqlite3_finalize(statement) }
        for (offset, value) in values.enumerated() {
            let index = Int32(offset + 1)
            let result: Int32
            switch value {
            case .text(let string):
                result = string.withCString { sqlite3_bind_text(statement, index, $0, -1, transient) }
            case .number(let number): result = sqlite3_bind_double(statement, index, number)
            case .integer(let integer): result = sqlite3_bind_int64(statement, index, integer)
            case .null: result = sqlite3_bind_null(statement, index)
            }
            guard result == SQLITE_OK else { throw storageFailure() }
        }
        return try operation(statement)
    }

    private func text(_ statement: OpaquePointer, _ column: Int32) -> String? {
        guard let value = sqlite3_column_text(statement, column) else { return nil }
        return String(cString: value)
    }

    private func optionalDouble(_ statement: OpaquePointer, _ column: Int32) -> Double? {
        sqlite3_column_type(statement, column) == SQLITE_NULL ? nil : sqlite3_column_double(statement, column)
    }

    private func storageFailure() -> LocationFailure {
        LocationFailure(code: "STORAGE_ERROR", message: "Location SQLite operation failed (\(sqlite3_errcode(db))).")
    }
}
