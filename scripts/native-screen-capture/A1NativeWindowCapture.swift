import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

struct CaptureMetadata: Codable {
    let contract: String
    let status: String
    let shotId: String
    let bundleIdentifier: String
    let windowId: UInt32
    let windowTitle: String
    let ownerName: String
    let width: Int
    let height: Int
    let fps: Int
    let durationSeconds: Double
    let outputPath: String
}

final class StreamOutput: NSObject, SCStreamOutput, SCStreamDelegate {
    let writer: AVAssetWriter
    let input: AVAssetWriterInput
    let outputURL: URL
    let expectedDuration: Double
    var firstSampleTime: CMTime?
    var lastSampleTime: CMTime?
    var appendCount = 0
    var streamError: Error?

    init(outputURL: URL, width: Int, height: Int, fps: Int, duration: Double) throws {
        self.outputURL = outputURL
        self.expectedDuration = duration
        self.writer = try AVAssetWriter(outputURL: outputURL, fileType: .mov)
        self.input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: width * height * 8,
                AVVideoExpectedSourceFrameRateKey: fps,
                AVVideoMaxKeyFrameIntervalKey: fps,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            ],
        ])
        self.input.expectsMediaDataInRealTime = true
        super.init()
        guard writer.canAdd(input) else { throw NSError(domain: "A1ScreenCapture", code: 1, userInfo: [NSLocalizedDescriptionKey: "cannot-add-video-input"]) }
        writer.add(input)
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard outputType == .screen, CMSampleBufferIsValid(sampleBuffer) else { return }
        if firstSampleTime == nil {
            firstSampleTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            guard writer.startWriting() else { streamError = writer.error; return }
            writer.startSession(atSourceTime: firstSampleTime!)
        }
        guard input.isReadyForMoreMediaData else { return }
        if input.append(sampleBuffer) {
            appendCount += 1
            lastSampleTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        } else {
            streamError = writer.error
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        streamError = error
    }
}

@main
struct A1NativeWindowCapture {
    static func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data(("ERROR " + message + "\n").utf8))
        exit(1)
    }

    static func argument(_ name: String, default value: String? = nil) -> String? {
        let args = CommandLine.arguments
        guard let index = args.firstIndex(of: name), index + 1 < args.count else { return value }
        return args[index + 1]
    }

    static func main() async {
        let bundleId = argument("--bundle-id", default: "com.google.Chrome")!
        let titleContains = argument("--title-contains")
        let outputPath = argument("--output") ?? "capture.mov"
        let metadataPath = argument("--metadata") ?? outputPath + ".json"
        let shotId = argument("--shot-id", default: "CANARY")!
        let duration = Double(argument("--duration", default: "5")!) ?? 5
        let fps = Int(argument("--fps", default: "60")!) ?? 60

        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            let candidates = content.windows.filter { window in
                guard window.isOnScreen, window.owningApplication?.bundleIdentifier == bundleId else { return false }
                guard let titleContains else { return true }
                return (window.title ?? "").localizedCaseInsensitiveContains(titleContains)
            }
            guard let window = candidates.first else {
                let names = candidates.map { "\($0.windowID):\($0.title)" }.joined(separator: "|")
                fail("window-not-found bundle=\(bundleId) title=\(titleContains ?? "*") candidates=\(names)")
            }
            let frame = window.frame
            guard frame.width > 0, frame.height > 0 else { fail("window-empty-frame") }
            let width = Int(frame.width) * 2
            let height = Int(frame.height) * 2
            let outputURL = URL(fileURLWithPath: outputPath).standardizedFileURL
            try? FileManager.default.removeItem(at: outputURL)
            let recorder = try StreamOutput(outputURL: outputURL, width: width, height: height, fps: fps, duration: duration)
            let filter = SCContentFilter(desktopIndependentWindow: window)
            let configuration = SCStreamConfiguration()
            configuration.width = width
            configuration.height = height
            configuration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
            configuration.queueDepth = 5
            configuration.pixelFormat = kCVPixelFormatType_32BGRA
            configuration.showsCursor = false
            configuration.capturesAudio = false
            let stream = SCStream(filter: filter, configuration: configuration, delegate: recorder)
            try stream.addStreamOutput(recorder, type: SCStreamOutputType.screen, sampleHandlerQueue: DispatchQueue(label: "a1.native.capture"))
            try await stream.startCapture()
            print("CAPTURE_STARTED windowId=\(window.windowID) title=\(window.title ?? "") owner=\(window.owningApplication?.applicationName ?? "") size=\(width)x\(height)")
            try await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
            try await stream.stopCapture()
            recorder.input.markAsFinished()
            await recorder.writer.finishWriting()
            if let error = recorder.streamError ?? recorder.writer.error { fail("capture-failed \(error.localizedDescription)") }
            guard recorder.appendCount > 0 else { fail("capture-empty") }
            let metadata = CaptureMetadata(contract: "A1NativeScreenCaptureKitWindowCapture/v1", status: "PASS", shotId: shotId, bundleIdentifier: bundleId, windowId: window.windowID, windowTitle: window.title ?? "", ownerName: window.owningApplication?.applicationName ?? "", width: width, height: height, fps: fps, durationSeconds: duration, outputPath: outputURL.path)
            let data = try JSONEncoder().encode(metadata)
            try data.write(to: URL(fileURLWithPath: metadataPath))
            print("CAPTURE_COMPLETE frames=\(recorder.appendCount) output=\(outputURL.path) metadata=\(metadataPath)")
        } catch {
            fail(error.localizedDescription)
        }
    }
}
