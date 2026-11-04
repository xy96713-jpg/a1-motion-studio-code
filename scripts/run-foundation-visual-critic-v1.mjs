import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {runVisualMaturityCritic} from "../apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const stageId = process.argv.find((item) => item.startsWith("--stage="))?.split("=")[1];
const force = process.argv.includes("--force");
if (!["background-foundry", "element-atlas", "key-backgrounds"].includes(stageId)) throw new Error("foundation-critic-stage-invalid");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

function singleAssetRevisionPrompt(asset, repairBrief) {
  if (stageId === "element-atlas") {
    return `只重做 ${asset.name || asset.id} 这一张 4x3 可拆元素图集。12 个单元必须彼此隔离并保留透明裁切间距；这是一张有意的素材图集，不是多方向样张。\n${repairBrief}`;
  }
  if (stageId === "key-backgrounds") {
    return `只重做 ${asset.name || asset.id} 这一张完整 16:9 无字关键背景。只允许一个场景、一个相机视角、一个材料因果，不得在画面内部展示备选方向、网格或联系表。\n${repairBrief}`;
  }
  return `只重做 ${asset.name || asset.id} 这一张完整 16:9 无字底材。它只承担“${asset.purpose}”这一种材料机制；不得在画面内部生成多张方案、六宫格、样张板、联系表或重复缩略图。保留一个清晰主轮廓和一块可编辑中文字安全区。\n${repairBrief}`;
}

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const stage = workspace.stages.find((item) => item.id === stageId);
const assets = workspace.library.assets.filter((item) => item.stageId === stageId && ["editorial-artwork", "editorial-element"].includes(item.route) && item.assetUri && item.sha256);
if (!stage || assets.length < stage.minimumApproved) throw new Error(`foundation-critic-output-minimum-missing:${stageId}:${assets.length}/${stage?.minimumApproved || 0}`);
const images = assets.map((asset) => {
  const file = path.resolve(publicRoot, asset.assetUri.replace(/^\/+/, ""));
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`) || !fs.existsSync(file)) throw new Error(`foundation-critic-image-missing:${asset.id}`);
  return file;
});
const candidates = assets.map((asset) => ({candidateId: asset.id, direction: asset.purpose, expectedText: null, imagePublicUrl: asset.assetUri}));
const sourceAssetSha256 = sha256(assets.map((asset) => ({id: asset.id, sha256: asset.sha256, prompt: asset.promptBrief})));
const report = await runVisualMaturityCritic({
  scope: "asset-board",
  images,
  candidates,
  context: {articleTitle: workspace.article.title, articleThesis: workspace.article.thesis, visualThesis: workspace.article.visualThesis, stageId, stagePurpose: stage.purpose, minimumApproved: stage.minimumApproved, intentionalAtlas: stageId === "element-atlas", assetEvaluationRules: "这些是必须保持无字的可复用资产，不得要求把中文烘焙进图。typeRoles 维度改为评估是否为不同字体角色提供清晰且不重复的可编辑字位、安全区、压叠面和遮挡关系；motionPhrase 评估材料本身是否预留可揭、可撕、可压、可交接的动作结构。", rule: "Judge actual reusable production assets, not a final shot. Rank candidates by how specifically they support this article world without becoming a generic branded template."},
  cacheDir: path.join(artifactDir, "visual-critic-cache"),
  force,
});
const reportSha256 = sha256(report);
const selectedForAdmission = report.verdict === "PASS" && !report.hardFailures.length
  ? [...report.candidates].filter((item) => item.score >= 20).sort((left, right) => left.rank - right.rank).slice(0, stage.minimumApproved).map((item) => item.candidateId)
  : [];
const boardPass = report.totalScore >= 22 && selectedForAdmission.length >= stage.minimumApproved;

const tileWidth = 640;
const tileHeight = 360;
const columns = Math.min(3, images.length);
const rows = Math.ceil(images.length / columns);
const tiles = await Promise.all(images.map((image) => sharp(image).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer()));
const contactRelativePath = `generated/system-line/editorial-asset-workbench-v1/foundation-critic/${stageId}-${sourceAssetSha256.slice(0, 12)}.png`;
const contactPath = path.join(publicRoot, contactRelativePath);
fs.mkdirSync(path.dirname(contactPath), {recursive: true});
await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#090b0c"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png().toFile(contactPath);

const now = new Date().toISOString();
const reportName = `foundation-critic-${stageId}-latest.json`;
const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const ranked = new Map(report.candidates.map((item) => [item.candidateId, item]));
  for (const asset of next.library.assets.filter((item) => item.stageId === stageId && ranked.has(item.id))) {
    const item = ranked.get(asset.id);
    asset.visualCritic = {contract: report.contract, verdict: report.verdict, totalScore: item.score, maxScore: 24, hardFailures: report.hardFailures, selectedCandidateId: item.candidateId, reportPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reportName}`, reportSha256, reviewedAt: now};
    if (boardPass && selectedForAdmission.includes(asset.id)) {
      asset.status = "approved";
      asset.provenance.reviewed = true;
      asset.review = {status: "approved", note: `文章级资产板 ${report.totalScore}/24；候选 ${item.rank}，单项 ${item.score}/24，自动纳入资产包。`, reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
      asset.review.approvedContentSha256 = editorialAssetContentSha256(asset);
    } else if (!boardPass && item.rank <= stage.minimumApproved) {
      asset.status = "revise";
      asset.review = {status: "revise", note: `文章级资产板 ${report.totalScore}/24；${item.repairBrief || report.repairPlan.highestImpact}`, reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
      asset.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: Math.max(1, Number(asset.revisionHistory?.length || 0) + 1), sourceReportSha256: reportSha256, prompt: singleAssetRevisionPrompt(asset, item.repairBrief || report.repairPlan.highestImpact), createdAt: now};
    }
  }
  next.production.maturityLoop.foundationReports ||= {};
  next.production.maturityLoop.foundationReports[stageId] = {contract: "A1FoundationVisualCriticReport/v1", verdict: boardPass ? "PASS" : report.verdict, totalScore: report.totalScore, maxScore: 24, hardFailures: report.hardFailures, sourceAssetSha256, selectedAssetIds: selectedForAdmission, reportPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reportName}`, reportSha256, contactSheetPublicUrl: `/${contactRelativePath}`, reviewedAt: now};
  next.production.maturityLoop.rounds.push({contract: "A1VisualMaturityRound/v1", targetType: "foundation-stage", targetId: stageId, round: (next.production.maturityLoop.rounds.filter((item) => item.targetId === stageId).length || 0) + 1, verdict: boardPass ? "PASS" : report.verdict, score: report.totalScore, maxScore: 24, hardFailures: report.hardFailures, reportSha256, completedAt: now});
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.nextAction = boardPass ? `continue-after-foundation-pass:${stageId}` : `auto-revise-foundation:${stageId}`;
  const event = createProductionEvent({workspace: current, action: boardPass ? "foundation-visual-critic-passed" : "foundation-visual-critic-revision-required", targetId: stageId, payload: {reportSha256, sourceAssetSha256, totalScore: report.totalScore, selectedForAdmission, hardFailures: report.hardFailures}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {[reportName]: report}});
  return recalculated;
});

console.log(JSON.stringify({status: boardPass ? "PASS" : report.verdict, stageId, score: report.totalScore, selectedForAdmission, reportPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reportName}`, stageGate: updated.stages.find((item) => item.id === stageId)?.gate}, null, 2));
