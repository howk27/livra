import WidgetKit
import SwiftUI

@main
struct LivraWidgetBundle: WidgetBundle {
    // NO conditionals in this body. `if #available` compiles into
    // WidgetBundleBuilder.buildLimitedAvailability, which assertion-fails at
    // runtime when iOS enumerates the bundle — the extension crash-loops and
    // the widget never appears in the gallery (52 device crash logs, 2026-07-19).
    // The deployment target is already 16.0, so the check guarded nothing.
    var body: some Widget {
        LivraWidget()
        LivraLockScreenWidget()
    }
}
