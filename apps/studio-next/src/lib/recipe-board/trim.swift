// Crop a transparent PNG to the bounding box of its visible pixels (alpha > 24).
// usage: swift trim.swift in.png out.png
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3,
      let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { exit(1) }
let w = img.width, h = img.height
var px = [UInt8](repeating: 0, count: w * h * 4)
let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
var minX = w, minY = h, maxX = -1, maxY = -1
for y in 0..<h { for x in 0..<w where px[(y * w + x) * 4 + 3] > 24 {
  minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
} }
// Bitmap rows are top-down here (CGContext memory row 0 = top of the image).
let rect = maxX < 0 ? CGRect(x: 0, y: 0, width: w, height: h) : CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
let out = img.cropping(to: rect)!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, out, nil)
exit(CGImageDestinationFinalize(dest) ? 0 : 1)
