import WidgetKit
import SwiftUI

@available(iOSApplicationExtension 16.0, *)
struct LivraLockScreenView: View {
    @Environment(\.widgetFamily) var widgetFamily
    let data: WidgetData

    var body: some View {
        switch widgetFamily {
        case .accessoryCircular:
            circular
        default:
            rectangular
        }
    }

    // Ring gauge with the goal's progress count at its center. Lock-screen
    // accessories are rendered monochrome by the system, so the full-color
    // category glyph lives only on the home-screen widget; here we show the ring.
    private var circular: some View {
        Gauge(value: data.progressFraction) {
            Text("Goal")
        } currentValueLabel: {
            Text("\(data.goalProgress)")
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetURL(URL(string: "livra://home"))
    }

    // Goal + the next mark waiting to be logged.
    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(data.activeGoalTitle ?? "No active goal")
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
                .truncationMode(.tail)
            if let mark = data.nextQueuedMark {
                Text("Next: \(mark.name)")
                    .font(.system(size: 11))
                    .lineLimit(1)
                    .truncationMode(.tail)
            } else if !data.marks.isEmpty {
                Text("All done today ✓")
                    .font(.system(size: 11))
                    .lineLimit(1)
            }
        }
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
        .description("Your goal ring and next mark on your lock screen.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}
