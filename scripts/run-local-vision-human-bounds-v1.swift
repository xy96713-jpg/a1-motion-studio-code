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

func payload(_ box: CGRect) -> [String: Double] {
    [
        "x": box.origin.x,
        "y": 1.0 - box.origin.y - box.height,
        "width": box.width,
        "height": box.height,
    ]
}

let faceRequest = VNDetectFaceRectanglesRequest()
let humanRequest = VNDetectHumanRectanglesRequest()
let handler = VNImageRequestHandler(cgImage: image, options: [:])
do {
    try handler.perform([faceRequest, humanRequest])
    let faces = (faceRequest.results ?? []).map { payload($0.boundingBox) }
    let humans = (humanRequest.results ?? []).map { payload($0.boundingBox) }
    let result: [String: Any] = [
        "status": "PASS",
        "width": image.width,
        "height": image.height,
        "faces": faces,
        "humans": humans,
        "method": "local-vision-face-and-human-bounds-v1",
    ]
    let data = try JSONSerialization.data(withJSONObject: result)
    print(String(data: data, encoding: .utf8)!)
} catch {
    print("{\"status\":\"BLOCKED\",\"reason\":\"vision-perform-failed\"}")
    exit(2)
}
