#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const phaseId = "storyboard-stage2-full-review-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const currentPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const candidatePropsPath = path.join(artifactRoot, "candidate-props.json");
const reportPath = path.join(artifactRoot, "report.json");
const stillsReportPath = path.join(artifactRoot, "stills-report.json");
const contactSheetArtifactPath = path.join(artifactRoot, "contact-sheet.png");
const contactSheetPublicPath = path.join(publicRoot, "contact-sheet.png");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

async function pixelStats(filePath) {
  const {data, info} = await sharp(filePath).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const total = info.width * info.height;
  let paper = 0;
  let dark = 0;
  let cobalt = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (r > 220 && g > 220 && b > 214 && Math.abs(r - g) < 24 && Math.abs(g - b) < 28) paper += 1;
    if (max < 64) dark += 1;
    if (b > 100 && b > r * 1.22 && b > g * 1.08) cobalt += 1;
  }
  return {
    width: info.width,
    height: info.height,
    paperFraction: Number((paper / total).toFixed(4)),
    darkFraction: Number((dark / total).toFixed(4)),
    cobaltFraction: Number((cobalt / total).toFixed(4)),
  };
}

const report = readJson(reportPath);
const stillsReport = readJson(stillsReportPath);
const currentPropsSha256 = sha256File(currentPropsPath);
const candidatePropsSha256 = sha256File(candidatePropsPath);
const candidateProps = readJson(candidatePropsPath);
const targetBeatIds = ["H03-B04", "H06-B01", "H10-B03", "H11-B01"];
const selectedBeatIds = report.anchorBeatIds || [];
const checks = [];
const check = (id, pass, detail) => checks.push({id, status: pass ? "PASS" : "FAIL", detail});

check("full-review-report-ready", report.contract === "A1StoryboardStage2FullReview/v1" && report.status === "REVIEW_CANDIDATE_READY", {contract: report.contract, status: report.status});
check("candidate-props-is-separate", candidatePropsSha256 === report.candidate?.propsSha256 && report.candidate?.unchangedCurrentProps === true, {candidatePropsSha256, report: report.candidate?.propsSha256});
check("current-props-unchanged", currentPropsSha256 === report.sourceBinding?.propsSha256, {currentPropsSha256, source: report.sourceBinding?.propsSha256});
check("review-only-locks", report.rendererAdoptionAllowed === false && report.applyAllowedBeforeExplicitApproval === false && report.fullMp4RenderAllowed === false && report.finalRenderAllowed === false && report.resolveExportAllowed === false, {rendererAdoptionAllowed: report.rendererAdoptionAllowed, applyAllowedBeforeExplicitApproval: report.applyAllowedBeforeExplicitApproval});
check("full-scene-coverage", report.summary?.sceneCount === 50 && report.summary?.reviewedSceneCount === 50 && report.scenes?.length === 50, report.summary);
check("anchor-coverage", selectedBeatIds.length === 12 && selectedBeatIds.every((beatId) => report.scenes.some((scene) => scene.beatId === beatId)), selectedBeatIds);
check("targeted-repair-coverage", targetBeatIds.every((beatId) => report.targetRepairs?.some((scene) => scene.beatId === beatId)), targetBeatIds);
check("candidate-schema-shape", Array.isArray(candidateProps.scenes) && candidateProps.scenes.length === 50 && candidateProps.scenes.every((scene) => scene.semanticVisual?.contract === "A1SemanticVisualStage/v1" ? ["argument", "operation", "archive"].includes(scene.semanticVisual.kind) : true), {sceneCount: candidateProps.scenes?.length});

const targetAssertions = {
  "H03-B04": (scene) => scene.semanticVisual?.kind === "argument" && scene.semanticVisual.argument?.mode === "causal" && scene.entityEvidence?.length === 0,
  "H06-B01": (scene) => scene.semanticVisual?.kind === "operation" && scene.semanticVisual.operation?.object === "Codex" && scene.semanticVisual.operation?.action === "调用 API",
  "H10-B03": (scene) => scene.semanticVisual?.kind === "operation" && scene.presentation?.primary === "变成可控工作流" && !scene.titleLines.join("").includes("…"),
  "H11-B01": (scene) => scene.semanticVisual?.kind === "operation" && scene.semanticVisual.operation?.action === "人来修改" && scene.semanticVisual.operation?.result === "可用成稿",
};
for (const beatId of targetBeatIds) {
  const scene = candidateProps.scenes.find((item) => item.beatId === beatId);
  check(`target-${beatId}-semantic-repair`, Boolean(scene && targetAssertions[beatId](scene)), scene ? {kind: scene.semanticVisual?.kind, primary: scene.presentation?.primary, titleLines: scene.titleLines, entityEvidenceCount: scene.entityEvidence?.length} : "missing");
}

const stillResults = [];
for (const beatId of selectedBeatIds) {
  const filePath = path.join(publicRoot, "stills", `${beatId}.png`);
  const exists = fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  const stats = exists ? await pixelStats(filePath) : null;
  const metadata = stillsReport.rendered?.find((item) => item.beatId === beatId) || stillsReport.reused?.find((item) => item.beatId === beatId) || null;
  const frameChecks = {
    exists,
    metadataShaMatches: Boolean(exists && metadata?.sha256 === sha256File(filePath)),
    expectedDimensions: stats?.width === 960 && stats?.height === 540,
    paperFieldVisible: Boolean(stats && stats.paperFraction >= 0.2),
    noBlackFullField: Boolean(stats && stats.darkFraction < 0.48),
  };
  stillResults.push({beatId, path: rel(filePath), sha256: exists ? sha256File(filePath) : null, stats, checks: frameChecks, status: Object.values(frameChecks).every(Boolean) ? "PASS" : "FAIL"});
}
check("candidate-stills-pass", stillsReport.status === "PASS" && stillResults.length === 12 && stillResults.every((item) => item.status === "PASS"), {stillsStatus: stillsReport.status, stillResults});

const tileWidth = 480, tileHeight = 270, gutter = 10, columns = 4, rows = 3;
const tiles = await Promise.all(selectedBeatIds.map((beatId) => sharp(path.join(publicRoot, "stills", `${beatId}.png`)).resize(tileWidth, tileHeight).png().toBuffer()));
const contactSheet = await sharp({create: {width: columns * tileWidth + (columns - 1) * gutter, height: rows * tileHeight + (rows - 1) * gutter, channels: 3, background: "#dfe2dd"}})
  .composite(tiles.map((input, index) => ({input, left: (index % columns) * (tileWidth + gutter), top: Math.floor(index / columns) * (tileHeight + gutter)})))
  .png()
  .toBuffer();
for (const output of [contactSheetArtifactPath, contactSheetPublicPath]) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, contactSheet);
}
const contactSheetSha256 = sha256File(contactSheetArtifactPath);
check("contact-sheet-public-identical", sha256File(contactSheetPublicPath) === contactSheetSha256, {artifact: contactSheetSha256, public: sha256File(contactSheetPublicPath)});

const failures = checks.filter((item) => item.status !== "PASS");
const audit = {
  contract: "A1StoryboardStage2FullReviewAudit/v1",
  phaseId,
  status: failures.length ? "FAIL" : "PASS_REVIEWABLE",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  sourceBinding: report.sourceBinding,
  candidate: report.candidate,
  anchors: selectedBeatIds,
  targetBeatIds,
  stills: stillResults,
  contactSheet: {artifactPath: rel(contactSheetArtifactPath), publicPath: rel(contactSheetPublicPath), sha256: contactSheetSha256},
  checks,
  failures,
  nextAction: failures.length ? "repair-stage2-candidate-proof" : "show-stage2-candidate-contact-sheet-for-direct-review-before-adoption",
};
writeJson(path.join(artifactRoot, "audit.json"), audit);
writeJson(path.join(publicRoot, "audit.json"), audit);
console.log(JSON.stringify({status: audit.status, failures: failures.map((item) => item.id), contactSheet: audit.contactSheet, nextAction: audit.nextAction}, null, 2));
if (failures.length) process.exitCode = 2;
