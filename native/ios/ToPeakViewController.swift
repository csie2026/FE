import Capacitor

/// Main.storyboard의 브리지 컨트롤러 클래스를 ToPeakViewController로 지정하고
/// 모듈은 App 또는 생성된 앱 타깃의 모듈로 설정한다.
class ToPeakViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ToPeakBackgroundLocationPlugin())
    }
}
