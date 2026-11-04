import crypto from "node:crypto";
import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";
const sharp = createRequire(new URL("../../apps/studio-next/package.json", import.meta.url))("sharp");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

/**
 * Convert an approved paper-backed ImageGen lettering direction into a
 * deterministic transparent actor. The generated source remains immutable;
 * this derivative only removes low-chroma paper pixels so the lettering can
 * sit inside a real scene without becoming another rectangular document card.
 */
export async function createGlyphCutout({inputPath, outputPath}) {
  const inputBytes = fs.readFileSync(inputPath);
  const {data, info} = await sharp(inputBytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const output = Buffer.from(data);
  for (let offset = 0; offset < output.length; offset += 4) {
    const red = output[offset];
    const green = output[offset + 1];
    const blue = output[offset + 2];
    const darkness = Math.max(255 - red, 255 - green, 255 - blue);
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    // Warm paper has low darkness but non-zero yellow chroma. Threshold both
    // channels before combining them; otherwise the cream stock survives as a
    // translucent rectangle and defeats the purpose of the cutout.
    const inkSignal = Math.max(darkness - 58, (chroma - 48) * 1.8);
    const alpha = Math.max(0, Math.min(255, Math.round((inkSignal - 6) * 4)));
    output[offset + 3] = alpha < 12 ? 0 : alpha;
  }
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  await sharp(output, {raw: info})
    .trim({background: {r: 0, g: 0, b: 0, alpha: 0}, threshold: 3})
    .png({compressionLevel: 9})
    .toFile(outputPath);
  const bytes = fs.readFileSync(outputPath);
  const metadata = await sharp(bytes).metadata();
  return {
    contract: "A1GeneratedGlyphTransparentActor/v1",
    sourceSha256: sha256(inputBytes),
    sha256: sha256(bytes),
    width: metadata.width,
    height: metadata.height,
  };
}
