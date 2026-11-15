import Foundation
import Capacitor
import CoreLocation
import UIKit

@objc(ToPeakBackgroundLocationPlugin)
public class ToPeakBackgroundLocationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ToPeakBackgroundLocationPlugin"
    public let jsName = "ToPeakBackgroundLocation"
    private var startLocationRequest: StartLocationRequest?
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStartPosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readPoints", returnType: CAPPluginReturnPromise)
    ]

    @objc func getStartPosition(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.startLocationRequest == nil else {
                call.reject("A location check is already pending.", "NATIVE_ERROR")
                return
            }
            let request = StartLocationRequest()
            self.startLocationRequest = request
            request.prepare { result in
                self.startLocationRequest = nil
                switch result {
                case .success(let position): call.resolve(position)
                case .failure(let error): self.reject(call, error)
                }
            }
            // 기존 권한 요청 정책을 재사용하며 산행 수집기·DB에는 접근하지 않는다.
            LocationRecorder.shared.requestPermissions { result in
                switch result {
                case .failure(let error):
                    request.fail(error)
                case .success:
                    request.start()
                }
            }
        }
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            LocationRecorder.shared.requestPermissions { result in
                switch result {
                case .success(let permissions): call.resolve(permissions)
                case .failure(let error): self.reject(call, error)
                }
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        perform(call) { try LocationRecorder.shared.start(self.key(call)) }
    }

    @objc func stop(_ call: CAPPluginCall) {
        perform(call) { try LocationRecorder.shared.stop(self.key(call)) }
    }

    @objc func pause(_ call: CAPPluginCall) {
        perform(call) { try LocationRecorder.shared.pause(self.key(call)) }
    }

    @objc func resume(_ call: CAPPluginCall) {
        perform(call) { try LocationRecorder.shared.resume(self.key(call)) }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        perform(call) { try LocationRecorder.shared.status(self.key(call)) }
    }

    @objc func readPoints(_ call: CAPPluginCall) {
        perform(call) {
            let after = try self.integer(call, "afterSequence", defaultValue: 0, minimum: 0)
            let limit = try self.integer(call, "limit", defaultValue: 500, minimum: 1)
            guard limit <= 1000 else {
                throw LocationFailure(code: "INVALID_ARGUMENT", message: "Read limit must be 1–1000.")
            }
            return try LocationRecorder.shared.read(self.key(call), after: after, limit: Int(limit))
        }
    }

    private func perform(_ call: CAPPluginCall, _ action: @escaping () throws -> [String: Any]) {
        DispatchQueue.main.async {
            do { call.resolve(try action()) }
            catch {
                LocationRecorder.shared.handleStorageFailure(error)
                self.reject(call, error)
            }
        }
    }

    private func reject(_ call: CAPPluginCall, _ error: Error) {
        if let failure = error as? LocationFailure {
            call.reject(failure.message, failure.code)
        } else {
            call.reject("Native location operation failed.", "NATIVE_ERROR")
        }
    }

    private func integer(_ call: CAPPluginCall, _ name: String, defaultValue: Int64? = nil,
                         minimum: Double = 1) throws -> Int64 {
        if call.options[name] == nil, let defaultValue = defaultValue { return defaultValue }
        guard let value = call.getDouble(name), value.isFinite, value >= minimum,
              value <= 9_007_199_254_740_991, value.rounded(.towardZero) == value else {
            throw LocationFailure(code: "INVALID_ARGUMENT", message: "Invalid integer argument: \(name).")
        }
        return Int64(value)
    }

    private func key(_ call: CAPPluginCall) throws -> LocationSessionKey {
        let userId = try integer(call, "userId")
        guard let text = call.getString("clientRequestId"), let uuid = UUID(uuidString: text),
              uuid.uuidString.lowercased() == text.lowercased() else {
            throw LocationFailure(code: "INVALID_ARGUMENT", message: "clientRequestId must be a UUID.")
        }
        return LocationSessionKey(userId: userId, clientRequestId: uuid.uuidString.lowercased())
    }
}

// 새 산행 전 단발 측정 전용. 기존 LocationRecorder의 수집·재개·복구와 독립적이다.
private final class StartLocationRequest: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var completion: ((Result<[String: Any], Error>) -> Void)?
    private var timeout: DispatchWorkItem?
    private var requestedAt = Date()

    func prepare(_ completion: @escaping (Result<[String: Any], Error>) -> Void) {
        self.completion = completion
        let timeout = DispatchWorkItem { [weak self] in
            self?.finish(.failure(LocationFailure(code: "TIMEOUT", message: "Location check timed out.")))
        }
        self.timeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timeout)
    }

    func fail(_ error: Error) { finish(.failure(error)) }

    func start() {
        // 권한 응답 전에 제한 시간이 지났다면 위치 요청도 시작하지 않는다.
        guard completion != nil else { return }
        guard CLLocationManager.locationServicesEnabled(), UIApplication.shared.applicationState == .active else {
            finish(.failure(LocationFailure(code: "LOCATION_UNAVAILABLE", message: "Check location services and retry in the foreground.")))
            return
        }
        guard manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways else {
            finish(.failure(LocationFailure(code: "PERMISSION_DENIED", message: "Allow location permission and retry.")))
            return
        }
        requestedAt = Date()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.requestLocation()
    }

    private func finish(_ result: Result<[String: Any], Error>) {
        guard let completion = completion else { return }
        self.completion = nil
        timeout?.cancel()
        timeout = nil
        manager.stopUpdatingLocation()
        manager.delegate = nil
        completion(result)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // Core Location이 반환한 캐시 좌표는 시작 확인에 사용하지 않는다.
        guard let location = locations.last, location.timestamp >= requestedAt else {
            finish(.failure(LocationFailure(code: "LOCATION_UNAVAILABLE", message: "A new location fix is required.")))
            return
        }
        finish(.success(["lat": location.coordinate.latitude, "lng": location.coordinate.longitude,
                         "accuracy": location.horizontalAccuracy,
                         "timestamp": location.timestamp.timeIntervalSince1970 * 1000]))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let denied = (error as? CLError)?.code == .denied
        finish(.failure(LocationFailure(code: denied ? "PERMISSION_DENIED" : "LOCATION_UNAVAILABLE",
                                       message: "Location check failed. Retry after checking permission and location services.")))
    }
}
