import Foundation
import Capacitor

@objc(ToPeakBackgroundLocationPlugin)
public class ToPeakBackgroundLocationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ToPeakBackgroundLocationPlugin"
    public let jsName = "ToPeakBackgroundLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readPoints", returnType: CAPPluginReturnPromise)
    ]

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
