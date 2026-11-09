import Capacitor

/// In Main.storyboard set the bridge controller's custom class to ToPeakViewController,
/// module App (or the generated app target module).
class ToPeakViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ToPeakBackgroundLocationPlugin())
    }
}
