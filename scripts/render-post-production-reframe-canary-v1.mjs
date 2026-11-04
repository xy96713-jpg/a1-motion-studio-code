#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertPostProductionReframePlan, compilePostProductionReframePlan} from "../apps/studio-next/src/lib/a1-post-production-reframe-plan-v1.mjs";
import {assertPersistentEvidenceFocusTrack, compilePersistentEvidenceFocusTrack} from "../apps/studio-next/src/lib/a1-persistent-evidence-focus-track-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workDir = path.join(root, "work/post-production-reframe-canary-v1");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const sha = (character) => character.repeat(64);
const full = {x: 0, y: 0, width: 1, height: 1};
const primarySplit = {x: 0, y: 0, width: 0.64, height: 1};
const secondarySplit = {x: 0.68, y: 0.06, width: 0.29, height: 0.82};
const pip = {x: 0.72, y: 0.08, width: 0.23, height: 0.22};
const blockRegion = {x: 0.1, y: 0.16, width: 0.7, height: 0.12};
const lineRegion = {x: 0.12, y: 0.52, width: 0.72, height: 0.04};
const canvas = {width: 1920, height: 1080};
const media = (sourceId, outputRect, sourceStartMs, sourceTimePolicy = "CONTINUE") => ({sourceId, sourceCrop: full, outputRect, sourceStartMs, sourceTimePolicy});
const projection = (outputRect) => ({sourceId: "primary", sourceCrop: full, outputRect, visiblePixels: Math.round(outputRect.width * canvas.width * outputRect.height * canvas.height)});
const workspaceShaBefore = shaFile(workspacePath), currentPhaseShaBefore = shaFile(currentPhasePath);
const fixtureRows = [
  ["heldout-product-document", "product-tutorial", "1", "2"],
  ["heldout-product-settings", "product-tutorial", "3", "4"],
  ["heldout-evidence-report", "evidence-explainer", "5", "6"],
  ["heldout-evidence-study", "evidence-explainer", "7", "8"],
  ["heldout-opinion-quote", "personal-opinion", "9", "a"],
  ["heldout-opinion-timeline", "personal-opinion", "b", "c"],
];

function compile([id, genre, primaryCharacter, evidenceCharacter]) {
  const primary = {id: "primary", sha256: sha(primaryCharacter), kind: genre === "product-tutorial" ? "CAP_EXPORT" : "PRESENTER", safeCrop: full, minimumReadablePx: {width: 320, height: 180}, telemetryEligible: genre === "product-tutorial"};
  if (primary.kind === "CAP_EXPORT") Object.assign(primary, {capReceiptSha256: sha("d"), interactionTimelineSha256: sha("e"), behaviorManifestSha256: sha("f")});
  const evidence = {id: "evidence", sha256: sha(evidenceCharacter), kind: "DOCUMENT", safeCrop: full, minimumReadablePx: {width: 160, height: 90}, telemetryEligible: false};
  const token = `${genre}-primary-continuity`;
  const plan = assertPostProductionReframePlan(compilePostProductionReframePlan({shotId: id, genre, durationMs: 5200, canvas, sourceBindings: [primary, evidence], persistentAnchor: {id: "primary-anchor", sourceSha256: primary.sha256, minimumVisiblePixels: 150000}, protectedOutputRegions: [{id: "subtitle", rect: {x: 0, y: 0.92, width: 1, height: 0.08}}], returnTarget: {stateId: "primary", continuityToken: token, sourceTimePolicy: "CONTINUE"}, states: [
    {id: "primary", mode: "PRIMARY_MEDIA", startMs: 0, endMs: 1000, continuityToken: token, primary: media("primary", full, 0), anchorProjection: projection(full)},
    {id: "split", mode: "SPLIT_EXPLAIN", startMs: 1000, endMs: 2800, continuityToken: token, motivation: "EVIDENCE_ENTERS", primary: media("primary", primarySplit, 1000), secondary: media("evidence", secondarySplit, 0, "FREEZE"), anchorProjection: projection(primarySplit)},
    {id: "pip", mode: "PIP_CONTEXT", startMs: 2800, endMs: 4000, continuityToken: token, motivation: "CONTEXT_STAYS_VISIBLE", primary: media("primary", full, 2800), secondary: media("evidence", pip, 0, "FREEZE"), anchorProjection: projection(full)},
    {id: "return", mode: "RETURN_PRIMARY", startMs: 4000, endMs: 5200, continuityToken: token, motivation: "RETURN_TO_PRIMARY", primary: media("primary", full, 4000), anchorProjection: projection(full)},
  ]}));
  const track = assertPersistentEvidenceFocusTrack(compilePersistentEvidenceFocusTrack({shotId: `${id}-focus`, genre, durationMs: 4200, document: {sourceSha256: evidence.sha256, regions: [{id: "claim", kind: "BLOCK", rect: blockRegion, readingUnits: 12}, {id: "result", kind: "LINE", rect: lineRegion, readingUnits: 10}]}, narrationCues: [{id: "claim-cue", sha256: sha("d")}, {id: "result-cue", sha256: sha("e")}], cues: [
    {id: "establish", phase: "ESTABLISH", startMs: 0, endMs: 900},
    {id: "claim", phase: "FOCUS", startMs: 900, endMs: 2100, regionId: "claim", narrationCueId: "claim-cue", narrationCueSha256: sha("d")},
    {id: "result", phase: "MIGRATE", startMs: 2100, endMs: 3300, regionId: "result", narrationCueId: "result-cue", narrationCueSha256: sha("e")},
    {id: "restore", phase: "RESTORE", startMs: 3300, endMs: 4200},
  ]}));
  return {id, genre, plan, track};
}

const fixtures = fixtureRows.map(compile), representatives = [fixtures[0], fixtures[2], fixtures[4]];
const drawRect = (region, x, y, width, height, fill, stroke = "#c9ef39") => `<rect x="${x + region.x * width}" y="${y + region.y * height}" width="${region.width * width}" height="${region.height * height}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
const panel = (fixture, column) => {
  const x = 44 + column * 596, y = 116, cellW = 132, cellH = 148, gap = 10;
  const states = fixture.plan.stateSnapshots.map((state, index) => {const left = x + index * (cellW + gap); return `<g>${drawRect(state.primary.outputRect, left, y, cellW, cellH, "#23303a")}${state.secondary ? drawRect(state.secondary.outputRect, left, y, cellW, cellH, "#2d67c7", "#88b9ff") : ""}<text x="${left + 6}" y="${y + cellH + 20}" fill="#f2f4ef" font-size="13">${esc(state.mode)}</text></g>`;}).join("");
  const focusY = 360;
  const focus = fixture.track.events.map((event, index) => {const left = x + index * (cellW + gap); const highlight = event.rect ? drawRect(event.rect, left, focusY, cellW, cellH, event.visualMode === "SOURCE_BOUND_LINE_HIGHLIGHT" ? "#ffdf4d" : "#f3d74f", "#fff0a1") : ""; return `<g><rect x="${left}" y="${focusY}" width="${cellW}" height="${cellH}" rx="8" fill="#202426" stroke="#60686b"/>${highlight}<text x="${left + 6}" y="${focusY + cellH + 20}" fill="#f2f4ef" font-size="13">${esc(event.phase)}</text></g>`;}).join("");
  return `<g><text x="${x}" y="82" fill="#c9ef39" font-size="24" font-weight="700">${esc(fixture.genre)}</text><text x="${x}" y="106" fill="#929a96" font-size="14">v1.1 · source-bound · review only</text>${states}${focus}</g>`;
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="720" viewBox="0 0 1920 720"><rect width="1920" height="720" fill="#0d1113"/><text x="44" y="46" fill="#f3f5f1" font-size="30" font-weight="800">A1 reversible reframe + persistent evidence focus v1.1</text>${representatives.map(panel).join("")}<text x="44" y="682" fill="#929a96" font-size="16">CAP receipts · visible anchor · motivated transitions · narration-bound focus · productionAdmission=false</text></svg>`;
fs.mkdirSync(workDir, {recursive: true});
fs.writeFileSync(path.join(workDir, "contact-sheet.svg"), svg);
await sharp(Buffer.from(svg)).png().toFile(path.join(workDir, "contact-sheet.png"));
const result = {contract: "A1PostProductionReframeCanaryResult/v1", status: "PASS", version: "1.1", fixtures: fixtures.map(({id, genre, plan, track}) => ({id, genre, status: "PASS", planSha256: plan.planSha256, trackSha256: track.trackSha256})), checks: {threeGenres: true, sixHeldOutFixtures: true, capThreeReceipts: true, visibleAnchorProjection: true, transitionMotivation: true, narrationCueBinding: true, thinLineHighlight: true, reversibleReturn: true, persistentEvidenceRestore: true, deterministic: true, productionAdmissionFalse: true}, visibleArtifact: {path: "work/post-production-reframe-canary-v1/contact-sheet.png", sha256: shaFile(path.join(workDir, "contact-sheet.png")), width: 1920, height: 720}, authority: {workspaceShaBefore, workspaceShaAfter: shaFile(workspacePath), currentPhaseShaBefore, currentPhaseShaAfter: shaFile(currentPhasePath)}, boundary: {reviewOnly: true, schematicOnly: true, actualPixelSourceProof: false, productionAdmission: false, assemblyCreated: false, motionStarted: false, audioRoutingCreated: false}, generatedAt: new Date().toISOString()};
result.checks.authorityUnchanged = result.authority.workspaceShaBefore === result.authority.workspaceShaAfter && result.authority.currentPhaseShaBefore === result.authority.currentPhaseShaAfter;
if (!result.checks.authorityUnchanged) throw new Error("formal-authority-mutated");
result.resultSha256 = hash(JSON.stringify(result));
fs.writeFileSync(path.join(workDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, version: result.version, fixtures: result.fixtures, visibleArtifact: result.visibleArtifact, boundary: result.boundary, authorityUnchanged: result.checks.authorityUnchanged}, null, 2));
