import WidgetKit
import SwiftUI

// MARK: - Timeline

struct LivraWidgetEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

struct LivraWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> LivraWidgetEntry {
        LivraWidgetEntry(date: Date(), data: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (LivraWidgetEntry) -> Void) {
        completion(LivraWidgetEntry(date: Date(), data: WidgetData.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LivraWidgetEntry>) -> Void) {
        let data = WidgetData.load()
        let entry = LivraWidgetEntry(date: Date(), data: data)
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

// MARK: - Small Widget (2×2)

struct SmallWidgetView: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(data.activeGoalTitle ?? "No active goal")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color(hex: "#F0E6D0"))
                .lineLimit(2)
                .minimumScaleFactor(0.8)

            Spacer()

            if data.isStale && data.lastUpdated > 0 {
                Text("Updated \(data.lastUpdatedString)")
                    .font(.system(size: 9))
                    .foregroundColor(Color(hex: "#F0E6D0").opacity(0.4))
            }

            Text("\(data.completedCount) of \(data.totalCount) done")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(hex: "#C47E8A"))
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Color(hex: "#1C2826"))
        .widgetURL(URL(string: "livra://home"))
    }
}

// MARK: - Medium Widget (2×4)

struct MediumWidgetView: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(data.activeGoalTitle ?? "No active goal")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Color(hex: "#F0E6D0"))
                .lineLimit(1)
                .truncationMode(.tail)

            Divider()
                .background(Color(hex: "#F0E6D0").opacity(0.1))

            if !data.isPro {
                Spacer()
                Text("Upgrade to Livra+ to see your marks here.")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "#C47E8A"))
                    .multilineTextAlignment(.leading)
                Spacer()
            } else if data.marks.isEmpty {
                Spacer()
                Text("No marks yet — open Livra to add some.")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "#F0E6D0").opacity(0.5))
                Spacer()
            } else {
                ForEach(data.marks.prefix(4)) { mark in
                    Link(destination: URL(string: "livra://log-mark?markId=\(mark.id)")!) {
                        HStack(spacing: 8) {
                            if !mark.icon.isEmpty {
                                Text(mark.icon)
                                    .font(.system(size: 14))
                            }
                            Text(mark.name)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color(hex: "#F0E6D0"))
                            Spacer()
                            Circle()
                                .fill(mark.completed
                                    ? Color(hex: mark.color)
                                    : Color(hex: "#F0E6D0").opacity(0.15))
                                .frame(width: 8, height: 8)
                        }
                    }
                }

                if data.isStale && data.lastUpdated > 0 {
                    Text("Updated \(data.lastUpdatedString)")
                        .font(.system(size: 9))
                        .foregroundColor(Color(hex: "#F0E6D0").opacity(0.3))
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Color(hex: "#1C2826"))
        .widgetURL(URL(string: "livra://home"))
    }
}

// MARK: - Entry View

struct LivraWidgetEntryView: View {
    @Environment(\.widgetFamily) var widgetFamily
    let entry: LivraWidgetEntry

    var body: some View {
        switch widgetFamily {
        case .systemSmall:
            SmallWidgetView(data: entry.data)
        case .systemMedium:
            MediumWidgetView(data: entry.data)
        default:
            SmallWidgetView(data: entry.data)
        }
    }
}

// MARK: - Widget Configuration

struct LivraWidget: Widget {
    let kind: String = "LivraWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LivraWidgetProvider()) { entry in
            LivraWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Livra")
        .description("Your active goal and today's marks at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
