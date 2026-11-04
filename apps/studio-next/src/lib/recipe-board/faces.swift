// Face boxes with macOS Vision: local, deterministic, no download. Usage: swift faces.swift <image>
// Prints JSON: [[x, y, w, h], ...] normalised to the image, origin top left.
import AppKit
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 2, let image = CIImage(contentsOf: URL(fileURLWithPath: args[1]), options: [.applyOrientationProperty: true]) else {
  FileHandle.standardError.write("usage: faces.swift <image>\n".data(using: .utf8)!)
  exit(2)
}
let request = VNDetectFaceRectanglesRequest()
do {
  try VNImageRequestHandler(ciImage: image).perform([request])
} catch {
  FileHandle.standardError.write("\(error)\n".data(using: .utf8)!)
  exit(1)
}
let boxes = (request.results ?? []).map { f -> [Double] in
  let b = f.boundingBox
  return [Double(b.minX), Double(1 - b.maxY), Double(b.width), Double(b.height)]
}
let data = try JSONSerialization.data(withJSONObject: boxes)
print(String(data: data, encoding: .utf8)!)
