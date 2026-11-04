#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(generatedRoot, "opening-ten-shot-director-board-v1");
const frameRoot = path.join(outputRoot, "frames");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const workspace = readJson(workspaceFile);
if (workspace.production.generation.summary.queued !== 0 || workspace.production.generation.summary.running !== 0 || workspace.production.generation.workerStatus !== "frozen") throw new Error("opening-director-board-runtime-not-frozen-idle");
if (workspace.production.userVisualApprovalGate?.userVisualApproval !== "NOT_APPROVED") throw new Error("opening-director-board-user-boundary-invalid");
fs.mkdirSync(frameRoot, {recursive: true});

const timeline = workspace.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.items.filter((item) => item.order >= 1 && item.order <= 10);
if (timeline.length !== 10 || timeline.at(0)?.shotId !== "ED-01" || timeline.at(-1)?.shotId !== "ED-10") throw new Error("opening-director-board-timeline-invalid");
const source = (relative) => `/generated/system-line/editorial-asset-workbench-v1/source-cache/${relative}`;
const stateSpecs = {
  "ED-02": {
    actionId: "causalRewrite",
    semanticAction: "select-sentence_then_rewrite_then_apply",
    states: [
      {role: "BEFORE", publicUrl: source("causal-writing-workbench-v1/01-context.png"), focus: {x: 480, y: 410, width: 980, height: 420}},
      {role: "ACTION", publicUrl: source("causal-writing-workbench-v1/02-selected.png"), focus: {x: 480, y: 430, width: 980, height: 300}},
      {role: "RESULT", publicUrl: source("causal-writing-workbench-v1/04-applied.png"), focus: {x: 480, y: 390, width: 980, height: 430}},
    ],
  },
  "ED-03": {
    actionId: "preference",
    semanticAction: "reject_bad_sentence_then_like_good_sentence_then_memory_confirmation",
    states: [
      {role: "BEFORE", publicUrl: source("writing-workbench-action-pack-v1/preference-01-selected-bad.png"), focus: {x: 500, y: 420, width: 920, height: 330}},
      {role: "ACTION", publicUrl: source("writing-workbench-action-pack-v1/preference-02-disliked.png"), focus: {x: 500, y: 410, width: 980, height: 360}},
      {role: "RESULT", publicUrl: source("writing-workbench-action-pack-v1/preference-04-liked.png"), focus: {x: 500, y: 390, width: 980, height: 390}},
    ],
  },
  "ED-04": {
    actionId: "paragraph",
    semanticAction: "open_blank_slot_then_type_request_then_apply_contextual_paragraph",
    states: [
      {role: "BEFORE", publicUrl: source("writing-workbench-action-pack-v1/paragraph-01-slot.png"), focus: {x: 520, y: 390, width: 900, height: 340}},
      {role: "ACTION", publicUrl: source("writing-workbench-action-pack-v1/paragraph-02-request.png"), focus: {x: 500, y: 380, width: 980, height: 390}},
      {role: "RESULT", publicUrl: source("writing-workbench-action-pack-v1/paragraph-04-applied.png"), focus: {x: 500, y: 350, width: 980, height: 460}},
    ],
  },
  "ED-05": {
    actionId: "review",
    semanticAction: "finished_article_then_review_findings_then_located_fix_surface",
    states: [
      {role: "BEFORE", publicUrl: source("writing-workbench-action-pack-v1/paragraph-05-applied.png"), focus: {x: 500, y: 300, width: 980, height: 520}},
      {role: "ACTION", publicUrl: source("writing-workbench-action-pack-v1/review-01-findings.png"), focus: {x: 1220, y: 80, width: 660, height: 920}},
      {role: "RESULT", publicUrl: source("writing-workbench-action-pack-v1/review-02-fix-surface.png"), focus: {x: 500, y: 410, width: 1320, height: 360}},
    ],
  },
  "ED-06": {
    actionId: "presentation",
    semanticAction: "open_presentation_then_adjust_size_speed_then_play",
    states: [
      {role: "BEFORE", publicUrl: source("writing-workbench-action-pack-v1/presentation-01-open.png"), focus: {x: 400, y: 120, width: 1120, height: 790}},
      {role: "ACTION", publicUrl: source("writing-workbench-action-pack-v1/presentation-02-adjusted.png"), focus: {x: 1180, y: 0, width: 720, height: 190}},
      {role: "RESULT", publicUrl: source("writing-workbench-action-pack-v1/presentation-03-playing.png"), focus: {x: 400, y: 120, width: 1120, height: 790}},
    ],
  },
};

for (const spec of Object.values(stateSpecs)) for (const state of spec.states) {
  const file = publicFile(state.publicUrl);
  if (!fs.existsSync(file)) throw new Error(`opening-director-source-missing:${state.publicUrl}`);
  state.sha256 = sha256(fs.readFileSync(file));
}

async function renderStateFrame(shotId, spec) {
  const panelWidth = 520;
  const panelHeight = 293;
  const lefts = [150, 700, 1250];
  const composites = [];
  for (let index = 0; index < spec.states.length; index += 1) {
    const state = spec.states[index];
    const image = await sharp(publicFile(state.publicUrl)).resize(panelWidth, panelHeight, {fit: "cover"}).png().toBuffer();
    composites.push({input: image, left: lefts[index], top: 360});
  }
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
    <rect width="1920" height="1080" fill="#090d12"/>
    <text x="150" y="122" fill="#7898ff" font-family="Arial" font-size="34" font-weight="700">${shotId}</text>
    <text x="150" y="190" fill="#f2f5f4" font-family="Arial" font-size="52" font-weight="700">REAL SCREEN ACTION</text>
    ${lefts.map((left, index) => `<rect x="${left - 4}" y="356" width="528" height="301" rx="4" fill="none" stroke="${index === 1 ? "#7898ff" : "#2d3440"}" stroke-width="8"/><circle cx="${left + 26}" cy="700" r="24" fill="${index === 1 ? "#2452ff" : "#202733"}"/><text x="${left + 26}" y="708" text-anchor="middle" fill="#f2f5f4" font-family="Arial" font-size="18" font-weight="700">0${index + 1}</text><text x="${left + 64}" y="709" fill="#a9b0ba" font-family="Arial" font-size="20" font-weight="700">${spec.states[index].role}</text>`).join("")}
    <path d="M 650 505 C 670 475 680 475 700 505" fill="none" stroke="#2452ff" stroke-width="8"/>
    <path d="M 1200 505 C 1220 475 1230 475 1250 505" fill="none" stroke="#2452ff" stroke-width="8"/>
    <rect x="150" y="840" width="1620" height="8" fill="#17203a"/><rect x="150" y="840" width="1080" height="8" fill="#2452ff"/>
  </svg>`);
  const bytes = await sharp({create: {width: 1920, height: 1080, channels: 4, background: "#090d12"}}).composite([{input: overlay}, ...composites]).png({compressionLevel: 9}).toBuffer();
  const file = path.join(frameRoot, `${shotId}.png`);
  fs.writeFileSync(file, bytes);
  return {publicUrl: publicUrlFor(file), sha256: sha256(bytes), width: 1920, height: 1080};
}

async function normalizeCurrentFrame(item) {
  const sourceFile = publicFile(item.preview.publicUrl);
  if (!fs.existsSync(sourceFile)) throw new Error(`opening-director-current-frame-missing:${item.shotId}`);
  const bytes = await sharp(sourceFile).resize(1920, 1080, {fit: "cover"}).png({compressionLevel: 9}).toBuffer();
  const file = path.join(frameRoot, `${item.shotId}.png`);
  fs.writeFileSync(file, bytes);
  return {publicUrl: publicUrlFor(file), sha256: sha256(bytes), width: 1920, height: 1080, sourcePublicUrl: item.preview.publicUrl, sourceSha256: sha256(fs.readFileSync(sourceFile))};
}

const shots = [];
for (const item of timeline) {
  const screenSpec = stateSpecs[item.shotId];
  const frame = screenSpec ? await renderStateFrame(item.shotId, screenSpec) : await normalizeCurrentFrame(item);
  shots.push({
    shotId: item.shotId,
    order: item.order,
    timeRange: item.timeRange,
    route: item.route,
    sourceRole: item.sourceRole,
    titleRole: item.titleRole,
    sourceText: item.sourceText,
    semanticJob: workspace.production.shotVisualCoveragePlan.shotPlans.find((shot) => shot.shotId === item.shotId)?.semanticJob || null,
    frame,
    stateSequence: screenSpec ? screenSpec.states : null,
    actionId: screenSpec?.actionId || null,
    semanticAction: screenSpec?.semanticAction || null,
    motionIntent: screenSpec ? "single_cubic_camera_move_between_verified_focus_regions_with_350ms_settle" : item.shotId === "ED-08" ? "one_second_typography_takeover_then_hard_reset" : item.shotId === "ED-10" ? "clean_presenter_breathing_reset" : "preserve_current_static_composition",
  });
}

async function buildBoard(outputFile) {
  const tileWidth = 720;
  const imageHeight = 405;
  const labelHeight = 90;
  const tiles = await Promise.all(shots.map(async (shot) => {
    const image = await sharp(publicFile(shot.frame.publicUrl)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0f13"/><rect width="7" height="100%" fill="${shot.route === "SCREEN_EVIDENCE" ? "#2452ff" : shot.titleRole === "HERO_TAKEOVER" ? "#7898ff" : "#4b5358"}"/><text x="22" y="30" fill="#f2f5f4" font-family="Arial" font-size="18" font-weight="700">${shot.shotId} · ${(shot.timeRange.startMs / 1000).toFixed(2)}–${(shot.timeRange.endMs / 1000).toFixed(2)}s</text><text x="22" y="58" fill="#7898ff" font-family="Arial" font-size="12">${escapeXml(shot.route)} · ${escapeXml(shot.sourceRole)}</text><text x="22" y="78" fill="#89919a" font-family="Arial" font-size="10">${shot.stateSequence ? "VERIFIED BEFORE → ACTION → RESULT" : escapeXml(shot.titleRole)}</text></svg>`);
    return sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 4, background: "#090d12"}}).composite([{input: image}, {input: label, top: imageHeight, left: 0}]).png().toBuffer();
  }));
  const columns = 2;
  const rows = Math.ceil(shots.length / columns);
  const bytes = await sharp({create: {width: tileWidth * columns, height: (imageHeight + labelHeight) * rows, channels: 4, background: "#07090b"}}).composite(tiles.map((input, index) => ({input, left: index % columns * tileWidth, top: Math.floor(index / columns) * (imageHeight + labelHeight)}))).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, bytes);
  return {publicUrl: publicUrlFor(outputFile), sha256: sha256(bytes), width: tileWidth * columns, height: (imageHeight + labelHeight) * rows};
}

async function buildStateBoard(outputFile) {
  const rows = await Promise.all(Object.entries(stateSpecs).map(async ([shotId, spec]) => {
    const sourceFrame = shots.find((shot) => shot.shotId === shotId).frame;
    const image = await sharp(publicFile(sourceFrame.publicUrl)).resize(1440, 810, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="72"><rect width="100%" height="100%" fill="#0b0f13"/><text x="20" y="29" fill="#f2f5f4" font-family="Arial" font-size="18" font-weight="700">${shotId} · ${escapeXml(spec.actionId)}</text><text x="20" y="54" fill="#7898ff" font-family="Arial" font-size="12">${escapeXml(spec.semanticAction)}</text></svg>`);
    return sharp({create: {width: 1440, height: 882, channels: 4, background: "#090d12"}}).composite([{input: image}, {input: label, top: 810, left: 0}]).png().toBuffer();
  }));
  const bytes = await sharp({create: {width: 1440, height: rows.length * 882, channels: 4, background: "#07090b"}}).composite(rows.map((input, index) => ({input, left: 0, top: index * 882}))).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, bytes);
  return {publicUrl: publicUrlFor(outputFile), sha256: sha256(bytes), width: 1440, height: rows.length * 882};
}

const directorBoard = await buildBoard(path.join(outputRoot, "opening-10-shot-director-board.png"));
const screenActionStateBoard = await buildStateBoard(path.join(outputRoot, "opening-screen-action-state-board.png"));
const body = {
  contract: "A1OpeningTenShotDirectorBoard/v1",
  status: "PENDING_AGENT_ACTUAL_PIXEL_REVIEW",
  current: false,
  reviewOnly: true,
  productionAdmitted: false,
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceWholeFilmBoardSha256: workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256,
  openingRange: {startMs: timeline[0].timeRange.startMs, endMs: timeline.at(-1).timeRange.endMs, durationMs: timeline.at(-1).timeRange.endMs - timeline[0].timeRange.startMs},
  shotIds: shots.map((shot) => shot.shotId),
  screenEvidenceShotIds: Object.keys(stateSpecs),
  screenStateContract: "BEFORE_ACTION_RESULT",
  screenMotionRule: {cameraPath: "CUBIC_EASE_IN_OUT", maximumConcurrentFocusActors: 1, minimumSettleMs: 350, hardJumpZoomForbidden: true, cursorPathMustFollowActualAction: true, subtitleTimeRangeIsHardBoundary: true},
  shots,
  directorBoard,
  screenActionStateBoard,
  boundaries: {imageGenerationPerformed: false, imagegenCallCount: 0, canonicalWorkspaceMutationPerformed: false, motionPerformed: false, userVisualApproval: "NOT_APPROVED"},
  generatedAt: new Date().toISOString(),
};
const manifest = {...body, manifestSha256: sha256(body)};
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: manifest.status, directorBoard, screenActionStateBoard, shotCount: shots.length, screenShotCount: Object.keys(stateSpecs).length, openingDurationMs: manifest.openingRange.durationMs, manifestSha256: manifest.manifestSha256, imagegenCallCount: 0}, null, 2)}\n`);
