import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 앱 시작 직후 필요한 초기화 작업을 추가하는 진입점이다.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // 전화 수신 등 일시적인 방해나 백그라운드 전환으로 앱이 비활성화되기 직전에 호출된다.
        // 화면 관련 일시정지가 필요하면 이곳에 추가한다. 백그라운드 GPS 정책은 LocationRecorder에서 관리한다.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // 앱이 백그라운드에 진입했을 때 호출되며 필요한 자원 정리나 상태 저장을 추가할 수 있다.
        // 백그라운드 전환을 앱 종료로 간주하지 않는다. 위치 수집은 별도 수집기의 상태에 따른다.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // 백그라운드에서 포그라운드로 돌아올 때 필요한 복원 작업을 추가하는 진입점이다.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // 앱이 다시 활성화되었을 때 화면 갱신 등 필요한 작업을 추가할 수 있다.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // 정상 종료 직전에 호출될 수 있으나 강제 종료 시에는 보장되지 않으므로 마지막 저장에 의존하지 않는다.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // URL로 앱을 열었을 때 Capacitor에 이벤트를 전달한다.
        // App API의 URL 열기 이벤트 전달을 위해 아래 호출을 유지한다.
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // 유니버설 링크를 포함한 사용자 활동으로 앱을 열었을 때 호출된다.
        // App API에 링크 열기 이벤트를 전달하도록
        // 아래 Capacitor 호출을 유지한다.
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
