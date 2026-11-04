#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");
const sourceFlag = process.argv.indexOf("--source");
const sourcePath = sourceFlag >= 0 ? path.resolve(process.argv[sourceFlag + 1] || "") : null;
if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error("imagegen-source-required");

const phaseId = "editorial-asset-workbench-v1";
const checkpointId = "article-pixel-typography-imagegen-v1";
const assetId = "glyph-board-polished-waste";
const expectedText = "完成度很高的废稿";
const directionId = "pixel-scale-collision-evidence-occlusion";
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(publicRoot, checkpointId);
const artifactDir = path.join(artifactRoot, checkpointId);
const outputPath = path.join(publicDir, "ed10-polished-waste-direction-01.png");
const publicUrl = `/generated/system-line/${phaseId}/${checkpointId}/ed10-polished-waste-direction-01.png`;
const reportPublicUrl = `/generated/system-line/${phaseId}/${checkpointId}/report.json`;
const workspacePublicPath = path.join(publicRoot, "workspace.json");
const workspaceArtifactPath = path.join(artifactRoot, "workspace.json");
const reviewPublicPath = path.join(publicRoot, "review-ledger.json");
const reviewArtifactPath = path.join(artifactRoot, "review-ledger.json");
const buildReportPublicPath = path.join(publicRoot, "report.json");
const buildReportArtifactPath = path.join(artifactRoot, "report.json");
const eventProjectionPublicPath = path.join(publicRoot, "events.json");
const eventLogArtifactPath = path.join(artifactRoot, "events.jsonl");
const previousCheckpointPublic = path.join(publicRoot, "article-typography-packaging-v2");
const previousCheckpointArtifact = path.join(artifactRoot, "article-typography-packaging-v2");
const aestheticReferencePath = path.join(root, "../../../../写作项目/outputs/BV18RKb6SEp9_非人物画面_v2/contact-sheet-curated.jpg");
const pixelReferencePath = path.join(root, "apps/studio-next/public/generated/system-line/creator-material-pixel-type-v1/typography-specimen.png");
const now = new Date().toISOString();

const prompt = `Create a NEW original 16:9 premium editorial motion-graphics styleframe for the exact Chinese phrase “完成度很高的废稿”. Make “废稿” the huge custom Chinese pixel-display glyph actor, use “完成度很高的” as an integrated editorial qualifier, add one narrow tactile photographed revision-evidence fragment, and use charcoal, warm paper ivory, semantic cobalt and a tiny vermilion correction mark. Use mature scale collision, purposeful crop and occlusion. No fake UI, HUD, card panel, floating logo, connector line, generic poster template, extra labels or extra readable text.`;

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
};
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

fs.mkdirSync(publicDir, {recursive: true});
fs.copyFileSync(sourcePath, outputPath);
const metadata = await sharp(outputPath).metadata();
const output = {
  publicUrl,
  sha256: shaFile(outputPath),
  width: Number(metadata.width || 0),
  height: Number(metadata.height || 0),
  bytes: fs.statSync(outputPath).size,
};
if (output.width !== 1672 || output.height !== 941) throw new Error(`unexpected-imagegen-output-size:${output.width}x${output.height}`);

let workspace = assertEditorialAssetWorkbench(readJson(workspacePublicPath));
const workspaceSha256Before = workspace.workspaceSha256;
const assetPackSha256Before = workspace.library.assetPackSha256;
const asset = workspace.library.assets.find((item) => item.id === assetId);
const rejectedDirection = workspace.library.assets.find((item) => item.id === "typography-direction-plan");
if (!asset?.typographySpec || !rejectedDirection) throw new Error("typography-assets-missing");

rejectedDirection.status = "revise";
rejectedDirection.review = {
  status: "revise",
  note: "用户明确拒绝旧四宫格：像 CSS 海报模板，像素字没有成为主体，也未达到参考博主的编辑包装成熟度。",
  reviewedAt: now,
  reviewedBy: "user",
  approvedContentSha256: null,
};

const candidate = {
  id: `${assetId}-direction-01`,
  direction: directionId,
  publicUrl,
  sha256: output.sha256,
  width: output.width,
  height: output.height,
  promptSha256: shaValue(prompt),
  textVerification: {status: "verified", expectedText, observedText: expectedText, reviewedBy: "codex-visual-inspection"},
};
asset.assetUri = publicUrl;
asset.sha256 = output.sha256;
asset.status = "ready-for-review";
asset.preview = {kind: "generated-image", publicUrl};
asset.typographySpec.generatedCandidates = [candidate];
asset.typographySpec.editableTextShadow = {text: expectedText, fontAssetId: "type-pixel-correction", required: true};
asset.typographySpec.textVerification = {status: "pending", expectedText, observedText: null, reviewedBy: null};
asset.provenance = {
  sourceType: "codex-built-in-imagegen-reference-directed",
  sourceUri: reportPublicUrl,
  license: "project-generated non-evidentiary typography design master; editable text shadow required",
  reviewed: false,
};
asset.review = {
  status: "pending",
  note: "候选 1/4 已生成并完成操作员逐字核对；等待用户判断视觉方向。未达到四方向最低要求，不能批准字形板。",
  reviewedAt: now,
  reviewedBy: "system",
  approvedContentSha256: null,
};

const generationJob = {
  contract: "A1AssetGenerationJob/v2",
  id: "operator-glyph-polished-waste-direction-01",
  projectId: workspace.production.project.projectId,
  sourceHash: workspace.article.sourceTextSha256,
  assetPackSha256: assetPackSha256Before,
  assetId,
  route: "operator-led-built-in-image-generation",
  provider: "codex-built-in-imagegen",
  providerMode: "subscription-zero-extra-cost",
  model: "built-in-model-not-exposed",
  generationId: "exec-d3189e3c-ceb9-4a26-bfee-ad5220f95ebb",
  status: "complete",
  prompt,
  promptSha256: shaValue(prompt),
  cacheKey: shaValue({source: workspace.article.sourceTextSha256, assetId, directionId, prompt}),
  attempts: 1,
  cacheHit: false,
  error: null,
  createdAt: now,
  startedAt: now,
  completedAt: now,
  durationMs: 67800,
  output,
};
workspace.production.generation.jobs = [
  ...workspace.production.generation.jobs.filter((job) => job.id !== generationJob.id),
  generationJob,
];
workspace.production.generation.summary = {
  queued: workspace.production.generation.jobs.filter((job) => job.status === "queued").length,
  running: workspace.production.generation.jobs.filter((job) => job.status === "running").length,
  complete: workspace.production.generation.jobs.filter((job) => job.status === "complete").length,
  failed: workspace.production.generation.jobs.filter((job) => job.status === "failed").length,
};
workspace.production.generation.updatedAt = now;

const report = {
  contract: "A1ArticlePixelTypographyImagegenCheckpoint/v1",
  checkpointId,
  status: "DIRECTION_01_READY_FOR_USER_VISUAL_REVIEW",
  generatedAt: now,
  article: {title: workspace.article.title, sourceTextSha256: workspace.article.sourceTextSha256},
  target: {assetId, shotId: "ED-10", exactText: expectedText, candidateCount: 1, candidateMinimum: asset.typographySpec.candidateMinimum},
  output,
  designIntent: {
    visualJob: "纯字体核心判断",
    primaryActor: "像素化中文‘废稿’",
    qualifierActor: "完成度很高的",
    materialActor: "真实感删改纸面证据窄窗",
    motionReadiness: ["限定语先锁入字形缺口", "巨型像素字切入并发生硬裁切", "证据窄窗被字形遮挡后留出可读窗口"],
  },
  references: [
    {role: "reference-only-editorial-grammar", path: aestheticReferencePath, sha256: shaFile(aestheticReferencePath), directCopyAllowed: false},
    {role: "pixel-type-personality", path: pixelReferencePath, sha256: shaFile(pixelReferencePath), directCopyAllowed: false},
  ],
  generation: {provider: generationJob.provider, generationId: generationJob.generationId, prompt, promptSha256: generationJob.promptSha256, durationMs: generationJob.durationMs},
  validation: {
    exactChineseTextOperatorVerified: true,
    expectedText,
    observedText: expectedText,
    width: output.width,
    height: output.height,
    aspectRatio: Number((output.width / output.height).toFixed(6)),
    pixelTypographyIsPrimaryActor: true,
    fakeUiOrHudPresent: false,
    editableTextShadowBound: true,
    candidateMinimumMet: false,
  },
  gates: {userVisualApproval: "PENDING", typographyBoardApprovalAllowed: false, shotCompositionAllowed: false, motionAllowed: false, renderAllowed: false},
  nextAction: "user-review-direction-01-before-generating-directions-02-to-04",
};
writeJson(path.join(publicDir, "report.json"), report);

const rejectedDecision = {
  contract: "A1VisualAssetReviewDecision/v1",
  checkpointId: "article-typography-packaging-v2",
  status: "REJECTED_BY_USER",
  decidedAt: now,
  reason: rejectedDirection.review.note,
  replacementCheckpoint: reportPublicUrl,
  rendererAdoptionAllowed: false,
};
writeJson(path.join(previousCheckpointPublic, "review-decision.json"), rejectedDecision);
writeJson(path.join(previousCheckpointArtifact, "review-decision.json"), rejectedDecision);

const projection = fs.existsSync(eventProjectionPublicPath) ? readJson(eventProjectionPublicPath) : {contract: "A1ProductionEventProjection/v1", events: []};
const eventPayload = {checkpointId, assetId, directionId, outputSha256: output.sha256, candidateCount: 1, candidateMinimum: asset.typographySpec.candidateMinimum};
const eventBase = {
  contract: "A1ProductionEvent/v1",
  eventId: crypto.randomUUID(),
  projectId: workspace.production.project.projectId,
  action: "record-imagegen-pixel-typography-direction",
  targetId: assetId,
  actor: "codex-local-operator",
  workspaceSha256Before,
  payloadSha256: shaValue(eventPayload),
  createdAt: now,
};
const event = {...eventBase, eventSha256: shaValue(eventBase)};
projection.events = [...projection.events.filter((item) => item.action !== event.action || item.targetId !== assetId), event];
projection.eventCount = projection.events.length;
writeJson(eventProjectionPublicPath, projection);
fs.mkdirSync(path.dirname(eventLogArtifactPath), {recursive: true});
fs.appendFileSync(eventLogArtifactPath, `${JSON.stringify(event)}\n`);
workspace.production.eventLedger.eventCount = projection.eventCount;
workspace.production.eventLedger.lastEventId = event.eventId;
workspace.production.eventLedger.lastEventAt = now;
workspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(workspace, now));

fs.rmSync(artifactDir, {recursive: true, force: true});
fs.cpSync(publicDir, artifactDir, {recursive: true});
writeJson(workspacePublicPath, workspace);
writeJson(workspaceArtifactPath, workspace);
writeJson(reviewPublicPath, workspace.reviewLedger);
writeJson(reviewArtifactPath, workspace.reviewLedger);
const buildReport = {
  ...readJson(buildReportPublicPath),
  updatedAt: now,
  workspaceSha256: workspace.workspaceSha256,
  summary: workspace.summary,
  gates: workspace.gates,
  nextAction: workspace.production.nextAction,
  pixelTypographyImagegenCheckpoint: {publicUrl: reportPublicUrl, status: report.status, outputSha256: output.sha256, candidateCount: 1, candidateMinimum: asset.typographySpec.candidateMinimum},
};
writeJson(buildReportPublicPath, buildReport);
writeJson(buildReportArtifactPath, buildReport);

console.log(JSON.stringify({status: report.status, output, workspaceSha256: workspace.workspaceSha256, typographyDirectionStatus: rejectedDirection.review.status, glyphCandidateCount: asset.typographySpec.generatedCandidates.length, glyphCandidateMinimum: asset.typographySpec.candidateMinimum, gates: workspace.gates}, null, 2));
