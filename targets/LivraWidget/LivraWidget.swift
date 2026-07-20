import WidgetKit
import SwiftUI

// MARK: - Palette (Livra design system — fixed forest dark surface)
//
// Values mirror theme/tokens.ts (colorsDark) + .reports/design-decisions.md.
// The widget is a native target and cannot import the TS tokens, so the token
// VALUES are mirrored here. All text colors verified ≥ 4.5:1 against `bg`
// (ink 10.85:1, inkMuted 6.81:1); the ring gradient reads as graphical.

enum WidgetPalette {
    static let bg = Color(hex: "#1C3830")        // forest (colorsDark surface)
    static let ink = Color(hex: "#F0EDE8")       // linen ink on dark
    static let inkMuted = Color(hex: "#A8C4BC")  // mint-tinted muted (AA: 6.81:1)
    static let accent = Color(hex: "#8DB5A8")    // mint — structural accent (tiles, buttons)
    static let ringTrack = Color(hex: "#F0EDE8").opacity(0.14)
    // Ring "star" gradient — the ONE non-forest progress surface
    // (design-decisions 2026-07-15, "the ring is a star"). Exact mirror of the
    // in-app goal-detail hero ring on dark: colorsDark.progressGradient in
    // theme/tokens.ts = ['#E0B36A', '#D8A658'], so the widget ring reads as the
    // same object as the in-app ring on the dark surface.
    static let ringAmber = Color(hex: "#E0B36A")
    static let ringEmber = Color(hex: "#D8A658")
}

// MARK: - Container background (iOS 17 migration)
//
// iOS 17+ paints the widget's rounded-rect container itself and reserves default
// content margins. A plain `.background()` on the CONTENT only fills the content
// rect, so the system's default (dark) surface bleeds through at the corners and
// margins — the "dark corners exposed" bug. The forest fill must be declared as
// the CONTAINER background to reach the widget's edges. iOS 16 keeps the plain
// background (containerBackground is unavailable there).
//
// The `if #available` here is inside a ViewBuilder body, NOT a WidgetBundle body
// — it compiles to ViewBuilder.buildLimitedAvailability (safe), never the
// WidgetBundleBuilder trap that caused the gallery crash (see widgetBundleGuard).
extension View {
    @ViewBuilder
    func widgetContainerBackground(_ color: Color) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(color, for: .widget)
        } else {
            background(color)
        }
    }
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

// MARK: - Goal ring (amber→ember progress arc, category glyph centered)

struct GoalRingView: View {
    let data: WidgetData
    let diameter: CGFloat
    var lineWidth: CGFloat = 6

    var body: some View {
        ZStack {
            Circle()
                .stroke(WidgetPalette.ringTrack, lineWidth: lineWidth)
            // The sanctioned amber→ember "star" arc — carries progress. Category
            // accent lives on the mark tiles, never the ring. No bottom-up icon
            // fill (failed device QA 3× on this stack); the glyph is static.
            Circle()
                .trim(from: 0, to: max(0.0001, data.progressFraction))
                .stroke(
                    AngularGradient(
                        gradient: Gradient(colors: [WidgetPalette.ringAmber, WidgetPalette.ringEmber]),
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            // The app's own Phosphor duotone glyph (accent baked into the asset),
            // statically centered — carries the goal's identity.
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
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
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
        .padding(.vertical, 8)
        .padding(.horizontal, compact ? 8 : 12)
        .frame(maxWidth: .infinity)
        .background(accent.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// MARK: - Status line (queued count behind the next mark)

struct QueueStatusText: View {
    let data: WidgetData
    var body: some View {
        Text(statusText)
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(WidgetPalette.inkMuted)
            .lineLimit(1)
    }

    // Only rendered when a next mark exists, so the queue is non-empty here.
    private var statusText: String {
        let more = data.remainingQueuedCount
        return more > 0 ? "\(more) more queued" : "Last one for today"
    }
}

// MARK: - All-done / empty state (outlined done cue — never a filled dot)

struct AllDoneOrEmpty: View {
    let data: WidgetData

    var body: some View {
        if data.marks.isEmpty {
            Text("Open Livra to add a mark")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(WidgetPalette.inkMuted)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            HStack(spacing: 8) {
                // Outlined (not filled) done cue — design-decisions 2026-07-12.
                ZStack {
                    Circle()
                        .stroke(WidgetPalette.accent, lineWidth: 1.5)
                        .frame(width: 18, height: 18)
                    Image(systemName: "checkmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(WidgetPalette.accent)
                }
                Text("All done today")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(WidgetPalette.ink)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Small Widget (2×2): ring + one queued mark to log

struct SmallWidgetView: View {
    let data: WidgetData

    var body: some View {
        VStack(spacing: 8) {
            GoalRingView(data: data, diameter: 58, lineWidth: 6)

            if let mark = data.nextQueuedMark {
                LogMarkButton(mark: mark, compact: true)
                QueueStatusText(data: data)
            } else {
                AllDoneOrEmpty(data: data)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetContainerBackground(WidgetPalette.bg)
        .widgetURL(URL(string: "livra://home"))
    }
}

// MARK: - Medium Widget (2×4): ring left, queued mark + log action right

struct MediumWidgetView: View {
    let data: WidgetData

    var body: some View {
        HStack(spacing: 16) {
            GoalRingView(data: data, diameter: 76, lineWidth: 7)

            VStack(alignment: .leading, spacing: 8) {
                // Serif goal title — echoes the signature Cormorant voice via the
                // system serif (New York); no font bundling into the appex in v1.
                Text(data.activeGoalTitle ?? "No active goal")
                    .font(.system(size: 15, weight: .semibold, design: .serif))
                    .foregroundColor(WidgetPalette.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)

                if let mark = data.nextQueuedMark {
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
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetContainerBackground(WidgetPalette.bg)
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
        .description("Your goal ring and the next mark to log in one tap.")
        .supportedFamilies([.systemSmall, .systemMedium])
        // iOS 17+ adds default content margins (~16pt) on top of the views'
        // explicit padding, squeezing the ring + tiles past the content region
        // (the "clipped / half-rendered elements" bug). We own our padding, so
        // opt out of the system margins. No-op before iOS 17.
        .contentMarginsDisabled()
    }
}
