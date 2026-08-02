import WidgetKit
import SwiftUI
import UIKit

// MARK: - Palette (Livra design system — theme-aware surface)
//
// Values mirror theme/tokens.ts (colorsLight / colorsDark) + .reports/design-decisions.md.
// The widget is a native target and cannot import the TS tokens, so the token
// VALUES are mirrored here. Surface/ink/muted/accent/ring-track resolve per
// light/dark via a dynamic UIColor; category accents (on mark tiles) stay
// constant regardless of scheme.

enum WidgetPalette {
    // Dynamic surface/ink resolve per light/dark; category accents stay constant.
    //
    // DARK SURFACE, corrected 2026-08-02 (founder device report: "widgets have the
    // wrong tone, they stay green"). This was "#1C3830", which is
    // colorsLight.FOREST — the LIGHT theme's brand green, the colour of a card or
    // a button, never a page background. The widget was painting a light-theme
    // brand colour as its dark-mode ground, so in dark mode it read as a green
    // tile next to an app whose background is near-black. The app's dark page
    // background is colorsDark.linen "#15211D" (the same ground the dark splash
    // uses), so the widget now sits on it and the handoff app -> widget is one
    // surface. Every ink pairing gained contrast: ink 10.85 -> 14.19, muted
    // 6.81 -> 8.91, accent 5.61 -> 7.35, ring 6.53 -> 8.54.
    static let bg = dynamic(light: "#F0EDE8", dark: "#15211D")
    static let ink = dynamic(light: "#1A1A18", dark: "#F0EDE8")
    // Dark muted stays colorsDark.inkInverseMuted rather than moving to
    // colorsDark.inkMuted ("#8A938E"): it was picked when this surface was a
    // forest card, and on the corrected ground it still reads at 8.91:1 and keeps
    // the mint tint the accent already carries. Changing it is a visual call the
    // founder can only make on a device, so it is deliberately NOT bundled into a
    // tone fix.
    static let inkMuted = dynamic(light: "#4A4A45", dark: "#A8C4BC")
    static let accent = dynamic(light: "#1C3830", dark: "#8DB5A8")
    static let ringTrack = dynamic(
        light: Color(hex: "#1A1A18").opacity(0.12),
        dark: Color(hex: "#F0EDE8").opacity(0.14)
    )
    // Sanctioned VD-1 ring gradient — light [amber→ember], dark [amber→amber].
    static let ringAmber = dynamic(light: "#D8A658", dark: "#E0B36A")
    static let ringEmber = dynamic(light: "#C8913F", dark: "#D8A658")

    private static func dynamic(light: String, dark: String) -> Color {
        Color(UIColor { traits in
            UIColor(traits.userInterfaceStyle == .dark ? Color(hex: dark) : Color(hex: light))
        })
    }

    private static func dynamic(light: Color, dark: Color) -> Color {
        Color(UIColor { traits in
            UIColor(traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
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
    let goal: WidgetGoalData
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
                .trim(from: 0, to: max(0.0001, goal.progressFraction))
                .stroke(
                    AngularGradient(
                        gradient: Gradient(colors: [WidgetPalette.ringAmber, WidgetPalette.ringEmber]),
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            // GOAL GLYPH REMOVED 2026-08-02 (founder: "the goal icon feels
            // redundant"). The widget showed TWO icons at once — this one inside
            // the ring and the mark's category tile in LogMarkLabel — and since
            // the goal glyph is derived from the majority category of the goal's
            // marks (widgetSync.ts majorityCategory), it was usually the SAME
            // glyph as the mark tile right beside it. Two copies of one symbol
            // read as two different things. The ring alone carries the goal; the
            // tile carries the mark.
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
    /// Small stacks its content under a CENTERED ring, so a hard .leading here
    /// left the done row hanging off-axis once the last mark was logged — the
    /// "it re-arranges and doesn't look aligned" report of 2026-08-02. Medium
    /// lays out inside a leading VStack beside the ring and stays .leading.
    var alignment: Alignment = .leading

    private var textAlignment: TextAlignment {
        alignment == .center ? .center : .leading
    }

    var body: some View {
        if data.marks.isEmpty {
            Text("Open Livra to add a mark")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(WidgetPalette.inkMuted)
                .lineLimit(2)
                .multilineTextAlignment(textAlignment)
                .frame(maxWidth: .infinity, alignment: alignment)
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
            .frame(maxWidth: .infinity, alignment: alignment)
        }
    }
}

// MARK: - Small Widget (2×2): ring + one queued mark to log

struct SmallWidgetView: View {
    let data: WidgetData

    var body: some View {
        VStack(spacing: 8) {
            if let goal = data.currentGoal {
                GoalRingView(goal: goal, diameter: 58, lineWidth: 6)
            }
            if let mark = data.currentMark {
                LogMarkButton(mark: mark, compact: true)
            } else {
                AllDoneOrEmpty(data: data, alignment: .center)
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
            if let goal = data.currentGoal {
                GoalRingView(goal: goal, diameter: 76, lineWidth: 7)
            }

            VStack(alignment: .leading, spacing: 8) {
                // Serif goal title — echoes the signature Cormorant voice via the
                // system serif (New York); no font bundling into the appex in v1.
                Text(data.currentGoal?.title ?? "No active goal")
                    .font(.system(size: 15, weight: .semibold, design: .serif))
                    .foregroundColor(WidgetPalette.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)

                if let mark = data.currentMark {
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

// Applies the app's theme, when the snapshot carries one, by overriding the
// colorScheme environment for the whole widget body. WidgetPalette's dynamic
// UIColors resolve against that environment, so every surface, ink and ring
// colour follows in one place — no palette threading, and nil (an older
// snapshot) simply leaves the system trait in charge.
extension View {
    @ViewBuilder
    func widgetColorScheme(_ scheme: ColorScheme?) -> some View {
        if let scheme = scheme {
            environment(\.colorScheme, scheme)
        } else {
            self
        }
    }
}

struct LivraWidgetEntryView: View {
    @Environment(\.widgetFamily) var widgetFamily
    let entry: LivraWidgetEntry

    var body: some View {
        content.widgetColorScheme(entry.data.colorSchemeOverride)
    }

    @ViewBuilder
    private var content: some View {
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
