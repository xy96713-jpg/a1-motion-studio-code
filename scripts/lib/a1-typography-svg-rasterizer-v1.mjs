import crypto from "node:crypto";

import {Resvg} from "@resvg/resvg-js";

const pngDimensions = (png) => {
  if (!Buffer.isBuffer(png) || png.length < 24 || png.toString("ascii", 1, 4) !== "PNG") throw new Error("typography-svg-raster-png-invalid");
  return {width: png.readUInt32BE(16), height: png.readUInt32BE(20)};
};

export function rasterizeTypographySvg({svg, width, height}) {
  if ((!Buffer.isBuffer(svg) && typeof svg !== "string") || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("typography-svg-raster-input-invalid");
  try {
    const renderer = new Resvg(svg, {
      background: "rgba(0,0,0,0)",
      fitTo: {mode: "width", value: width},
      font: {loadSystemFonts: false, fontFiles: []},
    });
    const png = Buffer.from(renderer.render().asPng());
    const dimensions = pngDimensions(png);
    if (dimensions.width !== width || dimensions.height !== height) throw new Error(`dimensions:${dimensions.width}x${dimensions.height}`);
    return {
      contract: "A1TypographySvgRaster/v1",
      engine: "resvg-js",
      width,
      height,
      png,
      sha256: crypto.createHash("sha256").update(png).digest("hex"),
    };
  } catch (error) {
    throw new Error(`typography-svg-raster-failed:${error instanceof Error ? error.message : String(error)}`);
  }
}
