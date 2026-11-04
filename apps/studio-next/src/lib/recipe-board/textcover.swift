// How much of each frame is printed text (macOS Vision OCR, local): swift textcover.swift <img>...
// Prints one JSON array: [{ "path", "chars", "coverage" }], coverage = summed text box area / frame.
// Used to keep title cards, captions and slides out of footage that our own text will sit on.
import Foundation
import Vision

var results: [[String: Any]] = []
for path in CommandLine.arguments.dropFirst() {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .fast
  request.usesLanguageCorrection = false
  let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path))
  var chars = 0
  var coverage = 0.0
  if (try? handler.perform([request])) != nil {
    for obs in request.results ?? [] {
      guard let text = obs.topCandidates(1).first, text.confidence > 0.4 else { continue }
      chars += text.string.count
      coverage += Double(obs.boundingBox.width * obs.boundingBox.height)
    }
  }
  results.append(["path": path, "chars": chars, "coverage": min(1.0, coverage)])
}
let data = try JSONSerialization.data(withJSONObject: results)
print(String(data: data, encoding: .utf8)!)
