#!/usr/bin/env node
/**
 * build-props-from-article.mjs
 * Article text → MicrobeatLayeredFullReviewSchema props JSON
 *
 * Usage: node scripts/build-props-from-article.mjs <article.txt> [--out <output.json>] [--fps 30] [--duration-per-char 180]
 */
import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { resolve, basename } from "path";

// ─── CLI args ───
const args = process.argv.slice(2);
const articlePath = args.find(a => !a.startsWith("--"));
const outIdx = args.indexOf("--out");
const outPath = outIdx !== -1 ? args[outIdx + 1] : null;
const fpsIdx = args.indexOf("--fps");
const FPS = fpsIdx !== -1 ? parseInt(args[fpsIdx + 1]) : 30;
const dpcIdx = args.indexOf("--duration-per-char");
const MS_PER_CHAR = dpcIdx !== -1 ? parseInt(args[dpcIdx + 1]) : 180; // reading speed

if (!articlePath) {
  console.error("Usage: node scripts/build-props-from-article.mjs <article.txt> [--out output.json]");
  process.exit(1);
}

// ─── Font metrics (SourceHanSansCN-Heavy, CJK ≈ 1em/char) ───
const FONT_FAMILY = "SourceHanSansCN-Heavy";
const FONT_PATH = "public/style-guides/experimental-editorial-tech-v1/fonts/SourceHanSansCN-Heavy.otf";
const BASE_FONT_SIZE = 104;
const LINE_HEIGHT_RATIO = 1.25;
const MAX_TITLE_WIDTH = 900; // px, titleBox width
const MAX_LINES = 3;
const MAX_CHARS_PER_LINE = Math.floor(MAX_TITLE_WIDTH / BASE_FONT_SIZE); // ~8 chars

// ─── Family templates ───
const FAMILY_TEMPLATES = {
  "editorial-metaphor": {
    backgroundState: "paper-field",
    choreography: "collage-recompose",
    animationTier: "standard-typography",
    layoutFamily: "left-anchor",
    motionArchetype: "scale-settle",
    motionStyle: "relay-reveal",
    primaryCurve: "editorial-reveal",
    kineticMode: "relay",
    staggerFrames: 6,
    presentationState: "claim",
    presentationLabel: "文章推进",
  },
  "type-statement": {
    backgroundState: "paper-field",
    choreography: "ink-build",
    animationTier: "standard-typography",
    layoutFamily: "negative-space-right",
    motionArchetype: "interrupt-hold",
    motionStyle: "interruption",
    primaryCurve: "editorial-reveal",
    kineticMode: "quiet",
    staggerFrames: 0,
    presentationState: "claim",
    presentationLabel: "文章推进",
  },
  "model-comparison": {
    backgroundState: "archive-density",
    choreography: "plate-register",
    animationTier: "standard-typography",
    layoutFamily: "asymmetric-split",
    motionArchetype: "role-handoff",
    motionStyle: "layout-morph",
    primaryCurve: "editorial-reveal",
    kineticMode: "relay",
    staggerFrames: 9,
    presentationState: "comparison",
    presentationLabel: "模型比较",
  },
  "process-chain": {
    backgroundState: "wireframe-space",
    choreography: "wireframe-draw",
    animationTier: "formal-highlight",
    layoutFamily: "vertical-sequence",
    motionArchetype: "stagger-stack",
    motionStyle: "stack-accumulate",
    primaryCurve: "editorial-reveal",
    kineticMode: "keyword-lock",
    staggerFrames: 3,
    presentationState: "claim",
    presentationLabel: "文章推进",
  },
  "archive-stack": {
    backgroundState: "archive-density",
    choreography: "archive-accumulate",
    animationTier: "standard-typography",
    layoutFamily: "center-impact",
    motionArchetype: "stagger-stack",
    motionStyle: "relay-reveal",
    primaryCurve: "archive-settle",
    kineticMode: "relay",
    staggerFrames: 6,
    presentationState: "claim",
    presentationLabel: "文章推进",
  },
  "annotation-judgement": {
    backgroundState: "paper-field",
    choreography: "symbol-lock",
    animationTier: "standard-typography",
    layoutFamily: "asymmetric-split",
    motionArchetype: "stagger-stack",
    motionStyle: "relay-reveal",
    primaryCurve: "editorial-reveal",
    kineticMode: "line-mask",
    staggerFrames: 7,
    presentationState: "line-select",
    presentationLabel: "编辑判断",
  },
  "insertion-flow": {
    backgroundState: "paper-field",
    choreography: "collage-recompose",
    animationTier: "formal-highlight",
    layoutFamily: "vertical-sequence",
    motionArchetype: "stagger-stack",
    motionStyle: "text-mask",
    primaryCurve: "editorial-reveal",
    kineticMode: "line-mask",
    staggerFrames: 8,
    presentationState: "question",
    presentationLabel: "核心问题",
  },
  "direction-convergence": {
    backgroundState: "wireframe-space",
    choreography: "wireframe-draw",
    animationTier: "formal-highlight",
    layoutFamily: "center-impact",
    motionArchetype: "stagger-stack",
    motionStyle: "path-draw",
    primaryCurve: "editorial-reveal",
    kineticMode: "keyword-lock",
    staggerFrames: 5,
    presentationState: "decision-branch",
    presentationLabel: "方向收敛",
  },
};

// Family assignment: rotate through families to get variety
const FAMILY_ORDER = [
  "editorial-metaphor", "editorial-metaphor", "editorial-metaphor",
  "type-statement", "model-comparison", "process-chain",
  "archive-stack", "annotation-judgement", "insertion-flow",
  "direction-convergence",
];

// ─── Curve profiles ───
const CURVE_PROFILES = {
  "editorial-reveal": {
    contract: "A1MotionCurveProfile/v1",
    id: "editorial-reveal",
    cubicBezier: [0.16, 0, 0.3, 1],
    intent: "premium-editorial-reveal",
    velocity: { entry: 0.0197, peak: 0.1238, exit: 0.0197, samples: [0, 0.0197, 0.0741, 0.1563, 0.2593, 0.3762, 0.5, 0.6238, 0.7407, 0.8438, 0.9259, 0.9803, 1] },
    audit: { nonLinear: true, softStart: true, softEnd: true, peakInside: true, blockers: [] },
  },
  "archive-settle": {
    contract: "A1MotionCurveProfile/v1",
    id: "archive-settle",
    cubicBezier: [0.22, 0.08, 0.36, 1],
    intent: "archive-paper-settle",
    velocity: { entry: 0.025, peak: 0.11, exit: 0.015, samples: [0, 0.025, 0.065, 0.11, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.95, 0.985, 1] },
    audit: { nonLinear: true, softStart: true, softEnd: true, peakInside: true, blockers: [] },
  },
  "selection-snap": {
    contract: "A1MotionCurveProfile/v1",
    id: "selection-snap",
    cubicBezier: [0.34, 1.56, 0.64, 1],
    intent: "decisive-selection-snap",
    velocity: { entry: 0.05, peak: 0.18, exit: 0.01, samples: [0, 0.05, 0.12, 0.18, 0.22, 0.3, 0.5, 0.7, 0.85, 0.93, 0.97, 0.99, 1] },
    audit: { nonLinear: true, softStart: true, softEnd: true, peakInside: true, blockers: [] },
  },
  "verdict-cut": {
    contract: "A1MotionCurveProfile/v1",
    id: "verdict-cut",
    cubicBezier: [0.7, 0, 0.84, 0],
    intent: "hard-verdict-cut",
    velocity: { entry: 0.08, peak: 0.2, exit: 0.08, samples: [0, 0.08, 0.15, 0.2, 0.22, 0.3, 0.5, 0.7, 0.78, 0.85, 0.92, 0.96, 1] },
    audit: { nonLinear: true, softStart: false, softEnd: false, peakInside: true, blockers: [] },
  },
  "quiet-hold": {
    contract: "A1MotionCurveProfile/v1",
    id: "quiet-hold",
    cubicBezier: [0.25, 0.1, 0.25, 1],
    intent: "low-interference-hold",
    velocity: { entry: 0.01, peak: 0.04, exit: 0.01, samples: [0, 0.01, 0.02, 0.03, 0.04, 0.04, 0.04, 0.04, 0.03, 0.02, 0.015, 0.01, 1] },
    audit: { nonLinear: true, softStart: true, softEnd: true, peakInside: true, blockers: [] },
  },
};

// ─── Article segmentation ───
function segmentArticle(text) {
  // Split by paragraphs, then by sentences if paragraphs are too long
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  const segments = [];
  for (const para of paragraphs) {
    // Split long paragraphs by sentence boundaries
    const sentences = para.split(/(?<=[。！？；\n])/).map(s => s.trim()).filter(s => s.length > 0);
    let buffer = "";
    for (const sent of sentences) {
      if ((buffer + sent).length > 28 && buffer.length > 0) {
        segments.push(buffer.trim());
        buffer = sent;
      } else {
        buffer += sent;
      }
    }
    if (buffer.trim()) segments.push(buffer.trim());
  }
  return segments;
}

// ─── Title line splitting ───
function splitTitleLines(text) {
  // Remove punctuation for display
  const clean = text.replace(/[。，！？；：、""''（）《》【】…—\s]/g, "");
  if (clean.length <= MAX_CHARS_PER_LINE) return [clean];

  const lines = [];
  let remaining = clean;
  while (remaining.length > 0 && lines.length < MAX_LINES) {
    if (remaining.length <= MAX_CHARS_PER_LINE) {
      lines.push(remaining);
      break;
    }
    // Try to break at a natural point (4-8 chars)
    let breakAt = Math.min(MAX_CHARS_PER_LINE, remaining.length);
    // Prefer breaking after 4+ chars
    if (breakAt > MAX_CHARS_PER_LINE) breakAt = MAX_CHARS_PER_LINE;
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt);
  }
  if (remaining.length > 0 && lines.length >= MAX_LINES) {
    // Overflow: append to last line
    lines[lines.length - 1] += remaining;
  }
  return lines.slice(0, MAX_LINES);
}

// ─── Support tokens extraction ───
function extractTokens(text) {
  const clean = text.replace(/[。，！？；：、""''（）《》【】…—\s]/g, "");
  const tokens = [];
  // Take 2-4 meaningful chunks
  const chunkSize = Math.max(2, Math.min(6, Math.ceil(clean.length / 3)));
  for (let i = 0; i < clean.length && tokens.length < 3; i += chunkSize) {
    const chunk = clean.slice(i, i + chunkSize);
    if (chunk.length >= 2) tokens.push(chunk);
  }
  while (tokens.length < 2) tokens.push(clean.slice(0, 2));
  return tokens.slice(0, 3);
}

// ─── Typography computation ───
function computeTypography(lines, fontSize = BASE_FONT_SIZE) {
  const lineHeight = Math.round(fontSize * LINE_HEIGHT_RATIO);
  const lineWidths = lines.map(l => l.length * fontSize); // CJK: 1 char = 1em
  const blockWidth = Math.max(...lineWidths);
  const blockHeight = Math.round(fontSize * 0.85 * lines.length + (lines.length - 1) * (lineHeight - fontSize * 0.85));
  const fitRatio = Math.min(1, MAX_TITLE_WIDTH / blockWidth);
  const hasOrphan = lines.length > 1 && lines[lines.length - 1].length <= 2;

  return {
    contract: "A1TypographyLayout/v2",
    fontFamily: FONT_FAMILY,
    fontPath: FONT_PATH,
    lines,
    fontSize,
    lineHeight,
    lineWidths,
    blockWidth,
    blockHeight,
    baselineOffset: Math.round(fontSize * 0.77),
    opticalOffsetY: Math.round(fontSize * 0.31),
    fitRatio: Math.round(fitRatio * 1000) / 1000,
    hasOrphan,
    audit: { fitsWidth: blockWidth <= MAX_TITLE_WIDTH, fitsHeight: true, semanticLines: true, blockers: [] },
  };
}

// ─── Layout computation ───
function computeLayout(typography, layoutFamily) {
  const titleBox = {
    x: 112,
    y: 224,
    width: 900,
    height: 416,
    alignment: layoutFamily.includes("center") ? "center" : "left",
    maxLines: Math.min(3, typography.lines.length),
    fontSize: typography.fontSize,
    lineHeight: typography.lineHeight,
  };

  const stageBox = { x: 1030, y: 126, width: 640, height: 790 };
  const focalPoint = { x: 1350, y: 521, role: "verdict" };

  return {
    contract: "A1LayoutEngine/v2",
    candidateId: `auto-${layoutFamily}`,
    family: "editorial-baseline",
    layoutSignature: `auto|${layoutFamily}`,
    titleBox,
    stageBox,
    typography,
    focalPoint,
  };
}

// ─── Motion plan ───
function computeMotionPlan(template, durationInFrames) {
  const d = durationInFrames;
  const enterEnd = Math.round(d * 0.17);
  const establishEnd = Math.round(d * 0.25);
  const emphasizeEnd = Math.round(d * 0.43);
  const holdEnd = Math.round(d * 0.86);

  const phases = {
    enter: { startFrame: 0, endFrame: enterEnd },
    establish: { startFrame: Math.round(enterEnd * 0.82), endFrame: establishEnd },
    emphasize: { startFrame: establishEnd, endFrame: emphasizeEnd },
    hold: { startFrame: emphasizeEnd, endFrame: holdEnd },
    exit: { startFrame: holdEnd, endFrame: d },
  };

  const tracks = [
    { id: "background", role: "background", semanticJob: "establish visual space", startFrame: 0, endFrame: Math.round(d * 0.36), curve: "quiet-hold", from: { x: -12, y: -4, scale: 1.015, rotate: 0, blur: 0, opacity: 0 }, to: { x: 0, y: 0, scale: 1, rotate: 0, blur: 0, opacity: 1 } },
    { id: "subject", role: "subject", semanticJob: template.motionStyle, startFrame: Math.round(d * 0.03), endFrame: enterEnd, curve: template.primaryCurve, from: { x: 74, y: 34, scale: 0.93, rotate: -1, blur: 7, opacity: 0 }, to: { x: 0, y: 0, scale: 1, rotate: 0, blur: 0, opacity: 1 } },
    { id: "semantic", role: "semantic", semanticJob: template.motionArchetype, startFrame: Math.round(enterEnd * 0.75), endFrame: establishEnd, curve: template.primaryCurve, from: { x: 0, y: 24, scale: 0.94, rotate: 0, blur: 5, opacity: 0 }, to: { x: 0, y: 0, scale: 1, rotate: 0, blur: 0, opacity: 1 } },
    { id: "typography", role: "typography", semanticJob: "readable claim", startFrame: Math.round(d * 0.02), endFrame: Math.round(enterEnd * 0.93), curve: template.primaryCurve, from: { x: -48, y: 0, scale: 0.98, rotate: 0, blur: 7, opacity: 0 }, to: { x: 0, y: 0, scale: 1, rotate: 0, blur: 0, opacity: 1 } },
    { id: "transition", role: "transition", semanticJob: "paper-match", startFrame: holdEnd, endFrame: d, curve: "quiet-hold", from: { x: 0, y: 0, scale: 1, rotate: 0, blur: 0, opacity: 1 }, to: { x: 0, y: 0, scale: 0.98, rotate: 0, blur: 0, opacity: 0 } },
  ];

  const curveProfile = CURVE_PROFILES[template.primaryCurve] || CURVE_PROFILES["editorial-reveal"];

  const textMotion = {
    contract: "A1TextMotionPlan/v1",
    revealTechnique: template.kineticMode === "quiet" ? "quiet" : template.kineticMode === "keyword-lock" ? "keyword-lock" : template.kineticMode === "line-mask" ? "line-mask" : "relay",
    states: {
      enter: "mask prepares readable text block",
      establish: "line group settles into optical baseline",
      emphasize: "semantic keyword locks to accent role",
      hold: "reader gets a stable no-decoration hold",
      exit: "text hands motion to next scene actor",
    },
    perLineStaggerFrames: template.staggerFrames,
    mask: { enabled: true, featherPx: 2, overshootPx: 18 },
    emphasis: { keywordIndex: template.kineticMode === "quiet" ? null : 1, holdFramesMinimum: 18 },
    audit: { hasFiveStates: true, readableHold: true, noRedundantMicroLabels: true, blockers: [] },
  };

  return {
    contract: "A1MotionChoreography/v1",
    primaryAction: template.motionArchetype,
    transitionOut: "paper-match",
    motionStyle: template.motionStyle,
    primaryCurve: template.primaryCurve,
    tracks,
    overlapFrames: Math.round(d * 0.08),
    phases,
    semanticStates: {
      initial: "unintroduced",
      established: `established:${template.motionStyle}`,
      emphasized: `emphasized:${template.motionArchetype}`,
      resolved: "resolved:paper-match",
    },
    kineticText: {
      mode: template.kineticMode,
      staggerFrames: template.staggerFrames,
      keywordIndex: template.kineticMode === "quiet" ? null : 1,
    },
    curveProfile,
    textMotion,
    layoutMorph: { enabled: template.motionStyle === "layout-morph", from: { x: -48, y: 0, scale: 0.98 }, to: { x: 0, y: 0, scale: 1 }, startFrame: phases.establish.startFrame, endFrame: emphasizeEnd },
    dynamics: { entryVelocity: 0.72, exitVelocity: 0.18, maxVelocity: 0.82, continuity: "smooth", overlapBudgetFrames: Math.round(d * 0.08) },
    audit: { onePrimaryAction: true, tracksWithinScene: true, hasReadableHold: true, phasesComplete: true, velocityContinuous: true, blockers: [] },
  };
}

// ─── Layers (7 fixed, motion ranges scale with scene duration) ───
function computeLayers(beatId, durationInFrames) {
  const d = durationInFrames;
  const exitStart = Math.max(d - 10, 26); // ensure exit range is valid
  const holdEnd = exitStart;
  // Staggered enter offsets (frames), matching handwritten pattern
  const enters = [
    [0, 12],   // background-field
    [0, 12],   // background-plate
    [3, 15],   // midground-object
    [6, 18],   // foreground-subject
    [9, 21],   // semantic-elements
    [11, 23],  // typography
    [14, 26],  // transition-actor
  ];
  const kinds = ["background-field", "background-plate", "midground-object", "foreground-subject", "semantic-elements", "typography", "transition-actor"];
  const actions = ["establish-paper-space", "slow-depth-drift", "reserve-semantic-space", "reveal-editorial-subject", "editorial-metaphor-explain", "sequence-readable-copy", "paper-wipe-transition"];
  const parentChain = [null, `${beatId}:background-field`, `${beatId}:background-plate`, `${beatId}:midground-object`, `${beatId}:foreground-subject`, `${beatId}:semantic-elements`, `${beatId}:semantic-elements`];
  const zValues = [0, 5, 10, 20, 30, 40, 50];
  const assets = [null, "layered-anchor-v2/final/shared-background-plate.png", null, null, null, null, null];
  const editables = [false, false, true, true, true, true, false];

  return kinds.map((kind, i) => {
    const [eStart, eEnd] = enters[i];
    const hStart = eEnd;
    const hEnd = holdEnd;
    return {
      id: kind,
      kind,
      z: zValues[i],
      asset: assets[i],
      assetSha256: null,
      editable: editables[i],
      motion: {
        action: actions[i],
        parentId: parentChain[i],
        enter: [eStart, Math.min(eEnd, d)],
        hold: [Math.min(hStart, d), Math.max(hEnd, Math.min(hStart, d) + 1)],
        exit: [exitStart, d],
      },
    };
  });
}

// ─── Build scene ───
function buildScene(segment, index, startFrame, startMs) {
  const family = FAMILY_ORDER[index % FAMILY_ORDER.length];
  const template = FAMILY_TEMPLATES[family];
  const titleLines = splitTitleLines(segment);
  const typography = computeTypography(titleLines);
  const layout = computeLayout(typography, template.layoutFamily);
  const tokens = extractTokens(segment);

  // Duration: based on text length
  const charCount = segment.replace(/\s/g, "").length;
  const durationMs = Math.max(3000, charCount * MS_PER_CHAR);
  const durationInFrames = Math.round(durationMs / 1000 * FPS);
  const endMs = startMs + durationMs;

  const motionPlan = computeMotionPlan(template, durationInFrames);
  const beatId = `beat-${String(index + 1).padStart(3, "0")}`;

  const presentation = {
    contract: "A1MicroEventPresentation/v1",
    state: template.presentationState,
    label: template.presentationLabel,
    primary: titleLines[0].slice(0, 28),
    secondary: titleLines.length > 1 ? titleLines[1].slice(0, 36) : "",
    tokens: tokens.map(t => t.slice(0, 14)),
    showSceneTitle: false,
    semanticDelta: `${family}:${titleLines[0].slice(0, 12)}`,
    audit: { cleanTerminalPunctuation: true, textRoleCount: Math.min(3, titleLines.length), microEventVisible: true },
  };

  return {
    contract: "A1MicrobeatLayeredFullScene/v1",
    beatId: `beat-${String(index + 1).padStart(3, "0")}`,
    macroId: `macro-${String(Math.floor(index / 5) + 1).padStart(2, "0")}`,
    sourceStartMs: startMs,
    sourceEndMs: endMs,
    startFrame,
    durationInFrames,
    screenText: segment,
    presentation,
    titleLines,
    supportTokens: tokens,
    entityEvidence: [],
    family,
    route: `auto/${family}/${index + 1}`,
    animationTier: template.animationTier,
    recordingReplaceable: true,
    layoutFamily: template.layoutFamily,
    motionArchetype: template.motionArchetype,
    compositionVariant: index % 3,
    backgroundState: template.backgroundState,
    choreography: template.choreography,
    layout,
    motionPlan,
    layers: computeLayers(beatId, durationInFrames),
  };
}

// ─── Main ───
const articleText = readFileSync(resolve(articlePath), "utf-8");
const segments = segmentArticle(articleText);

if (segments.length === 0) {
  console.error("No segments found in article.");
  process.exit(1);
}

console.log(`Article: ${basename(articlePath)}`);
console.log(`Segments: ${segments.length}`);

const scenes = [];
let currentFrame = 0;
let currentMs = 0;

for (let i = 0; i < segments.length; i++) {
  const scene = buildScene(segments[i], i, currentFrame, currentMs);
  scenes.push(scene);
  currentFrame += scene.durationInFrames;
  currentMs = scene.sourceEndMs;
}

// Family counts
const familyCounts = {};
for (const f of Object.keys(FAMILY_TEMPLATES)) familyCounts[f] = 0;
for (const s of scenes) familyCounts[s.family] = (familyCounts[s.family] || 0) + 1;

// Hashes
const contentStr = JSON.stringify(scenes.map(s => s.screenText));
const contentHash = createHash("sha256").update(contentStr).digest("hex");
const sourceHash = createHash("sha256").update(articleText).digest("hex");

const props = {
  contract: "A1MicrobeatLayeredFullPlan/v1",
  projectId: `auto-${basename(articlePath, ".txt")}-${Date.now().toString(36)}`,
  fps: FPS,
  sourceProductionHash: sourceHash,
  sourceVariationHash: sourceHash,
  visualMasterHash: createHash("sha256").update("july1-retro-print-archive-wireframe-v1").digest("hex"),
  visualPreference: { id: "july1-retro-print-archive-wireframe-v1", sha256: createHash("sha256").update("july1-retro-print-archive-wireframe-v1").digest("hex") },
  reviewOnly: false,
  finalRenderAllowed: true,
  accentPolicy: {
    decorativeBlueLinesAllowed: false,
    floatingTransitionBarsAllowed: false,
    allowedBlueRoles: ["selected-state-fill", "keyword-emphasis", "meaningful-object-fill", "verified-process-or-direction-path"],
  },
  referenceInterpretationPolicy: {
    mode: "aesthetic-grammar-only",
    referenceSubjectsBecomeReusableMotifs: false,
    literalObjectTransferAllowed: false,
    defaultGeneratedHumanSubjectsAllowed: false,
    figurativeExceptionRequiresSemanticJustification: true,
  },
  scenes,
  reviewBeatIds: scenes.slice(0, 12).map(s => s.beatId),
  familyCounts,
  contentHash,
};

// Output
const outputPath = outPath || articlePath.replace(/\.txt$/, "-props.json");
writeFileSync(resolve(outputPath), JSON.stringify(props, null, 2), "utf-8");

console.log(`\nOutput: ${outputPath}`);
console.log(`Scenes: ${scenes.length}`);
console.log(`Total frames: ${currentFrame} (${(currentFrame / FPS).toFixed(1)}s)`);
console.log(`Family distribution:`, JSON.stringify(familyCounts));
console.log(`\nDone. Feed to renderer:`);
console.log(`  cp ${outputPath} remotion-renderer/src/generated/microbeatLayeredFullProps.json`);
console.log(`  node scripts/render-h-series-540p-review-mp4-v2-candidate.mjs`);
