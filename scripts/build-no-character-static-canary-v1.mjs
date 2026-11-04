import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const root = process.cwd();
const logicalWidth = 240;
const logicalHeight = 135;
const outputWidth = 1920;
const outputHeight = 1080;
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/no-character-static-canary-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/no-character-static-canary-v1");
const fontRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/font-cache");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const currentAuthorityPath = path.join(root, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json");

const palette = {
  canvas: "#f3f5f3",
  canvasShadow: "#e2e7e5",
  ink: "#20272b",
  quietInk: "#657277",
  grid: "#cdd7d8",
  cyan: "#2c83a4",
  blue: "#326fe0",
  coral: "#c95b4b",
  paper: "#ffffff",
};

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function rect(x, y, width, height, fill, extra = "") {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" ${extra}/>`;
}

function line(x1, y1, x2, y2, stroke, width = 1, extra = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
}

function circle(cx, cy, r, fill, extra = "") {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
}

function dither(x, y, columns, rows, step, color, opacity = 0.7) {
  const dots = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if ((row + column) % 3 !== 1) dots.push(rect(x + column * step, y + row * step, 1, 1, color, `opacity="${opacity}"`));
    }
  }
  return dots.join("");
}

function backgroundSvg() {
  const grid = [];
  for (let x = 12; x < logicalWidth; x += 12) grid.push(line(x, 0, x, logicalHeight, palette.grid, 0.32, `opacity="0.32"`));
  for (let y = 12; y < logicalHeight; y += 12) grid.push(line(0, y, logicalWidth, y, palette.grid, 0.32, `opacity="0.32"`));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${logicalWidth}" height="${logicalHeight}" viewBox="0 0 ${logicalWidth} ${logicalHeight}">
    ${rect(0, 0, logicalWidth, logicalHeight, palette.canvas)}
    ${rect(0, 108, logicalWidth, 27, palette.canvasShadow, `opacity="0.28"`)}
    ${grid.join("")}
    ${rect(155, 12, 73, 45, palette.paper, `opacity="0.54"`)}
    ${line(155, 12, 228, 12, palette.ink, 0.8, `opacity="0.20"`)}
    ${line(155, 57, 228, 57, palette.ink, 0.8, `opacity="0.20"`)}
    ${dither(195, 18, 21, 12, 2, palette.blue, 0.28)}
  </svg>`;
}

function elementKitSvg() {
  const strips = [
    {y: 34, width: 49, accent: palette.blue, pattern: "short"},
    {y: 54, width: 58, accent: palette.cyan, pattern: "mid"},
    {y: 74, width: 43, accent: palette.coral, pattern: "long"},
  ];
  const parts = [];
  for (const [index, strip] of strips.entries()) {
    const x = 17 + index * 4;
    parts.push(rect(x + 2, strip.y + 2, strip.width, 13, palette.canvasShadow, `opacity="0.75"`));
    parts.push(rect(x, strip.y, strip.width, 13, palette.paper, `stroke="${palette.ink}" stroke-width="1"`));
    parts.push(rect(x + 4, strip.y + 4, 3, 5, strip.accent));
    const lengths = strip.pattern === "short" ? [23, 17, 29] : strip.pattern === "mid" ? [34, 21, 39] : [18, 28, 24];
    lengths.forEach((length, lineIndex) => parts.push(rect(x + 11, strip.y + 4 + lineIndex * 2, length, 1, lineIndex === 1 ? strip.accent : palette.quietInk, `opacity="${lineIndex === 1 ? 0.9 : 0.68}"`)));
    parts.push(dither(x + strip.width - 10, strip.y + 3, 4, 4, 2, strip.accent, 0.65));
  }

  // The central selector is one object, not a fake UI panel.
  parts.push(rect(87, 42, 12, 39, palette.ink));
  parts.push(rect(90, 45, 6, 33, palette.canvas, `stroke="${palette.paper}" stroke-width="0.8"`));
  parts.push(circle(93, 51, 2.8, palette.blue));
  parts.push(circle(93, 62, 2.8, palette.cyan));
  parts.push(circle(93, 73, 2.8, palette.coral));
  parts.push(line(99, 61, 113, 61, palette.ink, 1.2));
  parts.push(line(99, 61, 105, 55, palette.ink, 1.2));
  parts.push(line(99, 61, 105, 67, palette.ink, 1.2));
  parts.push(circle(113, 61, 5, palette.paper, `stroke="${palette.ink}" stroke-width="1.4"`));
  parts.push(circle(113, 61, 2, palette.blue));
  parts.push(rect(108, 84, 17, 3, palette.coral));
  parts.push(rect(111, 87, 11, 2, palette.ink));

  // One selected output object leaves the mechanism; its right side is intentionally quiet for type.
  parts.push(rect(128, 52, 19, 27, palette.paper, `stroke="${palette.ink}" stroke-width="1"`));
  parts.push(rect(132, 57, 5, 17, palette.coral));
  parts.push(rect(140, 57, 3, 3, palette.blue));
  parts.push(rect(140, 63, 3, 3, palette.blue));
  parts.push(rect(140, 69, 3, 3, palette.blue));
  parts.push(dither(134, 58, 2, 7, 2, palette.coral, 0.42));
  parts.push(line(147, 65, 158, 65, palette.ink, 1));
  parts.push(line(155, 62, 158, 65, palette.ink, 1));
  parts.push(line(155, 68, 158, 65, palette.ink, 1));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${logicalWidth}" height="${logicalHeight}" viewBox="0 0 ${logicalWidth} ${logicalHeight}">${parts.join("")}</svg>`;
}

function typographySpec() {
  const fusionPath = path.join(fontRoot, "fusion-pixel.ttf");
  const sourceHanPath = path.join(fontRoot, "SourceHanSansCN-Heavy.otf");
  return {
    contract: "A1EditableTypographySpec/v1",
    status: "RESERVED_FOR_LATE_BINDING",
    formalTextRendered: false,
    systemFallbackForbidden: true,
    safeZone: {x: 155, y: 12, width: 73, height: 45, unit: "logical-pixels", purpose: "title-and-verdict-late-binding"},
    roles: [
      {assetId: "type-pixel-correction", family: "A1 Fusion Pixel", path: "font-cache/fusion-pixel.ttf", sha256: sha256(fs.readFileSync(fusionPath)), role: "signature-local-mark", editable: true},
      {assetId: "type-editorial-heavy", family: "A1 Source Han Heavy", path: "font-cache/SourceHanSansCN-Heavy.otf", sha256: sha256(fs.readFileSync(sourceHanPath)), role: "formal-verdict-after-review", editable: true},
    ],
    bindingRule: "Bind exact copy only after the textless pixel composition is visually accepted; never bake formal text into this canary PNG.",
  };
}

async function render(svg) {
  return sharp(Buffer.from(svg)).resize(outputWidth, outputHeight, {kernel: sharp.kernel.nearest}).png({compressionLevel: 9}).toBuffer();
}

function writeMirror(relative, content) {
  for (const base of [artifactRoot, publicRoot]) {
    const target = path.join(base, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    if (Buffer.isBuffer(content)) fs.writeFileSync(target, content);
    else fs.writeFileSync(target, `${JSON.stringify(content, null, 2)}\n`);
  }
}

const background = await render(backgroundSvg());
const elements = await render(elementKitSvg());
const backgroundPath = "layers/background.png";
const elementsPath = "layers/element-kit.png";
const composite = await sharp(background).composite([{input: elements}]).png({compressionLevel: 9}).toBuffer();
const compositePath = "no-character-static-canary.png";
const spec = typographySpec();
const output = {
  contract: "A1NoCharacterStaticCanary/v1",
  status: "READY_FOR_REVIEW",
  shotId: "ED-12",
  semanticJob: "把多源证据压缩成一个可见判断对象；正式文字后绑定。",
  visualBrief: {
    primaryFamily: "modular-pixel-infographic",
    surfaceLogic: "neutral-cool-white-grid-with-local-dither",
    dominantActor: "editorial-selector-mechanism",
    composition: "asymmetric-convergence-with-quiet-type-zone",
    palette: "cool-white-ink-cyan-coral-blue",
    material: "nearest-neighbor-pixel-grid-and-sparse-dither",
    fingerprint: "modular-pixel-infographic|neutral-cool-white-grid-with-local-dither|editorial-selector-mechanism|asymmetric-convergence-with-quiet-type-zone|cool-white-ink-cyan-coral-blue",
  },
  references: [
    {id: "pinterest-retro-pixel-03", sha256: "5b85a6e3e5cac7f136911293f0fb4025ccb2678d3be53d6e4561b9c94baa6433", adoptedTraits: ["singular machine object", "kit-of-parts explanation"]},
    {id: "pinterest-retro-pixel-06", sha256: "b3e70105fc69e2722f22c4466aa6f98af65c5102270cdf536ca06f0aa2f9afab", adoptedTraits: ["editorial image/type collision", "controlled two-color printing"]},
  ],
  constraints: {
    characterRequired: false,
    characterPreferred: false,
    specificHumanOrMascotDefault: "FORBIDDEN",
    formalTextGenerated: false,
    bakedTextDetected: false,
    fakeUiForbidden: true,
    actualPixelReviewRequired: true,
    userVisualApproval: "NOT_APPROVED",
    productionAdmitted: false,
    motionAllowed: false,
    resolveAllowed: false,
    finalRenderAllowed: false,
  },
  dimensions: {logicalGrid: "240x135", scale: 8, width: outputWidth, height: outputHeight, format: "png", scaleMethod: "nearest-neighbor"},
  layers: {
    background: {path: backgroundPath, sha256: sha256(background), role: "low-contrast authored field"},
    elementKit: {path: elementsPath, sha256: sha256(elements), role: "evidence strips, selector, output object"},
    typography: {specPath: "typography-spec.json", role: "late-bound editable text; no pixels rendered"},
    composite: {path: compositePath, sha256: sha256(composite), role: "visible assembled canary"},
  },
  typographySpec: spec,
  authorityBinding: {
    currentPhasePath: ".codex-artifacts/system-progress-system-line/current-phase.json",
    currentPhaseFileSha256: sha256(fs.readFileSync(currentPhasePath)),
    currentAuthorityPath: ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json",
    currentAuthorityFileSha256: sha256(fs.readFileSync(currentAuthorityPath)),
    workspaceSha256: "458820ac0a271965253e6ae8a421d4d5a2abcb09e0213c51688268e2b7df88f6",
  },
  authorityMutationPerformed: false,
  workspaceMutationPerformed: false,
  generatedFormalTextAllowed: false,
  createdAt: new Date().toISOString(),
};
output.manifestSha256 = sha256(Buffer.from(JSON.stringify(output)));
writeMirror(backgroundPath, background);
writeMirror(elementsPath, elements);
writeMirror(compositePath, composite);
writeMirror("typography-spec.json", spec);
writeMirror("manifest.json", output);
console.log(JSON.stringify({artifactRoot, publicRoot, compositePath, compositeSha256: output.layers.composite.sha256, manifestSha256: output.manifestSha256, dimensions: output.dimensions}, null, 2));
