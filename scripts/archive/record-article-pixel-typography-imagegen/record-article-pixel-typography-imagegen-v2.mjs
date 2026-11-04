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
const arg = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? path.resolve(process.argv[index + 1] || "") : null; };
const sourcePaths = [arg("--source01"), arg("--source02"), arg("--source03"), arg("--source04")];
if (sourcePaths.some((file) => !file || !fs.existsSync(file))) throw new Error("four-imagegen-sources-required");

const phaseId = "editorial-asset-workbench-v1";
const checkpointId = "article-pixel-typography-imagegen-v2";
const assetId = "glyph-board-polished-waste";
const expectedText = "完成度很高的废稿";
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(publicRoot, checkpointId);
const artifactDir = path.join(artifactRoot, checkpointId);
const checkpointUrl = `/generated/system-line/${phaseId}/${checkpointId}`;
const workspacePublicPath = path.join(publicRoot, "workspace.json");
const workspaceArtifactPath = path.join(artifactRoot, "workspace.json");
const reviewPublicPath = path.join(publicRoot, "review-ledger.json");
const reviewArtifactPath = path.join(artifactRoot, "review-ledger.json");
const buildReportPublicPath = path.join(publicRoot, "report.json");
const buildReportArtifactPath = path.join(artifactRoot, "report.json");
const eventProjectionPublicPath = path.join(publicRoot, "events.json");
const eventLogArtifactPath = path.join(artifactRoot, "events.jsonl");
const aestheticReferencePath = path.join(root, "../../../../写作项目/outputs/BV18RKb6SEp9_非人物画面_v2/contact-sheet-curated.jpg");
const pixelReferencePath = path.join(root, "apps/studio-next/public/generated/system-line/creator-material-pixel-type-v1/typography-specimen.png");
const now = new Date().toISOString();

const directionSpecs = [
  {
    id: "pixel-scale-collision-evidence-occlusion",
    label: "像素尺度碰撞＋证据遮挡",
    generationId: "exec-d3189e3c-ceb9-4a26-bfee-ad5220f95ebb",
    durationMs: 67800,
    prompt: `Create a new original 16:9 premium Chinese editorial motion-graphics styleframe for the exact text “完成度很高的废稿”. Make “废稿” a huge custom Chinese pixel-display glyph actor with modular bitmap strokes, hard crop interruptions and optical correction. Integrate “完成度很高的” into the glyph structure. Add one narrow photographed revision-evidence fragment. Charcoal, warm paper, semantic cobalt and restrained vermilion. No extra text, fake UI, HUD, cards, floating logo, connector line or generic poster template.`,
  },
  {
    id: "compressed-qualifier-expanded-waste",
    label: "完成度收窄／废稿扩张",
    generationId: "exec-e0201dcb-1b03-44e7-8e97-373946f2ccd0",
    durationMs: 184000,
    prompt: `Create a new original 16:9 premium Chinese editorial motion-graphics styleframe for the exact text “完成度很高的废稿”. Compress “完成度很高的” into a narrow vertical architectural strip; expand “废稿” into huge refined custom pixel glyphs with variable modules and meaningful cutout windows showing a dark crossed-out manuscript layer. Keep asymmetric stepped silhouette, substantial negative space, charcoal, warm paper, semantic cobalt and tiny vermilion. No other readable text, fake UI, HUD, cards, floating logo, connector line or color-swap repetition.`,
  },
  {
    id: "misregistered-print-plates",
    label: "印刷套色错位",
    generationId: "exec-cad14f11-4ed6-4f9f-9f0b-a28f2711c88a",
    durationMs: 184000,
    prompt: `Create a new original 16:9 premium Chinese editorial motion-graphics styleframe for the exact text “完成度很高的废稿”. Build giant bespoke pixel “废稿” from deliberately misregistered warm-ivory, cobalt and tiny vermilion print plates so the failure means “looks finished but is fundamentally wrong”. Lock the qualifier across a registration seam and combine it with one diagonally sliced photographed manuscript plane. Use one empty region and one dense collision region. No extra text, game UI, HUD, cards, floating logo, connector line or fake interface.`,
  },
  {
    id: "horizontal-paper-strip-conflict",
    label: "纸面横向裁切冲突",
    generationId: "exec-def191ed-4144-442d-8629-a1ff0437a115",
    durationMs: 156200,
    prompt: `Create a new original 16:9 premium Chinese editorial motion-graphics styleframe for the exact text “完成度很高的废稿”. Build three or four wide physical paper strips at different depths. Keep “完成度很高的” intact on one strip; make “废稿” large custom pixel actors crossing strip boundaries and becoming hidden and revealed. Use dark crossed-out manuscript texture, warm ivory, one meaningful cobalt band and a tiny vermilion misalignment mark. The silhouette must be stacked horizontal bands, not another full-frame giant glyph. No extra text, HUD, cards, logo, connector line or fake interface.`,
  },
];

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
const outputs = [];
for (let index = 0; index < sourcePaths.length; index += 1) {
  const source = sourcePaths[index];
  const filename = `ed10-polished-waste-direction-${String(index + 1).padStart(2, "0")}.png`;
  const destination = path.join(publicDir, filename);
  fs.copyFileSync(source, destination);
  const metadata = await sharp(destination).metadata();
  const output = {publicUrl: `${checkpointUrl}/${filename}`, sha256: shaFile(destination), width: Number(metadata.width || 0), height: Number(metadata.height || 0), bytes: fs.statSync(destination).size};
  if (output.width !== 1672 || output.height !== 941) throw new Error(`unexpected-imagegen-output-size:${output.width}x${output.height}`);
  outputs.push({...output, localPath: destination});
}

const tiles = await Promise.all(outputs.map((output) => sharp(output.localPath).resize(960, 540, {fit: "cover"}).png().toBuffer()));
const contactSheetPath = path.join(publicDir, "ed10-polished-waste-four-directions.png");
await sharp({create: {width: 1920, height: 1080, channels: 4, background: {r: 9, g: 10, b: 11, alpha: 1}}}).composite(tiles.map((input, index) => ({input, left: (index % 2) * 960, top: Math.floor(index / 2) * 540}))).png().toFile(contactSheetPath);
const contactSheet = {publicUrl: `${checkpointUrl}/ed10-polished-waste-four-directions.png`, sha256: shaFile(contactSheetPath), width: 1920, height: 1080, bytes: fs.statSync(contactSheetPath).size};

let workspace = assertEditorialAssetWorkbench(readJson(workspacePublicPath));
const beforeSha = workspace.workspaceSha256;
const assetPackSha256Before = workspace.library.assetPackSha256;
const asset = workspace.library.assets.find((item) => item.id === assetId);
if (!asset?.typographySpec) throw new Error("glyph-board-polished-waste-missing");
const candidates = directionSpecs.map((spec, index) => ({
  id: `${assetId}-direction-${String(index + 1).padStart(2, "0")}`,
  direction: spec.label,
  publicUrl: outputs[index].publicUrl,
  sha256: outputs[index].sha256,
  width: outputs[index].width,
  height: outputs[index].height,
  promptSha256: shaValue(spec.prompt),
  textVerification: {status: "verified", expectedText, observedText: expectedText, reviewedBy: "codex-visual-inspection"},
}));
asset.assetUri = contactSheet.publicUrl;
asset.sha256 = contactSheet.sha256;
asset.status = "ready-for-review";
asset.preview = {kind: "generated-image", publicUrl: contactSheet.publicUrl};
asset.selectedCandidateId = null;
asset.typographySpec.generatedCandidates = candidates;
asset.typographySpec.editableTextShadow = {text: expectedText, fontAssetId: "type-pixel-correction", required: true};
asset.typographySpec.textVerification = {status: "pending", expectedText, observedText: null, reviewedBy: null};
asset.provenance = {sourceType: "codex-built-in-imagegen-four-direction-set", sourceUri: `${checkpointUrl}/report.json`, license: "project-generated non-evidentiary typography design master; editable text shadow required", reviewed: false};
asset.review = {status: "pending", note: "四个字形方向已生成并完成操作员逐字核对；必须先选择一个方向，再由用户逐字确认并明确批准。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};

const jobs = directionSpecs.slice(1).map((spec, index) => ({
  contract: "A1AssetGenerationJob/v2",
  id: `operator-glyph-polished-waste-direction-${String(index + 2).padStart(2, "0")}`,
  projectId: workspace.production.project.projectId,
  sourceHash: workspace.article.sourceTextSha256,
  assetPackSha256: assetPackSha256Before,
  assetId,
  slotId: `${assetId}-direction-${String(index + 2).padStart(2, "0")}`,
  visualMasterBinding: {id: "july1-retro-print-archive-wireframe-v1", referenceSha256: shaFile(aestheticReferencePath)},
  route: "operator-led-built-in-image-generation",
  provider: "codex-built-in-imagegen",
  providerMode: "subscription-zero-extra-cost",
  model: "built-in-model-not-exposed",
  generationId: spec.generationId,
  status: "complete",
  prompt: spec.prompt,
  promptSha256: shaValue(spec.prompt),
  cacheKey: shaValue({source: workspace.article.sourceTextSha256, assetId, direction: spec.id, prompt: spec.prompt, visualMaster: shaFile(aestheticReferencePath)}),
  attempts: 1,
  cacheHit: false,
  error: null,
  createdAt: now,
  startedAt: now,
  completedAt: now,
  durationMs: spec.durationMs,
  output: {...outputs[index + 1], localPath: undefined},
}));
workspace.production.generation.jobs = [...workspace.production.generation.jobs.filter((job) => !jobs.some((item) => item.id === job.id)), ...jobs];
workspace.production.generation.summary = {queued: workspace.production.generation.jobs.filter((job) => job.status === "queued").length, running: workspace.production.generation.jobs.filter((job) => job.status === "running").length, complete: workspace.production.generation.jobs.filter((job) => job.status === "complete").length, failed: workspace.production.generation.jobs.filter((job) => job.status === "failed").length};
workspace.production.generation.updatedAt = now;

const report = {
  contract: "A1ArticlePixelTypographyImagegenCheckpoint/v2",
  checkpointId,
  status: "FOUR_DIRECTIONS_READY_FOR_USER_SELECTION",
  generatedAt: now,
  article: {title: workspace.article.title, sourceTextSha256: workspace.article.sourceTextSha256},
  target: {assetId, shotId: "ED-10", exactText: expectedText, candidateCount: candidates.length, candidateMinimum: asset.typographySpec.candidateMinimum},
  candidates,
  contactSheet,
  references: [{role: "reference-only-editorial-grammar", path: aestheticReferencePath, sha256: shaFile(aestheticReferencePath), directCopyAllowed: false}, {role: "pixel-type-personality", path: pixelReferencePath, sha256: shaFile(pixelReferencePath), directCopyAllowed: false}],
  execution: {concurrency: 2, provider: "codex-built-in-imagegen", jobCount: 4, cacheHits: 0, jobs: directionSpecs.map((spec, index) => ({id: candidates[index].id, generationId: spec.generationId, prompt: spec.prompt, promptSha256: candidates[index].promptSha256, durationMs: spec.durationMs, outputSha256: candidates[index].sha256}))},
  validation: {exactChineseTextOperatorVerifiedForAll: true, pixelTypographyIsPrimaryActorForAll: true, materiallyDifferentTopologies: true, fakeUiOrHudPresent: false, editableTextShadowBound: true, candidateMinimumMet: true, selectedCandidateId: null},
  gates: {userCandidateSelection: "PENDING", userExactTextConfirmation: "PENDING", userVisualApproval: "PENDING", typographyBoardApprovalAllowed: false, shotCompositionAllowed: false, motionAllowed: false, renderAllowed: false},
  nextAction: "user-select-one-ed10-pixel-typography-direction-on-4311",
};
writeJson(path.join(publicDir, "report.json"), report);

const projection = fs.existsSync(eventProjectionPublicPath) ? readJson(eventProjectionPublicPath) : {contract: "A1ProductionEventProjection/v1", events: []};
const eventPayload = {checkpointId, assetId, candidateIds: candidates.map((item) => item.id), contactSheetSha256: contactSheet.sha256};
const eventBase = {contract: "A1ProductionEvent/v1", eventId: crypto.randomUUID(), projectId: workspace.production.project.projectId, action: "record-imagegen-pixel-typography-candidate-set", targetId: assetId, actor: "codex-local-operator", workspaceSha256Before: beforeSha, payloadSha256: shaValue(eventPayload), createdAt: now};
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
const buildReport = {...readJson(buildReportPublicPath), updatedAt: now, workspaceSha256: workspace.workspaceSha256, summary: workspace.summary, gates: workspace.gates, nextAction: workspace.production.nextAction, pixelTypographyImagegenCheckpoint: {publicUrl: `${checkpointUrl}/report.json`, status: report.status, contactSheetSha256: contactSheet.sha256, candidateCount: candidates.length, candidateMinimum: asset.typographySpec.candidateMinimum}};
writeJson(buildReportPublicPath, buildReport);
writeJson(buildReportArtifactPath, buildReport);

console.log(JSON.stringify({status: report.status, contactSheet, workspaceSha256: workspace.workspaceSha256, candidateCount: candidates.length, selectedCandidateId: asset.selectedCandidateId, gates: workspace.gates}, null, 2));
