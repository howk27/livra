import Foundation
import SwiftUI

let LIVRA_APP_GROUP_ID = "group.com.livra.app"
let LIVRA_WIDGET_DATA_KEY = "livra_widget_data"
let LIVRA_PENDING_LOGS_KEY = "livra_pending_logs"

struct WidgetMarkData: Codable, Identifiable {
    let id: String
    let name: String
    let icon: String     // bundled imageset name for the category glyph
    let accent: String   // category accent hex
    let completed: Bool
}

struct WidgetGoalData: Codable, Identifiable {
    let id: String
    let title: String?
    let icon: String
    let accent: String
    let progress: Int
    let threshold: Int
    let marks: [WidgetMarkData]

    var progressFraction: Double {
        guard threshold > 0 else { return 0 }
        return min(1, max(0, Double(progress) / Double(threshold)))
    }
    /// First not-yet-completed mark in this goal, or nil when the goal is done today.
    var nextMark: WidgetMarkData? { marks.first(where: { !$0.completed }) }
}

struct WidgetData: Codable {
    let goals: [WidgetGoalData]
    let lastUpdated: Double
    let isPro: Bool

    enum CodingKeys: String, CodingKey { case goals, lastUpdated, isPro }

    init(goals: [WidgetGoalData], lastUpdated: Double, isPro: Bool) {
        self.goals = goals
        self.lastUpdated = lastUpdated
        self.isPro = isPro
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        isPro = (try? c.decode(Bool.self, forKey: .isPro)) ?? false
        lastUpdated = (try? c.decode(Double.self, forKey: .lastUpdated)) ?? 0
        if let v2 = try? c.decode([WidgetGoalData].self, forKey: .goals) {
            goals = v2
        } else {
            // Legacy v1 snapshot (written by an app build before v2, still on
            // disk until the app next foregrounds). Adapt its top-level fields
            // into a single goal so the widget renders instead of blanking.
            goals = WidgetData.adaptLegacy(from: decoder)
        }
    }

    private static func adaptLegacy(from decoder: Decoder) -> [WidgetGoalData] {
        enum LegacyKeys: String, CodingKey {
            case activeGoalTitle, goalIcon, goalAccent, goalProgress, goalThreshold, marks
        }
        guard let c = try? decoder.container(keyedBy: LegacyKeys.self) else { return [] }
        let activeGoalTitle = (try? c.decodeIfPresent(String.self, forKey: .activeGoalTitle)) ?? nil
        let goalIcon = (try? c.decodeIfPresent(String.self, forKey: .goalIcon)) ?? nil
        let goalAccent = (try? c.decodeIfPresent(String.self, forKey: .goalAccent)) ?? nil
        let goalProgress = (try? c.decodeIfPresent(Int.self, forKey: .goalProgress)) ?? nil
        let goalThreshold = (try? c.decodeIfPresent(Int.self, forKey: .goalThreshold)) ?? nil
        // Swift 5 `try?` FLATTENS optionals (SE-0230): `try? decodeIfPresent(...)`
        // is already `[WidgetMarkData]?`, so this single `guard let` yields a
        // non-optional `marks`. Do NOT add a second `let x = marks` unwrap — that
        // binds a non-optional and fails to compile ("initializer for conditional
        // binding must have Optional type").
        guard let marks = try? c.decodeIfPresent([WidgetMarkData].self, forKey: .marks),
              !marks.isEmpty else { return [] }
        return [WidgetGoalData(
            id: "legacy",
            title: activeGoalTitle,
            icon: goalIcon ?? "livra_circle",
            accent: goalAccent ?? "#6B7A6B",
            progress: goalProgress ?? 0,
            threshold: max(1, goalThreshold ?? 7),
            marks: marks
        )]
    }

    static let placeholder = WidgetData(
        goals: [WidgetGoalData(
            id: "p", title: "Your active goal", icon: "livra_pulse", accent: "#A0614A",
            progress: 3, threshold: 7,
            marks: [WidgetMarkData(id: "p1", name: "Move today", icon: "livra_pulse", accent: "#A0614A", completed: false)]
        )],
        lastUpdated: 0, isPro: false
    )

    static func load() -> WidgetData {
        guard
            let defaults = UserDefaults(suiteName: LIVRA_APP_GROUP_ID),
            let jsonString = defaults.string(forKey: LIVRA_WIDGET_DATA_KEY),
            let jsonData = jsonString.data(using: .utf8),
            let decoded = try? JSONDecoder().decode(WidgetData.self, from: jsonData)
        else { return .placeholder }
        return decoded
    }

    var isStale: Bool {
        let sixHoursMs: Double = 6 * 60 * 60 * 1000
        return (Date().timeIntervalSince1970 * 1000) - lastUpdated > sixHoursMs
    }

    // MARK: - Sequential queue derivation
    /// Current goal = first goal (sort order) with a mark still to log today; the
    /// last goal when every goal is done, so the all-done medallion still shows.
    var currentGoal: WidgetGoalData? {
        goals.first(where: { $0.nextMark != nil }) ?? goals.last
    }
    /// Current mark = the current goal's next unlogged mark; nil ⇒ all done today.
    var currentMark: WidgetMarkData? { currentGoal?.nextMark }
    /// Marks still queued behind the current one, within the current goal.
    var remainingToday: Int {
        guard let g = currentGoal else { return 0 }
        return max(0, g.marks.filter { !$0.completed }.count - 1)
    }

    // MARK: - Backward-compat (lock-screen widget reads these v1 accessors)
    var activeGoalTitle: String? { currentGoal?.title }
    var goalProgress: Int { currentGoal?.progress ?? 0 }
    var progressFraction: Double { currentGoal?.progressFraction ?? 0 }
    var nextQueuedMark: WidgetMarkData? { currentMark }
    var remainingQueuedCount: Int { remainingToday }
    var marks: [WidgetMarkData] { currentGoal?.marks ?? [] }
}

// MARK: - Pending-log queue (widget → app reconciliation)

enum WidgetLogQueue {
    /// Append a tapped mark to the App Group queue for the app to replay, and
    /// optimistically flip it to completed in the cached snapshot so the widget
    /// advances to the next queued mark (and next goal) immediately. Does NOT
    /// touch goal progress — the ring is days-based and updates on app sync.
    static func enqueue(markId: String) {
        guard let defaults = UserDefaults(suiteName: LIVRA_APP_GROUP_ID) else { return }

        var queue: [[String: Any]] = []
        if let raw = defaults.string(forKey: LIVRA_PENDING_LOGS_KEY),
           let data = raw.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            queue = parsed
        }
        queue.append(["markId": markId, "at": Date().timeIntervalSince1970 * 1000])
        if let data = try? JSONSerialization.data(withJSONObject: queue),
           let str = String(data: data, encoding: .utf8) {
            defaults.set(str, forKey: LIVRA_PENDING_LOGS_KEY)
        }
        optimisticallyComplete(markId: markId, defaults: defaults)
    }

    private static func optimisticallyComplete(markId: String, defaults: UserDefaults) {
        guard
            let jsonString = defaults.string(forKey: LIVRA_WIDGET_DATA_KEY),
            let jsonData = jsonString.data(using: .utf8),
            let current = try? JSONDecoder().decode(WidgetData.self, from: jsonData)
        else { return }

        let updatedGoals = current.goals.map { goal -> WidgetGoalData in
            guard goal.marks.contains(where: { $0.id == markId && !$0.completed }) else { return goal }
            let updatedMarks = goal.marks.map { mark -> WidgetMarkData in
                guard mark.id == markId, !mark.completed else { return mark }
                return WidgetMarkData(id: mark.id, name: mark.name, icon: mark.icon, accent: mark.accent, completed: true)
            }
            // NOTE: progress is intentionally left unchanged — days-based ring.
            return WidgetGoalData(
                id: goal.id, title: goal.title, icon: goal.icon, accent: goal.accent,
                progress: goal.progress, threshold: goal.threshold, marks: updatedMarks
            )
        }

        let updated = WidgetData(goals: updatedGoals, lastUpdated: current.lastUpdated, isPro: current.isPro)
        if let data = try? JSONEncoder().encode(updated),
           let str = String(data: data, encoding: .utf8) {
            defaults.set(str, forKey: LIVRA_WIDGET_DATA_KEY)
        }
    }
}

extension Color {
    init(hex: String) {
        let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var intVal: UInt64 = 0
        Scanner(string: clean).scanHexInt64(&intVal)
        let r = Double((intVal >> 16) & 0xFF) / 255.0
        let g = Double((intVal >> 8) & 0xFF) / 255.0
        let b = Double(intVal & 0xFF) / 255.0
        self.init(red: r, green: g, blue: b)
    }
}
