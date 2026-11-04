import Foundation
import ImageIO
import Vision

struct Line: Codable {
    let text: String
    let confidence: Float
}

struct Result: Codable {
    let path: String
    let status: String
    let lines: [Line]
    let error: String?
}

var output: [Result] = []
for file in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: file)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        output.append(Result(path: file, status: "DECODE_FAILED", lines: [], error: "image source unavailable"))
        continue
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = false
    do {
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
        let lines = (request.results ?? []).compactMap { observation -> Line? in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            return Line(text: candidate.string, confidence: candidate.confidence)
        }
        output.append(Result(path: file, status: "OCR_REVIEW_ONLY", lines: lines, error: nil))
    } catch {
        output.append(Result(path: file, status: "OCR_FAILED", lines: [], error: String(describing: error)))
    }
}
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
let data = try encoder.encode(output)
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write(Data("\n".utf8))
