import Foundation
import UIKit
import CoreLocation

/// 수집기는 앱 프로세스 동안 유지하며 WebView·플러그인 해제로 위치 관리자를 중지하지 않는다.
/// 모든 진입점과 델리게이트 콜백은 메인 큐에서 실행한다.
final class LocationRecorder: NSObject, CLLocationManagerDelegate {
    static let shared = LocationRecorder()
    private let manager = CLLocationManager()
    private var storage: LocationStore?
    private var active: StoredLocationSession?
    private var permissionRequests = [(Result<[String: Any], Error>) -> Void]()
    // SQLite에 오류 상태를 저장하지 못하더라도 메모리에 실패 정보를 유지한다.
    private var failures = [String: String]()
    private var collectionCutoffs = [String: Double]()

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
        manager.activityType = .fitness
    }

    private func store() throws -> LocationStore {
        precondition(Thread.isMainThread)
        if let storage = storage { return storage }
        let opened = try LocationStore()
        storage = opened
        return opened
    }

    func permissions() -> [String: Any] {
        let authorization: String
        switch manager.authorizationStatus {
        case .notDetermined: authorization = "notDetermined"
        case .restricted: authorization = "restricted"
        case .denied: authorization = "denied"
        case .authorizedWhenInUse: authorization = "whenInUse"
        case .authorizedAlways: authorization = "always"
        @unknown default: authorization = "restricted"
        }
        return ["authorization": authorization,
                "servicesEnabled": CLLocationManager.locationServicesEnabled(),
                "precise": manager.accuracyAuthorization == .fullAccuracy]
    }

    func requestPermissions(_ completion: @escaping (Result<[String: Any], Error>) -> Void) {
        precondition(Thread.isMainThread)
        guard CLLocationManager.locationServicesEnabled() else {
            completion(.failure(LocationFailure(code: "LOCATION_SERVICES_DISABLED", message: "Enable iOS Location Services.")))
            return
        }
        guard manager.authorizationStatus == .notDetermined else {
            completion(.success(permissions()))
            return
        }
        guard let description = Bundle.main.object(forInfoDictionaryKey: "NSLocationWhenInUseUsageDescription") as? String,
              !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            completion(.failure(LocationFailure(code: "PERMISSION_REQUIRED", message: "Configure the iOS location permission description first.")))
            return
        }
        guard UIApplication.shared.applicationState == .active else {
            completion(.failure(LocationFailure(code: "PERMISSION_REQUIRED", message: "Request location permission in the foreground.")))
            return
        }
        permissionRequests.append(completion)
        if permissionRequests.count == 1 { manager.requestWhenInUseAuthorization() }
    }

    func start(_ key: LocationSessionKey) throws -> [String: Any] {
        reconcileAvailability()
        let database = try store()
        if let existing = try database.session(key) {
            if existing.state == "stopped" { return try status(key) }
            if existing.state == "recording", active?.key == key { return try status(key) }
            let code = failures[key.clientRequestId] ?? existing.errorCode ?? "SERVICE_INTERRUPTED"
            throw LocationFailure(code: code, message: "This session cannot be restarted. Read and explicitly stop it first.")
        }
        guard active == nil else {
            throw LocationFailure(code: "SESSION_CONFLICT", message: "Another native session is collecting location.")
        }
        guard CLLocationManager.locationServicesEnabled() else {
            throw LocationFailure(code: "LOCATION_SERVICES_DISABLED", message: "Enable iOS Location Services.")
        }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: break
        case .notDetermined:
            throw LocationFailure(code: "PERMISSION_REQUIRED", message: "Request location permission before starting.")
        default:
            throw LocationFailure(code: "PERMISSION_DENIED", message: "Location permission is denied or restricted.")
        }
        guard UIApplication.shared.applicationState == .active else {
            throw LocationFailure(code: "SERVICE_INTERRUPTED", message: "Start location collection in the foreground.")
        }
        let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []
        guard modes.contains("location") else {
            throw LocationFailure(code: "SERVICE_INTERRUPTED", message: "Configure the iOS location background mode first.")
        }
        let startedAt = nowMs()
        try database.create(key, startedAt: startedAt)
        active = StoredLocationSession(key: key, state: "recording", startedAt: startedAt,
                                       stoppedAt: nil, errorCode: nil, activeSince: startedAt,
                                       accumulatedMs: 0, segment: 0)
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        manager.startUpdatingLocation()
        return try status(key)
    }

    func stop(_ key: LocationSessionKey) throws -> [String: Any] {
        let database = try store()
        guard let existing = try database.session(key) else { return try status(key) }
        if existing.state == "stopped" { return try status(key) }
        if active?.key == key { stopManager() }
        do {
            try database.transition(existing, state: "stopped", errorCode: nil,
                                    at: existing.activeSince == nil ? nowMs()
                                        : (collectionCutoffs[key.clientRequestId] ?? nowMs()))
            failures.removeValue(forKey: key.clientRequestId)
        } catch {
            failures[key.clientRequestId] = "STORAGE_ERROR"
            throw error
        }
        return try status(key)
    }

    func pause(_ key: LocationSessionKey) throws -> [String: Any] {
        let database = try store()
        guard let existing = try database.session(key) else { return try status(key) }
        if existing.state != "recording" { return try status(key) }
        if active?.key == key { stopManager() }
        do {
            try database.transition(existing, state: "paused", errorCode: nil,
                                    at: collectionCutoffs[key.clientRequestId] ?? nowMs())
            failures.removeValue(forKey: key.clientRequestId)
        } catch {
            failures[key.clientRequestId] = "STORAGE_ERROR"
            throw error
        }
        return try status(key)
    }

    func resume(_ key: LocationSessionKey) throws -> [String: Any] {
        reconcileAvailability()
        let database = try store()
        guard var existing = try database.session(key) else {
            throw LocationFailure(code: "NOT_FOUND", message: "No such native location session.")
        }
        if existing.state == "recording", active?.key == key { return try status(key) }
        guard existing.state != "stopped" else {
            throw LocationFailure(code: "SESSION_CLOSED", message: "A finalized session cannot resume.")
        }
        guard active == nil else {
            throw LocationFailure(code: "SESSION_CONFLICT", message: "Another native session is collecting location.")
        }
        if existing.state == "recording" {
            guard let cutoff = collectionCutoffs[key.clientRequestId] else {
                throw LocationFailure(code: "SERVICE_INTERRUPTED", message: "Reconcile the interrupted collector before resuming.")
            }
            // 이전 중지 요청이 Core Location만 멈추고 중지 경계 저장에는 실패했을 수 있다.
            // 저장소가 복구되어도 그동안 수집이 멈춘 시간을 활동 시간에 더하지 않는다.
            try database.transition(existing, state: "paused", errorCode: nil, at: cutoff)
            guard let reconciled = try database.session(key) else {
                throw LocationFailure(code: "STORAGE_ERROR", message: "Cannot reconcile the location boundary.")
            }
            existing = reconciled
            failures.removeValue(forKey: key.clientRequestId)
        }
        guard CLLocationManager.locationServicesEnabled() else {
            throw LocationFailure(code: "LOCATION_SERVICES_DISABLED", message: "Enable iOS Location Services.")
        }
        guard manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse else {
            throw LocationFailure(code: "PERMISSION_DENIED", message: "Allow location permission before resuming.")
        }
        guard UIApplication.shared.applicationState == .active else {
            throw LocationFailure(code: "SERVICE_INTERRUPTED", message: "Resume location collection in the foreground.")
        }
        let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []
        guard modes.contains("location") else {
            throw LocationFailure(code: "SERVICE_INTERRUPTED", message: "Configure the iOS location background mode first.")
        }
        try database.transition(existing, state: "recording", errorCode: nil,
                                at: nowMs())
        active = try database.session(key)
        collectionCutoffs.removeValue(forKey: key.clientRequestId)
        failures.removeValue(forKey: key.clientRequestId)
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        manager.startUpdatingLocation()
        return try status(key)
    }

    func status(_ key: LocationSessionKey) throws -> [String: Any] {
        reconcileAvailability()
        let database = try store()
        var result = permissions()
        guard let session = try database.session(key) else {
            result["session"] = NSNull()
            return result
        }
        let summary = try database.summary(key)
        let failure = failures[key.clientRequestId] ?? session.errorCode
        // 일시적인 위치 수신 실패는 알리되 수집 자체가 중단된 것으로 처리하지 않는다.
        let stoppedByFailure = failures[key.clientRequestId] != nil && active?.key != key
        result["session"] = [
            "userId": key.userId, "clientRequestId": key.clientRequestId,
            "state": stoppedByFailure ? "error" : session.state,
            "startedAt": session.startedAt,
            "stoppedAt": session.stoppedAt.map { $0 as Any } ?? NSNull(),
            "pointCount": summary.count,
            "lastRecordedAt": summary.last.map { $0 as Any } ?? NSNull(),
            "errorCode": failure.map { $0 as Any } ?? NSNull(),
            "activeSince": stoppedByFailure ? NSNull() : (session.activeSince.map { $0 as Any } ?? NSNull()),
            "accumulatedMs": (session.accumulatedMs + (stoppedByFailure
                ? session.activeSince.map { max(0, (collectionCutoffs[key.clientRequestId] ?? $0) - $0) } ?? 0
                : 0)).rounded(.down),
            "segment": session.segment, "lastSequence": summary.sequence
        ] as [String: Any]
        return result
    }

    func read(_ key: LocationSessionKey, after: Int64, limit: Int) throws -> [String: Any] {
        try store().read(key, after: after, limit: limit)
    }

    func handleStorageFailure(_ error: Error) {
        if (error as? LocationFailure)?.code == "STORAGE_ERROR" { failActive("STORAGE_ERROR") }
    }

    private func stopManager() {
        if let session = active { collectionCutoffs[session.key.clientRequestId] = nowMs() }
        active = nil // 중지·실패 후 늦게 도착한 콜백이 좌표를 추가하지 못하게 한다.
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        manager.showsBackgroundLocationIndicator = false
    }

    private func nowMs() -> Double { (Date().timeIntervalSince1970 * 1000).rounded(.down) }

    private func failActive(_ code: String) {
        guard let session = active else { return }
        stopManager()
        failures[session.key.clientRequestId] = code
        do {
            try store().transition(session, state: "error", errorCode: code,
                                   at: collectionCutoffs[session.key.clientRequestId] ?? nowMs())
        } catch {
            failures[session.key.clientRequestId] = "STORAGE_ERROR"
        }
    }

    private func reconcileAvailability() {
        guard active != nil else { return }
        if !CLLocationManager.locationServicesEnabled() {
            failActive("LOCATION_SERVICES_DISABLED")
        } else if manager.authorizationStatus != .authorizedAlways && manager.authorizationStatus != .authorizedWhenInUse {
            failActive("PERMISSION_DENIED")
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        reconcileAvailability()
        if manager.authorizationStatus != .notDetermined {
            let requests = permissionRequests
            permissionRequests.removeAll()
            for completion in requests { completion(.success(permissions())) }
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        reconcileAvailability()
        guard let session = active else { return }
        do {
            try store().append(locations, to: session)
            failures.removeValue(forKey: session.key.clientRequestId)
            // 좌표 저장에는 JS 콜백이 필요 없으며 화면 복귀 시 호출자가 readPoints로 조회한다.
        } catch {
            failActive("STORAGE_ERROR")
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard let session = active else { return }
        if let coreError = error as? CLError {
            if coreError.code == .locationUnknown {
                failures[session.key.clientRequestId] = "LOCATION_UNAVAILABLE"
                return // 일시적인 위치 수신 실패이므로 다음 표본을 기다린다.
            }
            if coreError.code == .denied {
                failActive(CLLocationManager.locationServicesEnabled() ? "PERMISSION_DENIED" : "LOCATION_SERVICES_DISABLED")
                return
            }
        }
        failActive("SERVICE_INTERRUPTED")
    }

    func locationManagerDidPauseLocationUpdates(_ manager: CLLocationManager) {
        failActive("SERVICE_INTERRUPTED")
    }
}
