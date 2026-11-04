import AppKit
import ApplicationServices
import Foundation

struct InputPlan: Codable {
    let contract: String
    let planId: String
    let expectedFrontmostBundleId: String
    let steps: [InputStep]
}

struct InputStep: Codable {
    let id: String
    let type: String
    let atMs: Int
    let x: Double?
    let y: Double?
    let durationMs: Int?
    let button: String?
    let clickCount: Int?
    let keyCode: Int?
    let modifiers: [String]?
    let text: String?
}

struct TraceRow: Codable {
    let id: String
    let type: String
    let atMs: Int
    let status: String
    let detail: String
}

struct RunReport: Codable {
    let contract: String
    let status: String
    let mode: String
    let planId: String
    let expectedFrontmostBundleId: String
    let actualFrontmostBundleId: String?
    let accessibilityTrusted: Bool
    let steps: [TraceRow]
}

enum AdapterFailure: Error, CustomStringConvertible {
    case invalid(String)
    case execution(String)

    var description: String {
        switch self {
        case .invalid(let message), .execution(let message): return message
        }
    }
}

@main
struct A1NativeInputAdapter {
    static let allowedTypes = Set(["move", "click", "key", "text", "wait"])

    static func argument(_ name: String) -> String? {
        let args = CommandLine.arguments
        guard let index = args.firstIndex(of: name), index + 1 < args.count else { return nil }
        return args[index + 1]
    }

    static func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data(("ERROR " + message + "\n").utf8))
        exit(1)
    }

    static func validate(_ plan: InputPlan) throws {
        guard plan.contract == "A1NativeInputPlan/v1" else { throw AdapterFailure.invalid("unsupported-contract") }
        guard !plan.planId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw AdapterFailure.invalid("plan-id-empty") }
        guard !plan.expectedFrontmostBundleId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw AdapterFailure.invalid("expected-bundle-id-empty") }
        guard !plan.steps.isEmpty else { throw AdapterFailure.invalid("steps-empty") }
        var priorAtMs = -1
        var ids = Set<String>()
        for step in plan.steps {
            guard ids.insert(step.id).inserted else { throw AdapterFailure.invalid("duplicate-step-id:\(step.id)") }
            guard allowedTypes.contains(step.type) else { throw AdapterFailure.invalid("unsupported-step-type:\(step.type)") }
            guard step.atMs >= priorAtMs else { throw AdapterFailure.invalid("non-monotonic-time:\(step.id)") }
            priorAtMs = step.atMs
            if step.type == "move" || step.type == "click" {
                guard let x = step.x, let y = step.y, x.isFinite, y.isFinite, x >= 0, y >= 0 else {
                    throw AdapterFailure.invalid("invalid-coordinate:\(step.id)")
                }
            }
            if step.type == "move" && (step.durationMs ?? 0) < 0 { throw AdapterFailure.invalid("invalid-duration:\(step.id)") }
            if step.type == "click" && !["left", "right"].contains(step.button ?? "left") { throw AdapterFailure.invalid("invalid-button:\(step.id)") }
            if step.type == "click" && !((1...2).contains(step.clickCount ?? 1)) { throw AdapterFailure.invalid("invalid-click-count:\(step.id)") }
            if step.type == "key" && !(0...127).contains(step.keyCode ?? -1) { throw AdapterFailure.invalid("invalid-key-code:\(step.id)") }
            if step.type == "text" && (step.text ?? "").isEmpty { throw AdapterFailure.invalid("text-empty:\(step.id)") }
        }
    }

    static func flags(_ names: [String]?) -> CGEventFlags {
        var result = CGEventFlags()
        for name in names ?? [] {
            switch name {
            case "command": result.insert(.maskCommand)
            case "shift": result.insert(.maskShift)
            case "option": result.insert(.maskAlternate)
            case "control": result.insert(.maskControl)
            default: break
            }
        }
        return result
    }

    static func pointerStepsBelongToTarget(_ steps: [InputStep], bundleId: String) -> Bool {
        let pids = Set(NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).map(\.processIdentifier))
        guard !pids.isEmpty,
              let windowInfo = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return false }
        let targetRects: [CGRect] = windowInfo.compactMap { entry in
            guard let pid = entry[kCGWindowOwnerPID as String] as? Int, pids.contains(pid_t(pid)),
                  let bounds = entry[kCGWindowBounds as String] as? [String: NSNumber],
                  let x = bounds["X"], let y = bounds["Y"], let width = bounds["Width"], let height = bounds["Height"] else { return nil }
            return CGRect(x: x.doubleValue, y: y.doubleValue, width: width.doubleValue, height: height.doubleValue)
        }
        return steps.allSatisfy { step in
            guard ["move", "click"].contains(step.type), let x = step.x, let y = step.y else { return false }
            return targetRects.contains { $0.contains(CGPoint(x: x, y: y)) }
        }
    }

    static func postMouse(type: CGEventType, point: CGPoint, button: CGMouseButton, clickCount: Int64 = 1) throws {
        guard let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button) else {
            throw AdapterFailure.execution("mouse-event-create-failed")
        }
        event.setIntegerValueField(.mouseEventClickState, value: clickCount)
        event.post(tap: .cghidEventTap)
    }

    static func move(to target: CGPoint, durationMs: Int) throws {
        let start = CGEvent(source: nil)?.location ?? target
        let frames = max(1, min(240, durationMs / 8))
        for index in 1...frames {
            let progress = Double(index) / Double(frames)
            let eased = progress * progress * (3 - 2 * progress)
            let point = CGPoint(x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased)
            try postMouse(type: .mouseMoved, point: point, button: .left)
            if durationMs > 0 { usleep(useconds_t(max(1, durationMs * 1_000 / frames))) }
        }
    }

    static func click(at point: CGPoint, buttonName: String, count: Int) throws {
        let button: CGMouseButton = buttonName == "right" ? .right : .left
        let down: CGEventType = buttonName == "right" ? .rightMouseDown : .leftMouseDown
        let up: CGEventType = buttonName == "right" ? .rightMouseUp : .leftMouseUp
        for clickIndex in 1...count {
            try postMouse(type: down, point: point, button: button, clickCount: Int64(clickIndex))
            usleep(45_000)
            try postMouse(type: up, point: point, button: button, clickCount: Int64(clickIndex))
            if clickIndex < count { usleep(90_000) }
        }
    }

    static func pressKey(code: Int, modifierNames: [String]?) throws {
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: CGKeyCode(code), keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: CGKeyCode(code), keyDown: false) else {
            throw AdapterFailure.execution("key-event-create-failed")
        }
        let eventFlags = flags(modifierNames)
        down.flags = eventFlags
        up.flags = eventFlags
        down.post(tap: .cghidEventTap)
        usleep(35_000)
        up.post(tap: .cghidEventTap)
    }

    static func typeText(_ text: String) throws {
        for codeUnit in text.utf16 {
            guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
                  let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else {
                throw AdapterFailure.execution("text-event-create-failed")
            }
            var value = codeUnit
            down.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
            up.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
            down.post(tap: .cghidEventTap)
            up.post(tap: .cghidEventTap)
            usleep(8_000)
        }
    }

    static func detail(for step: InputStep) -> String {
        switch step.type {
        case "move": return "point=\(Int(step.x ?? 0)),\(Int(step.y ?? 0)) durationMs=\(step.durationMs ?? 0)"
        case "click": return "point=\(Int(step.x ?? 0)),\(Int(step.y ?? 0)) button=\(step.button ?? "left") count=\(step.clickCount ?? 1)"
        case "key": return "keyCode=\(step.keyCode ?? -1) modifiers=\((step.modifiers ?? []).joined(separator: "+"))"
        case "text": return "utf16Length=\((step.text ?? "").utf16.count)"
        default: return "wait-until=\(step.atMs)ms"
        }
    }

    static func main() {
        guard let planPath = argument("--plan") else { fail("missing---plan") }
        let execute = CommandLine.arguments.contains("--execute")
        let activateTarget = CommandLine.arguments.contains("--activate-target")
        let reportPath = argument("--report")
        do {
            let plan = try JSONDecoder().decode(InputPlan.self, from: Data(contentsOf: URL(fileURLWithPath: planPath)))
            try validate(plan)
            let trusted = AXIsProcessTrusted()
            let pointerOnlyTargetVerified = execute && pointerStepsBelongToTarget(plan.steps, bundleId: plan.expectedFrontmostBundleId)
            if execute && activateTarget && !pointerOnlyTargetVerified && NSWorkspace.shared.frontmostApplication?.bundleIdentifier != plan.expectedFrontmostBundleId {
                guard let application = NSRunningApplication.runningApplications(withBundleIdentifier: plan.expectedFrontmostBundleId).first(where: { !$0.isTerminated }) else {
                    throw AdapterFailure.execution("target-application-not-running:\(plan.expectedFrontmostBundleId)")
                }
                var activated = false
                for _ in 0..<3 {
                    _ = application.activate(options: [.activateAllWindows])
                    usleep(350_000)
                    if NSWorkspace.shared.frontmostApplication?.bundleIdentifier == plan.expectedFrontmostBundleId {
                        activated = true
                        break
                    }
                }
                guard activated else { throw AdapterFailure.execution("target-application-activation-failed:\(plan.expectedFrontmostBundleId)") }
            }
            let actualBundleId = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
            if execute {
                guard trusted else { throw AdapterFailure.execution("accessibility-permission-not-granted") }
                guard pointerOnlyTargetVerified || actualBundleId == plan.expectedFrontmostBundleId else {
                    throw AdapterFailure.execution("frontmost-bundle-mismatch expected=\(plan.expectedFrontmostBundleId) actual=\(actualBundleId ?? "none")")
                }
            }
            let start = DispatchTime.now().uptimeNanoseconds
            var trace: [TraceRow] = []
            for step in plan.steps {
                if execute {
                    let elapsedMs = Int((DispatchTime.now().uptimeNanoseconds - start) / 1_000_000)
                    if step.atMs > elapsedMs { usleep(useconds_t((step.atMs - elapsedMs) * 1_000)) }
                    switch step.type {
                    case "move": try move(to: CGPoint(x: step.x!, y: step.y!), durationMs: step.durationMs ?? 0)
                    case "click": try click(at: CGPoint(x: step.x!, y: step.y!), buttonName: step.button ?? "left", count: step.clickCount ?? 1)
                    case "key": try pressKey(code: step.keyCode!, modifierNames: step.modifiers)
                    case "text": try typeText(step.text!)
                    case "wait": break
                    default: break
                    }
                }
                trace.append(TraceRow(id: step.id, type: step.type, atMs: step.atMs, status: execute ? "EXECUTED" : "VALIDATED", detail: detail(for: step)))
            }
            let report = RunReport(contract: "A1NativeInputRunReport/v1", status: "PASS", mode: execute ? "EXECUTE" : "DRY_RUN", planId: plan.planId, expectedFrontmostBundleId: plan.expectedFrontmostBundleId, actualFrontmostBundleId: actualBundleId, accessibilityTrusted: trusted, steps: trace)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(report)
            if let reportPath { try data.write(to: URL(fileURLWithPath: reportPath)) }
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8))
        } catch {
            fail(String(describing: error))
        }
    }
}

extension Array {
    func chunked(maximum: Int) -> [[Element]] {
        guard maximum > 0 else { return [self] }
        return stride(from: 0, to: count, by: maximum).map { start in
            Array(self[start..<Swift.min(start + maximum, count)])
        }
    }
}
