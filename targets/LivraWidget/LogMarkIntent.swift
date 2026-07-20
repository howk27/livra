import AppIntents
import WidgetKit

/// One-tap log fired from the interactive widget on iOS 17+.
///
/// Runs inside the widget extension without launching the app: it enqueues the
/// tap into the App Group (for the app to replay as a real log) and optimistically
/// advances the cached snapshot, then asks WidgetKit to reload so the ring fills
/// and the next queued mark appears in place.
@available(iOS 17.0, *)
struct LogMarkIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Mark"
    static var description = IntentDescription("Log this mark from the Livra widget.")

    // Do not open the app — this is a background, in-widget action.
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Mark ID")
    var markId: String

    init() {}

    init(markId: String) {
        self.markId = markId
    }

    func perform() async throws -> some IntentResult {
        WidgetLogQueue.enqueue(markId: markId)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
