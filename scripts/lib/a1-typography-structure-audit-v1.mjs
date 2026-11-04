const assertBufferLength = (buffer, expected, label) => {
  if (!Buffer.isBuffer(buffer) || buffer.length !== expected) throw new Error(`typography-pixel-buffer-invalid:${label}:${buffer?.length}:${expected}`);
};

const countOverlap = (left, right) => {
  let count = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] > 0 && right[index] > 0) count += 1;
  }
  return count;
};

export function auditTypographyStructurePixels({width, height, sourceRgb, candidateRgb, titleAlpha, glyphs = [], masks, subjectBounds, gates}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("typography-pixel-dimensions-invalid");
  const pixelCount = width * height;
  assertBufferLength(sourceRgb, pixelCount * 3, "source-rgb");
  assertBufferLength(candidateRgb, pixelCount * 3, "candidate-rgb");
  assertBufferLength(titleAlpha, pixelCount, "title-alpha");
  for (const [role, mask] of Object.entries(masks || {})) assertBufferLength(mask, pixelCount, `mask-${role}`);
  for (const glyph of glyphs) assertBufferLength(glyph.alpha, pixelCount, `glyph-${glyph.id}`);
  if (!masks?.unified) throw new Error("typography-unified-mask-required");
  if (!subjectBounds || ![subjectBounds.left, subjectBounds.top, subjectBounds.right, subjectBounds.bottom].every(Number.isFinite)) throw new Error("typography-subject-bounds-required");
  const protectionMaskRole = masks.protectedPresenter ? "protectedPresenter" : "unified";
  const protectionMask = masks[protectionMaskRole];

  let protectedChangedPixels = 0;
  let titlePixels = 0;
  let occludedTitlePixels = 0;
  let visibleLeftPixels = 0;
  let visibleRightPixels = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (protectionMask[index] > 0) {
      const base = index * 3;
      if (sourceRgb[base] !== candidateRgb[base] || sourceRgb[base + 1] !== candidateRgb[base + 1] || sourceRgb[base + 2] !== candidateRgb[base + 2]) protectedChangedPixels += 1;
    }
    if (titleAlpha[index] <= 0) continue;
    titlePixels += 1;
    if (protectionMask[index] > 0) {
      occludedTitlePixels += 1;
      continue;
    }
    const x = index % width;
    if (x < subjectBounds.left) visibleLeftPixels += 1;
    if (x >= subjectBounds.right) visibleRightPixels += 1;
  }
  const occlusionRatio = occludedTitlePixels / Math.max(1, titlePixels);
  const continuationSides = Number(visibleLeftPixels > 0) + Number(visibleRightPixels > 0);
  const zoneMasks = Object.entries(masks).filter(([role]) => !["unified", "protectedPresenter", "face", "eyes", "mouth"].includes(role));
  const actualZones = zoneMasks
    .map(([role, mask]) => ({role, overlapPixels: countOverlap(titleAlpha, mask)}))
    .filter((item) => item.overlapPixels > 0);
  const glyphVisibility = glyphs.map((glyph) => {
    let glyphPixels = 0;
    let visiblePixels = 0;
    for (let index = 0; index < pixelCount; index += 1) {
      if (glyph.alpha[index] <= 0) continue;
      glyphPixels += 1;
      if (protectionMask[index] <= 0) visiblePixels += 1;
    }
    const boxWidth = Math.max(0, glyph.bounds.right - glyph.bounds.left);
    const boxHeight = Math.max(0, glyph.bounds.bottom - glyph.bounds.top);
    const boxArea = boxWidth * boxHeight;
    const visibleBoxWidth = Math.max(0, Math.min(width, glyph.bounds.right) - Math.max(0, glyph.bounds.left));
    const visibleBoxHeight = Math.max(0, Math.min(height, glyph.bounds.bottom) - Math.max(0, glyph.bounds.top));
    return {
      id: glyph.id,
      glyphPixels,
      visiblePixels,
      visibleRatio: visiblePixels / Math.max(1, glyphPixels),
      canvasCoverageRatio: (visibleBoxWidth * visibleBoxHeight) / Math.max(1, boxArea),
      bounds: glyph.bounds,
    };
  });

  const failures = [];
  if (protectedChangedPixels > 0) failures.push("SOURCE_PROTECTION_CHANGED");
  if (actualZones.length < Number(gates.minimumContactZones || 0)) failures.push("CONTACT_ZONES_INSUFFICIENT");
  if (continuationSides < Number(gates.minimumTitleContinuationSides || 0)) failures.push("TITLE_CONTINUATION_INSUFFICIENT");
  if (occlusionRatio < Number(gates.minimumAffectedRunOcclusionRatio || 0)) failures.push("TITLE_OCCLUSION_TOO_LOW");
  if (occlusionRatio > Number(gates.maximumAffectedRunOcclusionRatio ?? 1)) failures.push("TITLE_OCCLUSION_TOO_HIGH");
  if (glyphVisibility.some((glyph) => glyph.visibleRatio < Number(gates.minimumKeyGlyphVisibleRatio || 0))) failures.push("KEY_GLYPH_VISIBILITY_LOW");
  if (glyphVisibility.some((glyph) => glyph.canvasCoverageRatio < Number(gates.minimumGlyphCanvasCoverageRatio || 0))) failures.push("GLYPH_OUT_OF_BOUNDS");

  const equipmentCoverage = Object.fromEntries(["microphone", "boom"].filter((role) => masks[role]).map((role) => {
    let changedPixels = 0;
    for (let index = 0; index < pixelCount; index += 1) {
      if (masks[role][index] <= 0 || titleAlpha[index] <= 0) continue;
      const base = index * 3;
      if (sourceRgb[base] !== candidateRgb[base] || sourceRgb[base + 1] !== candidateRgb[base + 1] || sourceRgb[base + 2] !== candidateRgb[base + 2]) changedPixels += 1;
    }
    return [role, {titleOverlapPixels: countOverlap(titleAlpha, masks[role]), changedPixels, protectionRequired: false}];
  }));

  return {
    contract: "A1TypographyStructurePixelAudit/v1",
    status: failures.length ? "FAIL" : "PASS",
    failures,
    sourceProtection: {maskRole: protectionMaskRole, changedPixels: protectedChangedPixels},
    equipmentCoverage,
    titleRelationship: {
      titlePixels,
      occludedTitlePixels,
      occlusionRatio,
      continuationSides,
      visibleLeftPixels,
      visibleRightPixels,
    },
    contactGraph: {actualZones},
    glyphVisibility,
  };
}
