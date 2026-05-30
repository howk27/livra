import Foundation
import SwiftUI

let LIVRA_APP_GROUP_ID = "group.com.livra.app"
let LIVRA_WIDGET_DATA_KEY = "livra_widget_data"

struct WidgetMarkData: Codable, Identifiable {
    let id: String
    let name: String
    let icon: String
    let color: String
    let completed: Bool
}

struct WidgetData: Codable {
    let activeGoalTitle: String?
    let marks: [WidgetMarkData]
    let completedCount: Int
    let totalCount: Int
    let lastUpdated: Double
    let isPro: Bool

    static let placeholder = WidgetData(
        activeGoalTitle: "Your active goal",
        marks: [],
        completedCount: 0,
        totalCount: 0,
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
