import AppKit
import Foundation
import Vision

func topLeftBox(_ box: CGRect) -> [String: Double] {
  [
    "x": Double(box.origin.x),
    "y": Double(1 - box.origin.y - box.size.height),
    "width": Double(box.size.width),
    "height": Double(box.size.height),
  ]
}

func observationBox(_ observation: VNDetectedObjectObservation, _ id: String, _ role: String) -> [String: Any] {
  [
    "id": id,
    "semanticRole": role,
    "box": topLeftBox(observation.boundingBox),
    "confidence": Double(observation.confidence),
  ]
}

func emit(_ value: [String: Any], status: Int32) -> Never {
  do {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
  } catch {
    FileHandle.standardError.write(Data("vision-ocr-json-encode-failed\n".utf8))
    exit(2)
  }
  exit(status)
}

guard CommandLine.arguments.count == 2 else {
  emit(["status": "BLOCKED", "reason": "FRAME_PATH_REQUIRED"], status: 2)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let textRequest = VNRecognizeTextRequest()
textRequest.recognitionLevel = .accurate
textRequest.usesLanguageCorrection = false
textRequest.recognitionLanguages = ["zh-Hans", "en-US"]

let faceRequest = VNDetectFaceRectanglesRequest()
let personRequest = VNDetectHumanRectanglesRequest()
personRequest.upperBodyOnly = false

do {
  try VNImageRequestHandler(url: url).perform([textRequest, faceRequest, personRequest])

  let recognizedText = (textRequest.results ?? []).enumerated().compactMap { index, observation -> [String: Any]? in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    return [
      "id": String(format: "ocr-%03d", index + 1),
      "text": candidate.string,
      "confidence": Double(candidate.confidence),
      "box": topLeftBox(observation.boundingBox),
    ]
  }

  let faces = (faceRequest.results ?? []).enumerated().map { index, observation in
    observationBox(observation, String(format: "face-%03d", index + 1), "FACE")
  }

  let people = (personRequest.results ?? []).enumerated().map { index, observation in
    observationBox(observation, String(format: "person-%03d", index + 1), "PERSON")
  }

  emit([
    "contract": "A1TypographyAppleVisionEvidence/v1",
    "status": "PASS",
    "ocrEngine": "AppleVision.VNRecognizeTextRequest",
    "recognitionLanguages": textRequest.recognitionLanguages,
    "recognizedText": recognizedText,
    "faces": faces,
    "people": people,
  ], status: 0)
} catch {
  emit(["status": "BLOCKED", "reason": "APPLE_VISION_REQUEST_FAILED"], status: 1)
}
