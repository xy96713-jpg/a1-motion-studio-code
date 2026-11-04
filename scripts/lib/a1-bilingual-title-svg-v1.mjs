import fs from "node:fs";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const fontkit = require("fontkit");

const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`bilingual-title-non-finite:${label}`);
  return value;
};

export function loadBilingualTitleFont(file, role, {postscriptName = null} = {}) {
  if (!fs.existsSync(file)) throw new Error(`bilingual-title-font-missing:${role}`);
  const font = postscriptName ? fontkit.openSync(file, postscriptName) : fontkit.create(fs.readFileSync(file));
  if (!font?.unitsPerEm) throw new Error(`bilingual-title-font-invalid:${role}`);
  if (postscriptName && font.postscriptName !== postscriptName) throw new Error(`bilingual-title-font-face-mismatch:${role}:${font.postscriptName}`);
  return {font, role, file, family: font.familyName || font.postscriptName || role, postscriptName: font.postscriptName || null};
}

function shapeMetrics(font, text, trackingUnits = 0) {
  const run = font.layout(text);
  if (!run.glyphs.length) throw new Error("bilingual-title-empty-run");
  let cursorX = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const entries = [];
  for (let index = 0; index < run.glyphs.length; index += 1) {
    const glyph = run.glyphs[index];
    const position = run.positions[index];
    if (!glyph || glyph.id === 0) throw new Error(`bilingual-title-missing-glyph:${text}:${index}`);
    const bbox = glyph.bbox;
    const originX = cursorX + position.xOffset;
    const originY = position.yOffset;
    minX = Math.min(minX, originX + bbox.minX);
    maxX = Math.max(maxX, originX + bbox.maxX);
    minY = Math.min(minY, originY + bbox.minY);
    maxY = Math.max(maxY, originY + bbox.maxY);
    entries.push({glyph, position, originX, originY});
    cursorX += position.xAdvance + (index < run.glyphs.length - 1 ? trackingUnits : 0);
  }
  return {entries, advance: cursorX, minX, minY, maxX, maxY};
}

export function buildGlyphPathRun({id, fontBinding, text, left, top, size, scaleX = 1, scaleY = 1, tracking = 0, fill = "#ffffff", opacity = 1}) {
  if (!text?.trim()) throw new Error(`bilingual-title-empty-text:${id}`);
  for (const [label, value] of Object.entries({left, top, size, scaleX, scaleY, tracking, opacity})) finite(value, `${id}:${label}`);
  const {font, role, family} = fontBinding;
  const unitScale = size / font.unitsPerEm;
  const sx = unitScale * scaleX;
  const sy = unitScale * scaleY;
  if (sx <= 0 || sy <= 0) throw new Error(`bilingual-title-invalid-scale:${id}`);
  const shaped = shapeMetrics(font, text, tracking / sx);
  const width = (shaped.maxX - shaped.minX) * sx;
  const height = (shaped.maxY - shaped.minY) * sy;
  const baseX = left - shaped.minX * sx;
  const baseline = top + shaped.maxY * sy;
  const glyphBounds = shaped.entries.map(({glyph, originX, originY}, index) => {
    const bbox = glyph.bbox;
    const glyphLeft = baseX + (originX + bbox.minX) * sx;
    const glyphRight = baseX + (originX + bbox.maxX) * sx;
    const glyphTop = baseline - (originY + bbox.maxY) * sy;
    const glyphBottom = baseline - (originY + bbox.minY) * sy;
    return {
      index,
      glyphId: glyph.id,
      bounds: {
        left: glyphLeft,
        top: glyphTop,
        right: glyphRight,
        bottom: glyphBottom,
        width: glyphRight - glyphLeft,
        height: glyphBottom - glyphTop,
      },
    };
  });
  const paths = shaped.entries.map(({glyph, originX, originY}) => {
    const x = baseX + originX * sx;
    const y = baseline - originY * sy;
    return `<path data-glyph-id="${glyph.id}" d="${glyph.path.toSVG()}" transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${sx.toFixed(8)} ${(-sy).toFixed(8)})"/>`;
  });
  return {
    id,
    text,
    role,
    family,
    tracking,
    glyphIds: shaped.entries.map(({glyph}) => glyph.id),
    glyphBounds,
    glyphMarkups: paths,
    bounds: {left, top, right: left + width, bottom: top + height, width, height},
    advanceWidth: shaped.advance * sx,
    markup: `<g id="${id}" data-text="${text}" fill="${fill}" opacity="${opacity}">${paths.join("")}</g>`,
  };
}

export function assertBilingualTitleLayout(runs, {canvasWidth = 1920, canvasHeight = 1080, minimumGap = 8} = {}) {
  if (!Array.isArray(runs) || runs.length < 2) throw new Error("bilingual-title-runs-required");
  for (const run of runs) {
    const {left, top, right, bottom, width, height} = run.bounds;
    if (left < 0 || top < 0 || right > canvasWidth || bottom > canvasHeight) throw new Error(`bilingual-title-out-of-bounds:${run.id}`);
    if (width <= 0 || height <= 0 || !run.glyphIds.length) throw new Error(`bilingual-title-empty-bounds:${run.id}`);
  }
  const vertical = [...runs].sort((a, b) => a.bounds.top - b.bounds.top);
  for (let index = 1; index < vertical.length; index += 1) {
    const gap = vertical[index].bounds.top - vertical[index - 1].bounds.bottom;
    if (gap < minimumGap) throw new Error(`bilingual-title-line-collision:${vertical[index - 1].id}:${vertical[index].id}:${gap.toFixed(3)}`);
  }
  return {
    status: "PASS",
    readingOrder: vertical.map((run) => run.id),
    gaps: vertical.slice(1).map((run, index) => run.bounds.top - vertical[index].bounds.bottom),
  };
}
