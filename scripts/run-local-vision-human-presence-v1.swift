import Foundation
import Vision
import ImageIO

let args = CommandLine.arguments
guard args.count >= 2 else { print("{\"status\":\"BLOCKED\",\"reason\":\"image-required\"}"); exit(2) }
let url = URL(fileURLWithPath: args[1])
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    print("{\"status\":\"BLOCKED\",\"reason\":\"image-decode-failed\"}")
    exit(2)
}

let semaphore = DispatchSemaphore(value: 0)
var faceCount = 0
var humanRectCount = 0
var failure: String?
let faceRequest = VNDetectFaceRectanglesRequest { request, error in
    if let error { failure = error.localizedDescription; return }
    faceCount = (request.results as? [VNFaceObservation])?.count ?? 0
}
let humanRequest = VNDetectHumanRectanglesRequest { request, error in
    if let error { failure = error.localizedDescription; return }
    humanRectCount = (request.results as? [VNHumanObservation])?.count ?? 0
}
let handler = VNImageRequestHandler(cgImage: image, options: [:])
do {
    try handler.perform([faceRequest, humanRequest])
    let payload: [String: Any] = failure == nil
        ? ["status": "PASS", "faceCount": faceCount, "humanRectCount": humanRectCount, "method": "local-vision-face-and-human-rectangles-v1"]
        : ["status": "BLOCKED", "reason": failure ?? "vision-request-failed"]
    if let data = try? JSONSerialization.data(withJSONObject: payload), let output = String(data: data, encoding: .utf8) { print(output) }
} catch {
    print("{\"status\":\"BLOCKED\",\"reason\":\"vision-perform-failed\"}")
}
semaphore.signal()
semaphore.wait()
