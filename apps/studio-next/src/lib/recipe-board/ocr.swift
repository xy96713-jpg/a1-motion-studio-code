// Text in a picture with its place (macOS Vision OCR, local, Chinese and English): swift ocr.swift <img>
// Prints JSON: [{ "text", "box": [x, y, w, h] (0-1, origin top left), "confidence" }], one per line of text.
// Used to read where a design sketch put its type, so the real type can be set there by code.
import Foundation
import Vision

let path = CommandLine.arguments[1]
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = false
let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path))
var out: [[String: Any]] = []
if (try? handler.perform([request])) != nil {
  for obs in request.results ?? [] {
    guard let text = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    out.append(["text": text.string, "box": [Double(b.minX), Double(1 - b.maxY), Double(b.width), Double(b.height)], "confidence": Double(text.confidence)])
  }
}
let data = try JSONSerialization.data(withJSONObject: out)
print(String(data: data, encoding: .utf8)!)
