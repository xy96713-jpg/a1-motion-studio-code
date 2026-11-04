import AppKit
import CoreText
import ImageIO

enum RenderMode: String {
  case grid03
  case spatial04
}

guard CommandLine.arguments.count == 4 else {
  fputs("usage: render-typography-review-eva-v1.swift <base.png> <output.png> <grid03|spatial04>\n", stderr)
  exit(2)
}

let baseURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
guard let mode = RenderMode(rawValue: CommandLine.arguments[3]) else {
  fputs("unknown render mode\n", stderr)
  exit(2)
}

let fontPath = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
  .appendingPathComponent("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/font-cache/SourceHanSerifCN-Heavy.otf")
guard CTFontManagerRegisterFontsForURL(fontPath as CFURL, .process, nil) else {
  fputs("could not register EVA_MINCHO font at \(fontPath.path)\n", stderr)
  exit(1)
}

guard let source = CGImageSourceCreateWithURL(baseURL as CFURL, nil),
      let base = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
  fputs("could not read base image\n", stderr)
  exit(1)
}

let width = base.width
let height = base.height
let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(
  data: nil,
  width: width,
  height: height,
  bitsPerComponent: 8,
  bytesPerRow: 0,
  space: colorSpace,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
  fputs("could not create bitmap context\n", stderr)
  exit(1)
}

context.interpolationQuality = .high
context.draw(base, in: CGRect(x: 0, y: 0, width: width, height: height))
context.setAllowsAntialiasing(true)
context.setShouldAntialias(true)

let ivory = NSColor(calibratedRed: 0.94, green: 0.92, blue: 0.83, alpha: 0.96).cgColor
let axis = NSColor(calibratedRed: 0.94, green: 0.92, blue: 0.83, alpha: 0.25).cgColor

func evaFont(_ size: CGFloat) -> CTFont {
  guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(fontPath as CFURL) as? [CTFontDescriptor],
        let descriptor = descriptors.first else {
    fatalError("font descriptor unavailable")
  }
  return CTFontCreateWithFontDescriptor(descriptor, size, nil)
}

func drawText(_ text: String, size: CGFloat, x: CGFloat, baseline: CGFloat, scaleX: CGFloat = 0.60, color: CGColor = ivory) {
  let font = evaFont(size)
  let attributes: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: color
  ]
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
  context.saveGState()
  context.translateBy(x: x, y: baseline)
  context.scaleBy(x: scaleX, y: 1)
  CTLineDraw(line, context)
  context.restoreGState()
}

func drawHairline(x1: CGFloat, y1: CGFloat, x2: CGFloat, y2: CGFloat) {
  context.saveGState()
  context.setStrokeColor(axis)
  context.setLineWidth(1)
  context.move(to: CGPoint(x: x1, y: y1))
  context.addLine(to: CGPoint(x: x2, y: y2))
  context.strokePath()
  context.restoreGState()
}

switch mode {
case .grid03:
  // Cell 03: full-frame editorial spread with unequal masses.
  drawText("拆开", size: 430, x: 18, baseline: CGFloat(height) - 460, scaleX: 0.60)
  drawText("看清", size: 365, x: 96, baseline: 120, scaleX: 0.60)
case .spatial04:
  // Cell 04: spatial-axis type attached to the wall seam and table horizon.
  drawHairline(x1: 302, y1: 155, x2: 302, y2: CGFloat(height) - 30)
  drawHairline(x1: 302, y1: 422, x2: 895, y2: 422)
  drawText("拆", size: 105, x: 260, baseline: 670, scaleX: 0.60)
  drawText("开", size: 105, x: 260, baseline: 545, scaleX: 0.60)
  drawText("看清", size: 82, x: 575, baseline: 430, scaleX: 0.60)
}

guard let image = context.makeImage(),
      let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
  fputs("could not encode output image\n", stderr)
  exit(1)
}
try data.write(to: outputURL, options: .atomic)
print("wrote \(outputURL.path) using EVA_MINCHO / SourceHanSerifCN-Heavy")
