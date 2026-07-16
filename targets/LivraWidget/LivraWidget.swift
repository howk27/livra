import WidgetKit
import SwiftUI

// MARK: - Palette (Livra 2.0 dark surface — mirrors theme/colors dark)

enum WidgetPalette {
    static let bg = Color(hex: "#1C2826")        // dark surface
    static let ink = Color(hex: "#F0EDE8")       // inkDark (dark theme)
    static let inkMuted = Color(hex: "#A8C4BC")  // inkInverseMuted
    static let accent = Color(hex: "#8DB5A8")    // mint accent (dark)
    static let ringTrack = Color(hex: "#F0EDE8").opacity(0.14)
}

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

// MARK: - Goal ring (icon centered inside a progress ring)

struct GoalRingView: View {
    let data: WidgetData
    let diameter: CGFloat
    var lineWidth: CGFloat = 6

    private var accent: Color {
        data.goalAccent.isEmpty ? WidgetPalette.accent : Color(hex: data.goalAccent)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(WidgetPalette.ringTrack, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.0001, data.progressFraction))
                .stroke(
                    accent,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            // The app's own Phosphor duotone glyph (accent baked into the asset).
            Image(data.goalIcon.isEmpty ? "livra_circle" : data.goalIcon)
                .resizable()
                .scaledToFit()
                .frame(width: diameter * 0.5, height: diameter * 0.5)
        }
        .frame(width: diameter, height: diameter)
    }
}

// MARK: - Log button (interactive on iOS 17+, deep-link fallback on iOS 16)

struct LogMarkButton: View {
    let mark: WidgetMarkData
    var compact: Bool = false

    var body: some View {
        if #available(iOS 17.0, *) {
            Button(intent: LogMarkIntent(markId: mark.id)) {
                LogMarkLabel(mark: mark, compact: compact)
            }
            .buttonStyle(.plain)
        } else {
            Link(destination: URL(string: "livra://log-mark?markId=\(mark.id)")!) {
                LogMarkLabel(mark: mark, compact: compact)
            }
        }
    }
}

struct LogMarkLabel: View {
    let mark: WidgetMarkData
    var compact: Bool = false

    private var accent: Color {
        mark.accent.isEmpty ? WidgetPalette.accent : Color(hex: mark.accent)
    }

    var body: some View {
        HStack(spacing: 8) {
            // Category icon tile — mirrors the in-app MarkRow icon tile
            // (Phosphor duotone glyph on an accent-tinted rounded tile).
            Image(mark.icon.isEmpty ? "livra_circle" : mark.icon)
                .resizable()
                .scaledToFit()
                .frame(width: compact ? 15 : 17, height: compact ? 15 : 17)
                .frame(width: compact ? 24 : 28, height: compact ? 24 : 28)
                .background(accent.opacity(0.14))
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            Text(mark.name)
                .font(.system(size: compact ? 12 : 14, weight: .semibold))
                .foregroundColor(WidgetPalette.ink)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 4)
            Image(systemName: "plus.circle.fill")
                .font(.system(size: compact ? 17 : 21))
                .foregroundColor(accent)
        }
        .padding(.vertical, compact ? 6 : 8)
        .padding(.horizontal, compact ? 8 : 10)
        .frame(maxWidth: .infinity)
        .background(accent.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// MARK: - Status line (queued count / done / empty)

struct QueueStatusText: View {
    let data: WidgetData
    var body: some View {
        Text(statusText)
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(WidgetPalette.inkMuted)
            .lineLimit(1)
    }

    private var statusText: String {
        if data.marks.isEmpty { return "Open Livra to add a mark" }
        if data.nextQueuedMark == nil { return "All done today ✓" }
        let more = data.remainingQueuedCount
        return more > 0 ? "\(more) more queued" : "Last one for today"
    }
}

struct AllDoneOrEmpty: View {
    let data: WidgetData
    var body: some View {
        Text(data.marks.isEmpty ? "Open Livra to add a mark" : "All done today ✓")
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(WidgetPalette.inkMuted)
            .lineLimit(2)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Small Widget (2×2): ring + one queued mark to log

struct SmallWidgetView: View {
    let data: WidgetData

    var body: some View {
        VStack(spacing: 8) {
            GoalRingView(data: data, diameter: 58, lineWidth: 6)

            if !data.isPro {
                Text("Livra+ to log here")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(WidgetPalette.accent)
                    .lineLimit(1)
            } else if let mark = data.nextQueuedMark {
                LogMarkButton(mark: mark, compact: true)
                QueueStatusText(data: data)
            } else {
                AllDoneOrEmpty(data: data)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(WidgetPalette.bg)
        .widgetURL(URL(string: "livra://home"))
    }
}

// MARK: - Medium Widget (2×4): ring left, queued mark + log action right

struct MediumWidgetView: View {
    let data: WidgetData

    var body: some View {
        HStack(spacing: 14) {
            GoalRingView(data: data, diameter: 76, lineWidth: 7)

            VStack(alignment: .leading, spacing: 7) {
                Text(data.activeGoalTitle ?? "No active goal")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(WidgetPalette.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)

                if !data.isPro {
                    Spacer(minLength: 0)
                    Text("Upgrade to Livra+ to log from your widget.")
                        .font(.system(size: 12))
                        .foregroundColor(WidgetPalette.accent)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                } else if let mark = data.nextQueuedMark {
                    LogMarkButton(mark: mark, compact: false)
                    QueueStatusText(data: data)
                } else {
                    Spacer(minLength: 0)
                    AllDoneOrEmpty(data: data)
                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(WidgetPalette.bg)
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
        .description("Your goal ring and the next mark to log — one tap.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
