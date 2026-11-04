// Subject cutout with macOS Vision (the same model as "Lift subject" in Photos): local, deterministic,
// no download. Usage: swift cutout.swift <input image> <output.png>
// Writes the foreground subject(s) on a transparent background, cropped to the original frame.
import AppKit
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 3 else {
  FileHandle.standardError.write("usage: cutout.swift <in> <out.png>\n".data(using: .utf8)!)
  exit(2)
}
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
guard let image = CIImage(contentsOf: input, options: [.applyOrientationProperty: true]) else {
  FileHandle.standardError.write("cannot read \(input.path)\n".data(using: .utf8)!)
  exit(1)
}
let handler = VNImageRequestHandler(ciImage: image)
let request = VNGenerateForegroundInstanceMaskRequest()
do {
  try handler.perform([request])
  guard let result = request.results?.first else {
    FileHandle.standardError.write("no subject found\n".data(using: .utf8)!)
    exit(3)
  }
  let buffer = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: false)
  let masked = CIImage(cvPixelBuffer: buffer)
  let context = CIContext()
  guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { exit(1) }
  try context.writePNGRepresentation(of: masked, to: output, format: .RGBA8, colorSpace: space)
} catch {
  FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!)
  exit(1)
}
