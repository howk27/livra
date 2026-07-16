import Foundation
import SwiftUI

let LIVRA_APP_GROUP_ID = "group.com.livra.app"
let LIVRA_WIDGET_DATA_KEY = "livra_widget_data"
let LIVRA_PENDING_LOGS_KEY = "livra_pending_logs"

struct WidgetMarkData: Codable, Identifiable {
    let id: String
    let name: String
    let symbol: String   // SF Symbol name for the mark's category icon
    let accent: String   // category accent hex
    let completed: Bool
}

struct WidgetData: Codable {
    let activeGoalTitle: String?
    let goalSymbol: String
    let goalAccent: String
    let goalProgress: Int
    let goalThreshold: Int
    let marks: [WidgetMarkData]
    let completedCount: Int
    let totalCount: Int
    let lastUpdated: Double
    let isPro: Bool

    // Older snapshots (written before the icon/ring fields existed) decode with
    // these defaults so the widget never crashes on an app-update boundary.
    enum CodingKeys: String, CodingKey {
        case activeGoalTitle, goalSymbol, goalAccent, goalProgress, goalThreshold
        case marks, completedCount, totalCount, lastUpdated, isPro
    }

    init(
        activeGoalTitle: String?,
        goalSymbol: String,
        goalAccent: String,
        goalProgress: Int,
        goalThreshold: Int,
        marks: [WidgetMarkData],
        completedCount: Int,
        totalCount: Int,
        lastUpdated: Double,
        isPro: Bool
    ) {
        self.activeGoalTitle = activeGoalTitle
        self.goalSymbol = goalSymbol
        self.goalAccent = goalAccent
        self.goalProgress = goalProgress
        self.goalThreshold = goalThreshold
        self.marks = marks
        self.completedCount = completedCount
        self.totalCount = totalCount
        self.lastUpdated = lastUpdated
        self.isPro = isPro
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        activeGoalTitle = try c.decodeIfPresent(String.self, forKey: .activeGoalTitle)
        goalSymbol = (try? c.decode(String.self, forKey: .goalSymbol)) ?? "circle.fill"
        goalAccent = (try? c.decode(String.self, forKey: .goalAccent)) ?? "#6B7A6B"
        goalProgress = (try? c.decode(Int.self, forKey: .goalProgress)) ?? 0
        goalThreshold = max(1, (try? c.decode(Int.self, forKey: .goalThreshold)) ?? 7)
        marks = (try? c.decode([WidgetMarkData].self, forKey: .marks)) ?? []
        completedCount = (try? c.decode(Int.self, forKey: .completedCount)) ?? 0
        totalCount = (try? c.decode(Int.self, forKey: .totalCount)) ?? 0
        lastUpdated = (try? c.decode(Double.self, forKey: .lastUpdated)) ?? 0
        isPro = (try? c.decode(Bool.self, forKey: .isPro)) ?? false
    }

    static let placeholder = WidgetData(
        activeGoalTitle: "Your active goal",
        goalSymbol: "waveform.path.ecg",
        goalAccent: "#A0614A",
        goalProgress: 3,
        goalThreshold: 7,
        marks: [
            WidgetMarkData(id: "p1", name: "Move today", symbol: "waveform.path.ecg", accent: "#A0614A", completed: false),
        ],
        completedCount: 0,
        totalCount: 1,
        lastUpdated: 0,
        isPro: false
    )

    static func load() -> WidgetData {
        guard
            let defaults = UserDefaults(suiteName: LIVRA_APP_GROUP_ID),
            let jsonString = defaults.string(forKey: LIVRA_WIDGET_DATA_KEY),
            let jsonData = jsonString.data(using: .utf8),
            let decoded = try? JSONDecoder().decode(WidgetData.self, from: jsonData)
        else {
            return .placeholder
        }
        return decoded
    }

    var isStale: Bool {
        let sixHoursMs: Double = 6 * 60 * 60 * 1000
        return (Date().timeIntervalSince1970 * 1000) - lastUpdated > sixHoursMs
    }

    var lastUpdatedString: String {
        let date = Date(timeIntervalSince1970: lastUpdated / 1000)
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter.string(from: date)
    }

    /// Ring fill, clamped to 0...1.
    var progressFraction: Double {
        guard goalThreshold > 0 else { return 0 }
        return min(1, max(0, Double(goalProgress) / Double(goalThreshold)))
    }

    /// The next mark to offer for logging: the first one not yet completed today.
    /// Nil when everything loggable is done.
    var nextQueuedMark: WidgetMarkData? {
        marks.first(where: { !$0.completed })
    }

    /// How many other marks are still waiting behind `nextQueuedMark`.
    var remainingQueuedCount: Int {
        max(0, marks.filter { !$0.completed }.count - 1)
    }
}

// MARK: - Pending-log queue (widget → app reconciliation)

enum WidgetLogQueue {
    /// Append a tapped mark to the App Group queue so the app can replay it as a
    /// real log on next foreground. Optimistically flips the mark to completed in
    /// the cached snapshot so the widget can advance to the next queued mark
    /// immediately, before the app has a chance to reconcile.
    static func enqueue(markId: String) {
        guard let defaults = UserDefaults(suiteName: LIVRA_APP_GROUP_ID) else { return }

        // 1. Append to the pending-logs array.
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

        // 2. Optimistically mark completed in the cached snapshot.
        optimisticallyComplete(markId: markId, defaults: defaults)
    }

    private static func optimisticallyComplete(markId: String, defaults: UserDefaults) {
        guard
            let jsonString = defaults.string(forKey: LIVRA_WIDGET_DATA_KEY),
            let jsonData = jsonString.data(using: .utf8),
            let current = try? JSONDecoder().decode(WidgetData.self, from: jsonData)
        else { return }

        let updatedMarks = current.marks.map { mark -> WidgetMarkData in
            guard mark.id == markId, !mark.completed else { return mark }
            return WidgetMarkData(
                id: mark.id, name: mark.name, symbol: mark.symbol,
                accent: mark.accent, completed: true
            )
        }
        let newlyCompleted = current.marks.contains { $0.id == markId && !$0.completed }

        let updated = WidgetData(
            activeGoalTitle: current.activeGoalTitle,
            goalSymbol: current.goalSymbol,
            goalAccent: current.goalAccent,
            goalProgress: current.goalProgress + (newlyCompleted ? 1 : 0),
            goalThreshold: current.goalThreshold,
            marks: updatedMarks,
            completedCount: current.completedCount + (newlyCompleted ? 1 : 0),
            totalCount: current.totalCount,
            lastUpdated: current.lastUpdated,
            isPro: current.isPro
        )
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
