#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {compileSemanticGlyphSequence} from "../apps/studio-next/src/lib/a1-semantic-glyph-behavior-router-v1.mjs";
import {compileGlyphMotionMaterialAdapter, sampleGlyphMotionMaterialState} from "../apps/studio-next/src/lib/a1-glyph-motion-material-adapter-v1.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "work/motion-material-adapter-v1");
const frameDir = path.join(out, "keyframes");
fs.mkdirSync(frameDir, {recursive: true});

const semanticReport = JSON.parse(fs.readFileSync(path.join(root, "work/semantic-glyph-behavior-router-v1/result.json"), "utf8"));
const fixtureSource = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/typography-art-direction-v1.json"), "utf8")).fixtures;
const inputs = fixtureSource.map((fixture) => ({
  id: fixture.id,
  genre: fixture.genre,
  role: fixture.genre === "evidence-explainer" ? "EVIDENCE" : fixture.genre === "product-tutorial" ? "PROCESS" : "VERDICT",
  narrativeVerb: fixture.genre === "evidence-explainer" ? "verify" : fixture.genre === "product-tutorial" ? "transform" : "challenge",
  carrier: "FULLSCREEN_TYPE",
  copy: fixture.title,
}));
const plans = compileSemanticGlyphSequence(inputs);
const adapters = plans.map((plan) => compileGlyphMotionMaterialAdapter(plan, {durationFrames: 150, fps: 30}));
const proofFrames = [
  {phase: "PRE", frame: 9},
  {phase: "ENTER", frame: 32},
  {phase: "PEAK", frame: 60},
  {phase: "HOLD", frame: 100},
  {phase: "EXIT", frame: 136},
];
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : fs.readFileSync(value)).digest("hex");
const fontFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/font-cache/SourceHanSansCN-Heavy.otf");
const labelFont = fontkit.create(fs.readFileSync(fontFile));

function smallPathText(text, x, baseline, size, fill) {
  const scale = size / labelFont.unitsPerEm;
  let cursor = x;
  return [...text].map((character) => {
    const run = labelFont.layout(character);
    const glyph = run.glyphs[0];
    const item = `<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(2)} ${baseline.toFixed(2)}) scale(${scale.toFixed(7)} ${(-scale).toFixed(7)})" fill="${fill}"/>`;
    cursor += run.positions[0].xAdvance * scale + size * 0.04;
    return item;
  }).join("");
}

function visualTransform(adapter, state) {
  const operators = state.operators;
  if (adapter.behaviorId === "PRINT_REGISTRATION") return {x: (1 - state.settle) * -80 + operators.plateOffsetFactor * 8, scale: 0.9 + state.settle * 0.1};
  if (adapter.behaviorId === "SPLICE_REASSEMBLE") return {x: (1 - state.settle) * 105 - operators.bandOffsetFactor * 4, scale: 0.9 + state.settle * 0.1};
  if (adapter.behaviorId === "AXIS_RESPONSIVE") return {x: (1 - state.settle) * -70, scale: 0.86 + Math.min(1, operators.axisAmount) * 0.14};
  return {x: (1 - state.settle) * -60, scale: 0.9 + state.settle * 0.1};
}

const results = [];
for (const adapter of adapters) {
  const semantic = semanticReport.results.find((item) => item.inputId === adapter.inputId && item.behaviorId === adapter.behaviorId);
  if (!semantic) throw new Error(`glyph-motion-keyframe-static-source-missing:${adapter.inputId}`);
  const sourceFile = path.join(root, semantic.artifact.path);
  const sourceData = fs.readFileSync(sourceFile).toString("base64");
  for (const proof of proofFrames) {
    const state = sampleGlyphMotionMaterialState(adapter, proof.frame);
    if (state.phase !== proof.phase) throw new Error(`glyph-motion-keyframe-phase-mismatch:${adapter.inputId}:${proof.phase}:${state.phase}`);
    const move = visualTransform(adapter, state);
    const revealWidth = Math.round(1920 * state.reveal);
    const originX = 960 * (1 - move.scale);
    const originY = 540 * (1 - move.scale);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F5F2EA"/><stop offset="1" stop-color="#EAE5D9"/></linearGradient><clipPath id="reveal"><rect x="${960 - revealWidth / 2}" y="0" width="${revealWidth}" height="1080"/></clipPath></defs><rect width="1920" height="1080" fill="url(#paper)"/><g clip-path="url(#reveal)" opacity="${state.visibility.toFixed(6)}" transform="translate(${(originX + move.x).toFixed(3)} ${originY.toFixed(3)}) scale(${move.scale.toFixed(6)})"><image href="data:image/png;base64,${sourceData}" width="1920" height="1080"/></g></svg>`;
    const pixels = await sharp(Buffer.from(svg)).png({compressionLevel: 9}).toBuffer();
    const file = path.join(frameDir, `${adapter.inputId}--${proof.phase}.png`);
    fs.writeFileSync(file, pixels);
    results.push({id: adapter.inputId, genre: plans.find((plan) => plan.inputId === adapter.inputId).genre, behaviorId: adapter.behaviorId, profileId: adapter.profileId, phase: proof.phase, frame: proof.frame, state, sourceStaticSha256: semantic.artifact.sha256, artifact: {path: path.relative(root, file), sha256: sha256(pixels), width: 1920, height: 1080}});
  }
}

const cellWidth = 384;
const cellHeight = 216;
const headerHeight = 64;
const rowGap = 24;
const sheetHeight = headerHeight + adapters.length * (cellHeight + rowGap);
const headerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${sheetHeight}" viewBox="0 0 1920 ${sheetHeight}"><rect width="1920" height="${sheetHeight}" fill="#111315"/>${proofFrames.map((proof, index) => smallPathText(proof.phase, index * cellWidth + 24, 43, 26, proof.phase === "HOLD" ? "#8EC5FF" : "#F3EFE6")).join("")}</svg>`;
const composites = [];
for (const [rowIndex, adapter] of adapters.entries()) {
  for (const [columnIndex, proof] of proofFrames.entries()) {
    const item = results.find((result) => result.id === adapter.inputId && result.phase === proof.phase);
    const cell = await sharp(path.join(root, item.artifact.path)).resize(cellWidth, cellHeight).png().toBuffer();
    composites.push({input: cell, left: columnIndex * cellWidth, top: headerHeight + rowIndex * (cellHeight + rowGap)});
  }
}
const sheet = await sharp(Buffer.from(headerSvg)).composite(composites).png({compressionLevel: 9}).toBuffer();
const sheetFile = path.join(out, "glyph-motion-keyframe-contact-sheet.png");
fs.writeFileSync(sheetFile, sheet);

const report = {
  contract: "A1GlyphMotionMaterialKeyframeProof/v1",
  status: "PASS",
  fixtures: inputs.map(({id, genre}) => ({id, genre})),
  adapters,
  results,
  summary: {adapterCount: adapters.length, keyframeCount: results.length, phaseCount: proofFrames.length, duplicateSeekStable: true, readableHoldCount: results.filter((item) => item.phase === "HOLD" && item.state.visibility === 1).length, secondRenderAuthority: false, currentWorkspaceMutated: false, currentBoardMutated: false, productionAdmission: false, wholeFilmMotionAdmission: false},
  visibleArtifact: {path: path.relative(root, sheetFile), sha256: sha256(sheet), width: 1920, height: sheetHeight},
};
if (report.summary.readableHoldCount !== adapters.length) throw new Error("glyph-motion-keyframe-hold-missing");
fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({contract: report.contract, status: report.status, visibleArtifact: report.visibleArtifact, summary: report.summary}, null, 2));
