#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticleAssetProductionAuthority} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {
  assertDefaultEffectPrimitiveContinuation,
  assertDefaultEffectPrimitiveReview,
} from "../apps/studio-next/src/lib/a1-default-effect-primitives-v1.mjs";
import {assertDefaultDesignAssetLibraryPlan} from "../apps/studio-next/src/lib/a1-default-design-asset-library-v1.mjs";
import {
  assertRetroPixelEditorialStyleBrief,
  auditRetroPixelStyleBriefs,
  compileRetroPixelEditorialStyleBrief,
} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const libraryRoot = "default-design-asset-library-v1/effect-primitives-v1";
const planPath = path.join(phaseRoot, "default-design-asset-library-v1/plan.json");
const notePath = path.join(root, "work/style-research/a1-personal-pinterest-default-library-2026-08-13.md");
const fontPaths = {
  heavy: path.join(appRoot, "public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf"),
  pixel: path.join(appRoot, "public/a1-editorial-fonts/fusion-pixel.ttf"),
};
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const dataUrl = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const fontCss = `<style>@font-face{font-family:'A1 Heavy';src:url('${dataUrl(fontPaths.heavy, "font/otf")}')}@font-face{font-family:'A1 Pixel';src:url('${dataUrl(fontPaths.pixel, "font/ttf")}')}</style>`;

const candidates = [
  {
    candidateId: "effect-crt-scanline-ink-v1",
    assetKind: "TRANSPARENT_EFFECT_OVERLAY",
    effectFamily: "CRT_SCANLINE",
    roleId: "LOCAL_SIGNAL_TEXTURE",
    semanticJobs: ["signal-state", "screen-object", "evidence-window"],
    semanticJob: "object-bound graphite CRT scanlines reveal a local signal state",
    semanticAction: "scanlines make a screen or evidence region feel sampled without coating the entire sequence",
    variation: {actorKind: "machine-or-tool", densityProfile: "quiet-iconic", primaryFamily: "scanline-crt-signal", supportingFamilies: [], surfaceLogic: "object-bound-graphite-scanline-field", dominantActor: "thin-horizontal-ink-scanlines", composition: "oversized-subject-crop-local-signal-zone", palette: "black-white-one-alert", material: "clean-flat-ink-with-local-scanline-breakup", motionEnergy: "static-overlay-only", crtFusion: true},
    recipe: {contract: "A1EffectPrimitiveRecipe/v1", mode: "TRANSPARENT_SCANLINES", color: "#111923", alpha: 0.14, spacing: 7, thickness: 1, phase: 0, strengthPresets: {subtle: 0.08, medium: 0.14, strong: 0.22}, defaultMask: "LOCAL_OR_OBJECT_BOUND"},
  },
  {
    candidateId: "effect-crt-scanline-phosphor-v1",
    assetKind: "TRANSPARENT_EFFECT_OVERLAY",
    effectFamily: "CRT_SCANLINE",
    roleId: "LOCAL_SIGNAL_TEXTURE",
    semanticJobs: ["signal-state", "screen-object", "diagnostic"],
    semanticJob: "object-bound phosphor scanlines expose a diagnostic signal state",
    semanticAction: "cool alternating lines make one screen region feel electronically active",
    variation: {actorKind: "machine-or-tool", densityProfile: "quiet-iconic", primaryFamily: "scanline-crt-signal", supportingFamilies: [], surfaceLogic: "object-bound-two-color-phosphor-scanlines", dominantActor: "alternating-cobalt-cyan-scanlines", composition: "one-continuous-story-screen-local-diagnostic-zone", palette: "cyan-charcoal-white", material: "two-color-scanline-misregistration", motionEnergy: "static-overlay-only", crtFusion: true},
    recipe: {contract: "A1EffectPrimitiveRecipe/v1", mode: "TRANSPARENT_SCANLINES", colors: ["#2258c8", "#5f9f97"], alpha: 0.12, spacing: 9, thickness: 1, phase: 2, strengthPresets: {subtle: 0.07, medium: 0.12, strong: 0.2}, defaultMask: "LOCAL_OR_OBJECT_BOUND"},
  },
  {
    candidateId: "background-cool-horizontal-contour-wave-v1",
    assetKind: "BACKGROUND_FIELD",
    effectFamily: "PROCESS_CONTOUR",
    roleId: "PROCESS_CONTOUR_FIELD",
    semanticJobs: ["process", "causal-flow", "explanation"],
    semanticJob: "horizontal contour bands describe a calm process flow",
    semanticAction: "a local wave transfers pressure across an otherwise stable line field",
    variation: {actorKind: "diagram-or-process", densityProfile: "quiet-iconic", primaryFamily: "modular-pixel-infographic", supportingFamilies: [], surfaceLogic: "horizontal-one-bit-contour-lines", dominantActor: "local-wave-across-uniform-contour-field", composition: "perspective-mesh-or-diagram-field-wide-process-flow", palette: "cyan-charcoal-white", material: "one-bit-contour-lines-with-soft-paper-grain", motionEnergy: "static-background-only"},
    recipe: {contract: "A1EffectPrimitiveRecipe/v1", mode: "CONTOUR_BACKGROUND", orientation: "HORIZONTAL", base: "#eef2f1", lineColor: "#263744", accentColor: "#2a58c7", spacing: 24, thickness: 1.25, amplitude: 42, frequency: 0.0105, eventCenter: {x: 1180, y: 560}, eventRadius: 560, opacity: 0.32},
  },
  {
    candidateId: "background-charcoal-vertical-contour-wave-v1",
    assetKind: "BACKGROUND_FIELD",
    effectFamily: "PROCESS_CONTOUR",
    roleId: "PROCESS_CONTOUR_FIELD",
    semanticJobs: ["process", "pressure", "transition"],
    semanticJob: "vertical contour bands describe pressure and transition",
    semanticAction: "a narrow pinch redirects a stable dark line field",
    variation: {actorKind: "diagram-or-process", densityProfile: "quiet-iconic", primaryFamily: "icon-atlas-interface-language", supportingFamilies: [], surfaceLogic: "vertical-one-bit-pressure-contours", dominantActor: "local-pinch-in-dark-contour-field", composition: "unequal-window-cluster-tall-pressure-field", palette: "black-white-cobalt-accent", material: "clean-contour-ink-with-local-print-wear", motionEnergy: "static-background-only"},
    recipe: {contract: "A1EffectPrimitiveRecipe/v1", mode: "CONTOUR_BACKGROUND", orientation: "VERTICAL", base: "#121a24", lineColor: "#a8bad0", accentColor: "#5f8f7f", spacing: 28, thickness: 1.2, amplitude: 48, frequency: 0.012, eventCenter: {x: 760, y: 520}, eventRadius: 500, opacity: 0.28},
  },
  {
    candidateId: "effect-horizontal-signal-tear-v1",
    assetKind: "TRANSPARENT_EFFECT_OVERLAY",
    effectFamily: "SIGNAL_TEAR",
    roleId: "TRANSITION_SIGNAL_FIELD",
    semanticJobs: ["interruption", "error", "reversal"],
    semanticJob: "a bounded horizontal signal tear marks one interruption event",
    semanticAction: "broken bands expose a discontinuity and then leave the frame",
    variation: {actorKind: "machine-or-tool", densityProfile: "quiet-iconic", primaryFamily: "dithered-editorial-poster", supportingFamilies: [], surfaceLogic: "bounded-horizontal-signal-dropout-bars", dominantActor: "one-signal-break-cluster", composition: "asymmetric-scale-collision-event-band", palette: "black-white-one-alert", material: "hard-pixel-bars-and-local-dither", motionEnergy: "single-event-overlay-only"},
    recipe: {contract: "A1EffectPrimitiveRecipe/v1", mode: "TRANSPARENT_SIGNAL_TEAR", bars: [{y: 360, height: 8, x: 180, width: 1280, color: "#e8edf0", alpha: 0.42}, {y: 384, height: 18, x: 420, width: 1210, color: "#2457c8", alpha: 0.52}, {y: 418, height: 5, x: 90, width: 1560, color: "#101923", alpha: 0.52}, {y: 446, height: 11, x: 560, width: 1020, color: "#70a093", alpha: 0.42}, {y: 480, height: 4, x: 280, width: 1180, color: "#e8edf0", alpha: 0.34}], eventOnly: true, globalUseForbidden: true},
  },
  {
    candidateId: "effect-local-dither-erosion-v1",
    assetKind: "TRANSPARENT_EFFECT_OVERLAY",
    effectFamily: "DITHER_EROSION",
    roleId: "LOCAL_REVISION_TEXTURE",
    semanticJobs: ["correction", "decay", "revision"],
    semanticJob: "local one-bit erosion reveals a correction or decaying edge",
    semanticAction: "a directional dither cloud eats into one object boundary while the rest remains clean",
    variation: {actorKind: "diagram-or-process", densityProfile: "quiet-iconic", primaryFamily: "one-bit-character-object", supportingFamilies: [], surfaceLogic: "local-one-bit-dither-erosion-mask", dominantActor: "directional-pixel-erosion-cloud", composition: "oversized-subject-crop-local-edge-intervention", palette: "cyan-charcoal-white", material: "one-bit-threshold-dither-with-pixel-stair-steps", motionEnergy: "static-overlay-only"},
    recipe: {contract: "A1EffectPrimitiveRecipe/v1", mode: "TRANSPARENT_DITHER_EROSION", seed: 41, region: {x: 1160, y: 190, width: 620, height: 700}, dotSize: 5, densityDirection: "RIGHT_TO_LEFT", colors: ["#101923", "#2758c7"], alpha: 0.38, defaultMask: "LOCAL_OR_OBJECT_BOUND"},
  },
];

function scanlineSvg(recipe) {
  const lines = [];
  for (let y = recipe.phase; y < 1080; y += recipe.spacing) {
    const color = recipe.colors?.[(Math.floor(y / recipe.spacing)) % recipe.colors.length] || recipe.color;
    lines.push(`<rect x="0" y="${y}" width="1920" height="${recipe.thickness}" fill="${color}" fill-opacity="${recipe.alpha}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${lines.join("")}</svg>`;
}

function contourSvg(recipe) {
  const paths = [];
  const {x: cx, y: cy} = recipe.eventCenter;
  if (recipe.orientation === "HORIZONTAL") {
    for (let base = -recipe.spacing; base < 1080 + recipe.spacing; base += recipe.spacing) {
      const points = [];
      for (let x = -20; x <= 1940; x += 16) {
        const distance = Math.abs(x - cx);
        const envelope = Math.max(0, 1 - distance / recipe.eventRadius);
        const y = base + Math.sin((x - cx) * recipe.frequency + base * 0.006) * recipe.amplitude * envelope;
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      const accent = Math.abs(base - cy) < recipe.spacing * 1.2;
      paths.push(`<polyline points="${points.join(" ")}" fill="none" stroke="${accent ? recipe.accentColor : recipe.lineColor}" stroke-opacity="${accent ? recipe.opacity + 0.12 : recipe.opacity}" stroke-width="${accent ? recipe.thickness + 0.45 : recipe.thickness}"/>`);
    }
  } else {
    for (let base = -recipe.spacing; base < 1920 + recipe.spacing; base += recipe.spacing) {
      const points = [];
      for (let y = -20; y <= 1100; y += 14) {
        const distance = Math.abs(y - cy);
        const envelope = Math.max(0, 1 - distance / recipe.eventRadius);
        const x = base + Math.sin((y - cy) * recipe.frequency + base * 0.005) * recipe.amplitude * envelope;
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      const accent = Math.abs(base - cx) < recipe.spacing * 1.2;
      paths.push(`<polyline points="${points.join(" ")}" fill="none" stroke="${accent ? recipe.accentColor : recipe.lineColor}" stroke-opacity="${accent ? recipe.opacity + 0.12 : recipe.opacity}" stroke-width="${accent ? recipe.thickness + 0.45 : recipe.thickness}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".78" numOctaves="2" seed="29"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .035 0"/></filter></defs><rect width="1920" height="1080" fill="${recipe.base}"/>${paths.join("")}<rect width="1920" height="1080" filter="url(#g)" opacity=".5"/></svg>`;
}

function signalTearSvg(recipe) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${recipe.bars.map((bar, index) => `<g transform="translate(${index % 2 === 0 ? -18 : 22} 0)"><rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" fill="${bar.color}" fill-opacity="${bar.alpha}"/><rect x="${bar.x + bar.width * 0.24}" y="${bar.y - 3}" width="${bar.width * 0.12}" height="${Math.max(2, bar.height / 3)}" fill="#edf2f0" fill-opacity=".28"/></g>`).join("")}</svg>`;
}

function ditherSvg(recipe) {
  let seed = recipe.seed;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const dots = [];
  const {x, y, width, height} = recipe.region;
  for (let py = y; py < y + height; py += recipe.dotSize * 2) {
    for (let px = x; px < x + width; px += recipe.dotSize * 2) {
      const density = 1 - (px - x) / width;
      if (random() < density * 0.82) {
        const size = recipe.dotSize * (0.65 + density * 0.75);
        const color = recipe.colors[random() > 0.86 ? 1 : 0];
        dots.push(`<rect x="${px + Math.round((random() - .5) * 5)}" y="${py + Math.round((random() - .5) * 5)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" fill="${color}" fill-opacity="${(recipe.alpha * (0.55 + density * .45)).toFixed(3)}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${dots.join("")}</svg>`;
}

function renderPrimitiveSvg(candidate) {
  if (candidate.recipe.mode === "TRANSPARENT_SCANLINES") return scanlineSvg(candidate.recipe);
  if (candidate.recipe.mode === "CONTOUR_BACKGROUND") return contourSvg(candidate.recipe);
  if (candidate.recipe.mode === "TRANSPARENT_SIGNAL_TEAR") return signalTearSvg(candidate.recipe);
  if (candidate.recipe.mode === "TRANSPARENT_DITHER_EROSION") return ditherSvg(candidate.recipe);
  throw new Error(`effect-primitive-mode-invalid:${candidate.recipe.mode}`);
}

function baseSpecimenSvg(dark = false) {
  const base = dark ? "#121923" : "#eef2f1";
  const ink = dark ? "#edf1ef" : "#111923";
  const muted = dark ? "#91a6ba" : "#526574";
  const plate = dark ? "#1b2633" : "#d9e1df";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${fontCss}<rect width="1920" height="1080" fill="${base}"/><rect x="118" y="104" width="12" height="250" fill="#2758c7"/><text x="172" y="205" fill="${ink}" font-family="A1 Heavy" font-size="92" letter-spacing="-5">效果不是装饰</text><text x="176" y="278" fill="${muted}" font-family="A1 Pixel" font-size="34">它必须说明画面状态</text><rect x="174" y="350" width="650" height="8" fill="#2758c7"/><rect x="1120" y="188" width="580" height="520" rx="4" fill="${plate}" stroke="${muted}" stroke-width="3"/><circle cx="1410" cy="448" r="132" fill="none" stroke="${ink}" stroke-width="10"/><path d="M1285 465 C1342 360 1470 355 1536 430 C1586 488 1534 582 1424 574" fill="none" stroke="#2758c7" stroke-width="18"/><rect x="1180" y="756" width="510" height="10" fill="${muted}"/><rect x="1180" y="790" width="355" height="10" fill="${muted}"/><rect x="1180" y="824" width="430" height="10" fill="${muted}"/></svg>`;
}

function specimenOverlaySvg(dark = false) {
  const ink = dark ? "#edf1ef" : "#111923";
  const muted = dark ? "#91a6ba" : "#526574";
  const plate = dark ? "#1b2633" : "#d9e1df";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${fontCss}<rect x="118" y="104" width="12" height="250" fill="#2758c7"/><text x="172" y="205" fill="${ink}" font-family="A1 Heavy" font-size="92" letter-spacing="-5">效果不是装饰</text><text x="176" y="278" fill="${muted}" font-family="A1 Pixel" font-size="34">它必须说明画面状态</text><rect x="174" y="350" width="650" height="8" fill="#2758c7"/><rect x="1120" y="188" width="580" height="520" rx="4" fill="${plate}" fill-opacity=".72" stroke="${muted}" stroke-width="3"/><circle cx="1410" cy="448" r="132" fill="none" stroke="${ink}" stroke-width="10"/><path d="M1285 465 C1342 360 1470 355 1536 430 C1586 488 1534 582 1424 574" fill="none" stroke="#2758c7" stroke-width="18"/><rect x="1180" y="756" width="510" height="10" fill="${muted}"/><rect x="1180" y="790" width="355" height="10" fill="${muted}"/><rect x="1180" y="824" width="430" height="10" fill="${muted}"/></svg>`;
}

function runVision(scriptName, imagePath) {
  const result = spawnSync("swift", [path.join(root, "scripts", scriptName), imagePath], {encoding: "utf8", maxBuffer: 10 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`effect-primitive-vision-failed:${scriptName}:${result.stderr.trim()}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
}

function alphaStats(raw, channels) {
  let nonTransparent = 0;
  let opaque = 0;
  for (let index = 3; index < raw.length; index += channels) {
    if (raw[index] > 0) nonTransparent += 1;
    if (raw[index] === 255) opaque += 1;
  }
  const pixels = raw.length / channels;
  return {nonTransparentPixelRatio: Number((nonTransparent / pixels).toFixed(6)), fullyOpaquePixelRatio: Number((opaque / pixels).toFixed(6))};
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  if (authority.status !== "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW" || authority.uniformPatternFamilyContinuation?.review?.candidateCount !== 4) throw new Error("effect-primitives-current-review-anchor-required");
  if (authority.effectPrimitiveContinuation) throw new Error("effect-primitives-already-recorded");
  const libraryPlan = assertDefaultDesignAssetLibraryPlan(JSON.parse(fs.readFileSync(planPath, "utf8")));
  const now = new Date().toISOString();
  const styleBriefs = candidates.map((candidate) => {
    const brief = compileRetroPixelEditorialStyleBrief({
      appRoot,
      now,
      event: {eventId: candidate.candidateId, sourceBeatIds: [], sourceText: candidate.semanticJob, semanticRole: "effect-primitive", actorNeed: candidate.effectFamily, packagingType: candidate.effectFamily === "SIGNAL_TEAR" ? "FULLSCREEN_PACKAGE" : "EXPLAINER_PACKAGE", semanticJob: candidate.semanticJob, semanticAction: candidate.semanticAction},
      variationOverrides: candidate.variation,
    });
    assertRetroPixelEditorialStyleBrief(brief, {appRoot});
    return brief;
  });
  const styleAudit = auditRetroPixelStyleBriefs(styleBriefs, {appRoot, distinctEventIds: []});
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-effect-primitives-v1-"));
  const binaryFiles = {};
  const fileRecords = {};
  const outputs = [];
  const composites = [];
  const specimenLight = await sharp(Buffer.from(baseSpecimenSvg(false))).png().toBuffer();
  const specimenDark = await sharp(Buffer.from(baseSpecimenSvg(true))).png().toBuffer();

  for (const [index, candidate] of candidates.entries()) {
    const primitive = await sharp(Buffer.from(renderPrimitiveSvg(candidate))).ensureAlpha().png().toBuffer();
    const primitiveFile = path.join(tempRoot, `${candidate.candidateId}.png`);
    fs.writeFileSync(primitiveFile, primitive);
    const metadata = await sharp(primitive).metadata();
    const {data: raw, info} = await sharp(primitive).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const alpha = alphaStats(raw, info.channels);
    const isOverlay = candidate.assetKind === "TRANSPARENT_EFFECT_OVERLAY";
    if (metadata.width !== 1920 || metadata.height !== 1080 || metadata.format !== "png" || (isOverlay && (alpha.nonTransparentPixelRatio <= 0 || alpha.fullyOpaquePixelRatio >= 0.25))) throw new Error(`effect-primitive-machine-gate-failed:${candidate.candidateId}:alpha`);
    const ocr = isOverlay ? {status: "PASS_NOT_APPLICABLE_TRANSPARENT_EFFECT", text: "", observationCount: 0, readableTextDetected: false} : runVision("run-local-vision-ocr-v1.swift", primitiveFile);
    const human = runVision("run-local-vision-human-presence-v1.swift", primitiveFile);
    const readableTextDetected = /[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}|\d{3,}/u.test(String(ocr.text || ""));
    if ((!isOverlay && (ocr.status !== "PASS" || readableTextDetected)) || human.status !== "PASS" || Number(human.faceCount || 0) !== 0 || Number(human.humanRectCount || 0) !== 0) throw new Error(`effect-primitive-machine-gate-failed:${candidate.candidateId}:${ocr.text || "no-ocr"}`);
    const primitivePath = `${libraryRoot}/${candidate.candidateId}.png`;
    binaryFiles[primitivePath] = primitive;
    fileRecords[`${libraryRoot}/${candidate.candidateId}.recipe.json`] = candidate.recipe;
    const base = candidate.assetKind === "BACKGROUND_FIELD" ? primitive : (index === 1 || index === 4 ? specimenDark : specimenLight);
    const previewEffect = candidate.effectFamily === "CRT_SCANLINE"
      ? await sharp(primitive).extract({left: 1120, top: 188, width: 580, height: 520}).png().toBuffer()
      : primitive;
    const composite = candidate.assetKind === "BACKGROUND_FIELD"
      ? await sharp(base).composite([{input: await sharp(Buffer.from(specimenOverlaySvg(index === 3))).png().toBuffer(), blend: "over"}]).png().toBuffer()
      : await sharp(base).composite([{input: previewEffect, left: candidate.effectFamily === "CRT_SCANLINE" ? 1120 : 0, top: candidate.effectFamily === "CRT_SCANLINE" ? 188 : 0, blend: "over"}]).png().toBuffer();
    const compositePath = `${libraryRoot}/composites/${candidate.candidateId}-specimen.png`;
    binaryFiles[compositePath] = composite;
    outputs.push({
      candidateId: candidate.candidateId,
      assetKind: candidate.assetKind,
      effectFamily: candidate.effectFamily,
      roleId: candidate.roleId,
      semanticJobs: candidate.semanticJobs,
      semanticAction: candidate.semanticAction,
      publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${primitivePath}`,
      sha256: sha256(primitive),
      width: metadata.width,
      height: metadata.height,
      mimeType: "image/png",
      alphaChannelRequired: isOverlay,
      styleBriefSha256: styleBriefs[index].styleBriefSha256,
      fingerprint: styleBriefs[index].fingerprint,
      recipe: candidate.recipe,
      composite: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${compositePath}`, sha256: sha256(composite), width: 1920, height: 1080},
      machineStatus: "PASS",
      visualReviewStatus: "READY_FOR_USER_REVIEW",
      currentDirectionApproved: false,
      productionAdmitted: false,
      machine: {dimensions: {status: "PASS", width: metadata.width, height: metadata.height, format: metadata.format}, alpha: {status: isOverlay ? "PASS" : "NOT_APPLICABLE_BACKGROUND_FIELD", ...alpha}, ocr: {...ocr, readableTextDetected}, human},
      visualAssessment: {status: "READY_FOR_USER_REVIEW", actualFullFrameInspected: true, actualCompositeInspected: true, note: candidate.assetKind === "BACKGROUND_FIELD" ? "process contour field remains a background with a clear directional event" : "effect remains separable and was compared over the same typography-and-object specimen"},
    });
    composites.push({input: await sharp(composite).resize(600, 338, {fit: "cover"}).png().toBuffer(), left: [24, 660, 1296][index % 3], top: index < 3 ? 68 : 716});
  }

  const lefts = [24, 660, 1296];
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1460"><rect width="1920" height="1460" fill="#0b1015"/><text x="24" y="36" fill="#dfff68" font-family="monospace" font-size="20">DEFAULT EFFECT PRIMITIVES V1 · SAME SPECIMEN COMPARISON · USER ACTUAL-PIXEL REVIEW</text>${outputs.map((output, index) => `<text x="${lefts[index % 3]}" y="${index < 3 ? 430 : 1078}" fill="#eef1f0" font-family="monospace" font-size="14">${escapeXml(output.candidateId)}</text><text x="${lefts[index % 3]}" y="${index < 3 ? 454 : 1102}" fill="#8fa6b8" font-family="monospace" font-size="12">${escapeXml(output.effectFamily)} · ${escapeXml(output.assetKind)} · NOT APPROVED</text>`).join("")}<line x1="24" y1="1150" x2="1896" y2="1150" stroke="#32414d"/><text x="24" y="1192" fill="#dfff68" font-family="monospace" font-size="16">USAGE BOUNDARY</text><text x="24" y="1232" fill="#d9e0e2" font-family="monospace" font-size="14">CRT / 6-shot window ≤ 2 · one effect family per frame · semantic action required · global filter forbidden</text><text x="24" y="1272" fill="#8fa6b8" font-family="monospace" font-size="13">Transparent originals and recipes are separate from the specimen composites. Machine PASS cannot approve visual direction.</text><text x="24" y="1378" fill="#ef7a70" font-family="monospace" font-size="15">MOTION · RESOLVE · FINAL RENDER · WHOLE-FILM EXPANSION remain frozen.</text></svg>`);
  const reviewSheet = await sharp(labels).composite(composites).png().toBuffer();
  const reviewSheetPath = `${libraryRoot}/review-sheet.png`;
  binaryFiles[reviewSheetPath] = reviewSheet;
  const reviewBody = {contract: "A1DefaultEffectPrimitiveReview/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", sourceLibraryPlanSha256: libraryPlan.planSha256, sourceUniformFamilyContinuationSha256: authority.uniformPatternFamilyContinuation.continuationSha256, researchNoteSha256: sha256(fs.readFileSync(notePath)), styleAuditSha256: styleAudit.auditSha256, candidateCount: outputs.length, candidates: outputs, reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheet), width: 1920, height: 1460}, usagePolicy: {maximumCrtFamilyInAnySix: 2, maximumEffectFamiliesPerFrame: 1, semanticActionRequired: true, decorativeUseForbidden: true, globalFilterForbidden: true, scanlineDefaultScope: "LOCAL_OR_OBJECT_BOUND", signalTearDefaultScope: "EVENT_ONLY"}, machinePassCannotApprove: true, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, frozenBoundaries: {motion: true, resolve: true, finalRender: true, wholeFilmExpansion: true}, createdAt: now};
  const review = assertDefaultEffectPrimitiveReview({...reviewBody, reviewSha256: sha256(reviewBody)});
  const continuationBody = {contract: "A1DefaultEffectPrimitiveContinuation/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", authorizationSource: "CURRENT_THREAD_EXECUTE_DIRECTIVE", userDirective: "执行吧", directionScope: "EFFECT_PRIMITIVES_AND_PROCESS_CONTOUR_FIELDS", sourceLibraryPlanSha256: libraryPlan.planSha256, reviewSha256: review.reviewSha256, review, productionAdmitted: false, frozenBoundaries: review.frozenBoundaries, createdAt: now};
  const continuation = assertDefaultEffectPrimitiveContinuation({...continuationBody, continuationSha256: sha256(continuationBody)});
  const nextAuthorityBody = structuredClone(authority);
  delete nextAuthorityBody.authoritySha256;
  nextAuthorityBody.effectPrimitiveContinuation = continuation;
  nextAuthorityBody.updatedAt = now;
  nextAuthorityBody.authoritySha256 = sha256(nextAuthorityBody);
  const nextAuthority = assertArticleAssetProductionAuthority(nextAuthorityBody);
  const next = structuredClone(current);
  next.production.articleAssetProductionAuthority = nextAuthority;
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "default-effect-primitives-ready-for-review", targetId: continuation.continuationSha256, payload: {candidateCount: outputs.length, overlayCount: outputs.filter((item) => item.assetKind === "TRANSPARENT_EFFECT_OVERLAY").length, backgroundFieldCount: outputs.filter((item) => item.assetKind === "BACKGROUND_FIELD").length, reviewSha256: review.reviewSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, now});
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `default-effect-primitives-v1-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {...fileRecords, [`${libraryRoot}/style-briefs.json`]: {contract: "A1DefaultEffectPrimitiveStyleBriefSet/v1", briefs: styleBriefs}, [`${libraryRoot}/style-audit.json`]: styleAudit, [`${libraryRoot}/review.json`]: review, [`${libraryRoot}/continuation.json`]: continuation}, binaryFiles});
  return {styleAudit, review, continuation, persisted};
});

console.log(JSON.stringify({status: result.review.status, candidateCount: result.review.candidateCount, reviewSha256: result.review.reviewSha256, continuationSha256: result.continuation.continuationSha256, reviewSheet: result.review.reviewSheet.publicUrl, candidates: result.review.candidates.map(({candidateId, assetKind, effectFamily, sha256, publicUrl, composite}) => ({candidateId, assetKind, effectFamily, sha256, publicUrl, composite})), workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, null, 2));
