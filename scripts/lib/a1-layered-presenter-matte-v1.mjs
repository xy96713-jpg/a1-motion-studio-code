import crypto from "node:crypto";
import sharp from "sharp";

const assertBuffer = (buffer, expected, label) => {
  if (!Buffer.isBuffer(buffer) || buffer.length !== expected) throw new Error(`layered-matte-buffer-invalid:${label}:${buffer?.length}:${expected}`);
};

const blendChannel = (foreground, background, alpha) => Math.round(foreground * alpha + background * (1 - alpha));

export async function composeLayeredPresenterTitle({width, height, sourceRgb, presenterRgb = null, titleRgba, masks, contactTreatment = {}}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("layered-matte-dimensions-invalid");
  const pixelCount = width * height;
  assertBuffer(sourceRgb, pixelCount * 3, "source-rgb");
  const effectivePresenterRgb = presenterRgb ?? sourceRgb;
  assertBuffer(effectivePresenterRgb, pixelCount * 3, "presenter-rgb");
  assertBuffer(titleRgba, pixelCount * 4, "title-rgba");
  for (const role of ["presenter", "boom", "microphone"]) assertBuffer(masks?.[role], pixelCount, role);
  const titleBlurSigma = Number(contactTreatment.titleBlurSigma || 0);
  const titleDarkness = Number(contactTreatment.titleDarkness ?? 0.52);
  if (!Number.isFinite(titleBlurSigma) || titleBlurSigma < 0 || !Number.isFinite(titleDarkness) || titleDarkness < 0 || titleDarkness > 1) throw new Error("layered-matte-contact-treatment-invalid");

  const union = Buffer.alloc(pixelCount);
  const binary = Buffer.alloc(pixelCount);
  let softEdgePixels = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const alpha = masks.presenter[index];
    union[index] = alpha;
    binary[index] = alpha > 8 ? 255 : 0;
    if (alpha > 0 && alpha < 245) softEdgePixels += 1;
  }
  const dilationRadius = Math.max(2, Math.min(6, Math.round(Math.min(width, height) * 0.012)));
  const feathered = await sharp(binary, {raw: {width, height, channels: 1}}).greyscale().blur(Math.max(1, dilationRadius * 0.6)).raw().toBuffer();
  const expanded = Buffer.alloc(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) expanded[index] = Math.max(binary[index], feathered[index]);
  const titleWithContact = Buffer.from(titleRgba);
  const blurredTitle = titleBlurSigma > 0
    ? await sharp(titleRgba, {raw: {width, height, channels: 4}}).blur(titleBlurSigma).raw().toBuffer()
    : null;
  let contactShadowPixels = 0;
  let contactBlurPixels = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const ring = Math.max(0, expanded[index] - union[index]) / 255;
    const subjectAlpha = union[index] / 255;
    const softEdgeContact = subjectAlpha > 0 && subjectAlpha < 1 ? 4 * subjectAlpha * (1 - subjectAlpha) : 0;
    const contact = Math.max(ring, softEdgeContact);
    const titleAlpha = titleRgba[index * 4 + 3] / 255;
    if (contact <= 0 || titleAlpha <= 0) continue;
    if (ring > 0) contactShadowPixels += 1;
    if (blurredTitle) {
      const mix = Math.min(1, contact);
      for (let channel = 0; channel < 3; channel += 1) {
        const offset = index * 4 + channel;
        titleWithContact[offset] = Math.round(titleWithContact[offset] * (1 - mix) + blurredTitle[offset] * mix);
      }
      contactBlurPixels += 1;
    }
    const darkness = 1 - titleDarkness * contact;
    titleWithContact[index * 4] = Math.round(titleWithContact[index * 4] * darkness);
    titleWithContact[index * 4 + 1] = Math.round(titleWithContact[index * 4 + 1] * darkness);
    titleWithContact[index * 4 + 2] = Math.round(titleWithContact[index * 4 + 2] * darkness);
  }

  const output = Buffer.alloc(pixelCount * 4);
  for (let index = 0; index < pixelCount; index += 1) {
    const sourceOffset = index * 3;
    const outputOffset = index * 4;
    const titleOffset = index * 4;
    const titleAlpha = titleWithContact[titleOffset + 3] / 255;
    output[outputOffset] = blendChannel(titleWithContact[titleOffset], sourceRgb[sourceOffset], titleAlpha);
    output[outputOffset + 1] = blendChannel(titleWithContact[titleOffset + 1], sourceRgb[sourceOffset + 1], titleAlpha);
    output[outputOffset + 2] = blendChannel(titleWithContact[titleOffset + 2], sourceRgb[sourceOffset + 2], titleAlpha);
    output[outputOffset + 3] = 255;
  }
  for (const role of ["presenter"]) {
    const mask = masks[role];
    for (let index = 0; index < pixelCount; index += 1) {
      const value = mask[index];
      if (value <= 0) continue;
      const alpha = value >= 245 ? 1 : value / 255;
      const sourceOffset = index * 3;
      const outputOffset = index * 4;
      const foregroundRgb = value >= 245 ? sourceRgb : effectivePresenterRgb;
      output[outputOffset] = blendChannel(foregroundRgb[sourceOffset], output[outputOffset], alpha);
      output[outputOffset + 1] = blendChannel(foregroundRgb[sourceOffset + 1], output[outputOffset + 1], alpha);
      output[outputOffset + 2] = blendChannel(foregroundRgb[sourceOffset + 2], output[outputOffset + 2], alpha);
    }
  }
  let protectedCoreChangedPixels = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (union[index] < 245) continue;
    const sourceOffset = index * 3;
    const outputOffset = index * 4;
    if (sourceRgb[sourceOffset] !== output[outputOffset] || sourceRgb[sourceOffset + 1] !== output[outputOffset + 1] || sourceRgb[sourceOffset + 2] !== output[outputOffset + 2]) protectedCoreChangedPixels += 1;
  }
  const countEquipmentTitleOverlap = (mask) => {
    let count = 0;
    for (let index = 0; index < pixelCount; index += 1) if (mask[index] > 0 && titleRgba[index * 4 + 3] > 0) count += 1;
    return count;
  };
  const png = await sharp(output, {raw: {width, height, channels: 4}}).png().toBuffer();
  const report = {
    contract: "A1LayeredPresenterMatteComposite/v1",
    status: protectedCoreChangedPixels === 0 && softEdgePixels > 0 && contactShadowPixels > 0 && (titleBlurSigma === 0 || contactBlurPixels > 0) ? "PASS" : "FAIL",
    zOrder: ["SOURCE_WITH_EQUIPMENT", "TITLE_WALL", "PRESENTER"],
    protectedRoles: ["PRESENTER"],
    titleMayCover: ["MICROPHONE", "BOOM_ARM", "STAND"],
    protectedCoreThreshold: 245,
    protectedCoreChangedPixels,
    softEdgeColorSource: presenterRgb ? "ESTIMATED_FOREGROUND_RGB" : "SOURCE_RGB",
    softEdgePixels,
    contactShadowPixels,
    contactBlurPixels,
    contactTreatment: {titleBlurSigma, titleDarkness},
    equipmentTitleOverlap: {
      microphonePixels: countEquipmentTitleOverlap(masks.microphone),
      boomPixels: countEquipmentTitleOverlap(masks.boom),
    },
    pngSha256: crypto.createHash("sha256").update(png).digest("hex"),
    reviewOnly: true,
    productionAdmission: false,
  };
  return {png, report};
}
