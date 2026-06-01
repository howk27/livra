import WidgetKit
import SwiftUI

@main
struct LivraWidgetBundle: WidgetBundle {
    var body: some Widget {
        LivraWidget()
        if #available(iOSApplicationExtension 16.0, *) {
            LivraLockScreenWidget()
        }
    }
}
