// OCR every image in a folder (Vision, zh-Hans): prints one JSON line per file {file, text}
import Foundation
import Vision
let dir = CommandLine.arguments[1]
let files = try! FileManager.default.contentsOfDirectory(atPath: dir).filter { $0.hasSuffix(".png") || $0.hasSuffix(".jpg") }.sorted()
for f in files {
  let req = VNRecognizeTextRequest(); req.recognitionLevel = .accurate; req.recognitionLanguages = ["zh-Hans", "en-US"]; req.usesLanguageCorrection = false
  try? VNImageRequestHandler(url: URL(fileURLWithPath: dir + "/" + f)).perform([req])
  let t = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
  let o = try! JSONSerialization.data(withJSONObject: ["file": f, "text": t]); print(String(data: o, encoding: .utf8)!)
}
