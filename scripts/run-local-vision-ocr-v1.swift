import Foundation
import Vision
import ImageIO

let args = CommandLine.arguments
guard args.count >= 2 else { print("{\"status\":\"BLOCKED\",\"reason\":\"image-required\"}"); exit(2) }
let url = URL(fileURLWithPath: args[1])
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { print("{\"status\":\"BLOCKED\",\"reason\":\"image-decode-failed\"}"); exit(2) }
let semaphore = DispatchSemaphore(value: 0)
let request: VNRecognizeTextRequest = VNRecognizeTextRequest { request, error in
    if let error = error {
        let payload: [String: Any] = ["status": "BLOCKED", "reason": error.localizedDescription]
        if let data = try? JSONSerialization.data(withJSONObject: payload) { print(String(data: data, encoding: .utf8) ?? "{\"status\":\"BLOCKED\"}") }
        semaphore.signal()
        return
    }
    let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
    let details: [[String: Any]] = observations.compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return [
            "text": candidate.string,
            "confidence": candidate.confidence,
            "boundingBox": ["x": box.origin.x, "y": box.origin.y, "width": box.size.width, "height": box.size.height]
        ]
    }
    let values = details.compactMap { $0["text"] as? String }
    let text = values.joined(separator: " ")
    let payload: [String: Any] = ["status": "PASS", "text": text, "segments": values, "segmentDetails": details, "observationCount": values.count, "recognitionLevel": "accurate", "languages": ["zh-Hans", "en-US"]]
    if let data = try? JSONSerialization.data(withJSONObject: payload), let output = String(data: data, encoding: .utf8) { print(output) } else { print("{\"status\":\"BLOCKED\",\"reason\":\"json-encode-failed\"}") }
    semaphore.signal()
}
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = true
let handler = VNImageRequestHandler(cgImage: image, options: [:])
do {
    try handler.perform([request])
} catch {
    print("{\"status\":\"BLOCKED\",\"reason\":\"vision-perform-failed\"}")
    semaphore.signal()
}
semaphore.wait()
