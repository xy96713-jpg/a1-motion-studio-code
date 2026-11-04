// OCR every image in a folder with each line's place (Vision, zh-Hans + en): one JSON line per file
// {file, lines: [{text, box: [x, y, w, h] (0-1, top left)}]}. Used by refprofile.py to measure a reference film.
import Foundation
import Vision
let dir = CommandLine.arguments[1]
let files = try! FileManager.default.contentsOfDirectory(atPath: dir).filter { $0.hasSuffix(".png") || $0.hasSuffix(".jpg") }.sorted()
for f in files {
  let req = VNRecognizeTextRequest(); req.recognitionLevel = .accurate; req.recognitionLanguages = ["zh-Hans", "en-US"]; req.usesLanguageCorrection = false
  try? VNImageRequestHandler(url: URL(fileURLWithPath: dir + "/" + f)).perform([req])
  var lines: [[String: Any]] = []
  for o in req.results ?? [] {
    guard let t = o.topCandidates(1).first, t.confidence > 0.3 else { continue }
    let b = o.boundingBox
    lines.append(["text": t.string, "box": [Double(b.minX), Double(1 - b.maxY), Double(b.width), Double(b.height)]])
  }
  let d = try! JSONSerialization.data(withJSONObject: ["file": f, "lines": lines]); print(String(data: d, encoding: .utf8)!)
}
