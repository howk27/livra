import WidgetKit
import SwiftUI

@available(iOSApplicationExtension 16.0, *)
struct LivraLockScreenView: View {
    let data: WidgetData

    var body: some View {
        Text(data.activeGoalTitle ?? "No active goal")
            .font(.system(size: 11, weight: .medium))
            .lineLimit(1)
            .truncationMode(.tail)
            .widgetURL(URL(string: "livra://home"))
    }
}

@available(iOSApplicationExtension 16.0, *)
struct LivraLockScreenWidget: Widget {
    let kind: String = "LivraLockScreenWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LivraWidgetProvider()) { entry in
            LivraLockScreenView(data: entry.data)
        }
        .configurationDisplayName("Livra Goal")
        .description("Your active goal on your lock screen.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline])
    }
}
