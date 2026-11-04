import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let arguments = CommandLine.arguments
guard arguments.count == 3 else { fatalError("PERSON_MASK_ARGUMENTS") }
let source = URL(fileURLWithPath: arguments[1])
let destination = URL(fileURLWithPath: arguments[2])
guard !FileManager.default.fileExists(atPath: destination.path),
      let imageSource = CGImageSourceCreateWithURL(source as CFURL, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int,
      width * height <= 24_000_000 else { fatalError("PERSON_MASK_SOURCE_OR_OUTPUT") }
let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = .accurate
request.outputPixelFormat = kCVPixelFormatType_OneComponent8
let handler = VNImageRequestHandler(url: source, options: [:])
try handler.perform([request])
guard let buffer = request.results?.first?.pixelBuffer else { fatalError("PERSON_MASK_UNAVAILABLE") }
let maskWidth = CVPixelBufferGetWidth(buffer)
let maskHeight = CVPixelBufferGetHeight(buffer)
let mask = CIImage(cvPixelBuffer: buffer).transformed(by: CGAffineTransform(scaleX: CGFloat(width) / CGFloat(maskWidth), y: CGFloat(height) / CGFloat(maskHeight)))
let context = CIContext(options: [.cacheIntermediates: false])
guard let cgMask = context.createCGImage(mask, from: CGRect(x: 0, y: 0, width: width, height: height), format: .L8, colorSpace: CGColorSpaceCreateDeviceGray()),
      let writer = CGImageDestinationCreateWithURL(destination as CFURL, UTType.png.identifier as CFString, 1, nil) else { fatalError("PERSON_MASK_ENCODING") }
CGImageDestinationAddImage(writer, cgMask, nil)
guard CGImageDestinationFinalize(writer) else { fatalError("PERSON_MASK_WRITE") }
print("SOURCE_PERSON_MASK_WRITTEN \(width)x\(height)")
