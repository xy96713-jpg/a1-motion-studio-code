#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {auditWholeFilmMediumRhythm} from "../apps/studio-next/src/lib/a1-whole-film-ai-director-v1.ts";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const runPath = path.join(appRoot, "public/generated/system-line/current-project-visual-contract-upgrade-v1/current-article-run.json");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const phasePublic = path.join(appRoot, "public", phaseRelative);
const {artifactDir} = projectDirs(appRoot);
const now = new Date().toISOString();
const sourceWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const presenterMediaBound = sourceWorkspace.production.assembly.presenterMediaBound === true;
const requestedShotId = process.argv.find((item) => item.startsWith("--shot="))?.split("=")[1] || null;
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, jsonText(value), "utf8");
  fs.renameSync(temporary, file);
};

function screenEvidenceAssetId(sourceText = "") {
  if (/历史主题|近五次|不会混|按文章分开/iu.test(sourceText)) return "source-documentary-history-isolation-action";
  if (/拦下|提醒.*修改|提醒.*补充/iu.test(sourceText)) return "source-documentary-preference-intercept-action";
  if (/生成类似|喜欢库.*生成|类似的句式|类似的类比/iu.test(sourceText)) return "source-documentary-preference-generation-action";
  if (/补充段落|补段|空一行|两段之间|上下文给出|放回正文/iu.test(sourceText)) return "source-documentary-paragraph-action";
  if (/演示模式|字号|速度|口播稿/iu.test(sourceText)) return "source-documentary-presentation-action";
  if (/喜欢|讨厌|风格库/iu.test(sourceText)) return "source-documentary-preference-action";
  return null;
}

function recommendation(shot) {
  if (shot.editMode !== "screen-demo") return null;
  const text = `${shot.sourceText || ""} ${shot.visualJob || ""}`;
  if (/历史主题|近五次修改|不会混到一起/iu.test(text)) return {editMode: "full-package", reason: "版本隔离是机制判断；用真实版本证据做编辑式纵深，不连续播放完整产品流程。"};
  if (/形成你自己的写作风格库|写完之后还能|下次再出现类似|其实.*同一个逻辑|如果觉得文章写完了/iu.test(text)) return {editMode: "presenter-overlay", reason: "这句在解释功能意义或承接逻辑，人物应继续在场，真实界面只承担对象证据。"};
  return null;
}

function choosePresenterTopology(shots, index) {
  const neighbors = new Set([shots[index - 1]?.topology, shots[index + 1]?.topology].filter(Boolean));
  return ["presenter-object-depth", "presenter-negative-space"].find((topology) => !neighbors.has(topology)) || "presenter-object-depth";
}

function headlineFor(sourceText = "", shotId = "") {
  if (shotId === "ED-30" && /演示模式|口播稿/iu.test(sourceText)) return "口播稿";
  if (/演示模式|字号|速度/iu.test(sourceText)) return "字号 × 速度";
  if (/风格库|标喜欢|点(?:击)?喜欢|讨厌库/iu.test(sourceText)) return "喜欢 / 讨厌\n写成风格库";
  if (/拦下|提醒/iu.test(sourceText)) return "系统会先拦下";
  if (/补充段落|两段之间|空一行/iu.test(sourceText)) return "两段之间\n补一层";
  if (/历史主题|近五次/iu.test(sourceText)) return "每篇文章\n各自五次";
  return (sourceText.match(/[\p{Script=Han}A-Za-z0-9＋×/ ·]{4,14}/u)?.[0] || "关键动作").trim();
}

function applyRevisionToShot(shot, recommendationValue, shots, index) {
  const supportingMaterialId = screenEvidenceAssetId(shot.sourceText);
  const next = {...shot};
  next.editMode = recommendationValue.editMode;
  next.mediumDecisionReason = recommendationValue.reason;
  next.supportingMaterialIds = supportingMaterialId ? [supportingMaterialId] : [];
  next.typographyRole = "presenter-bound-editorial-phrase";
  next.keyPhrases = shot.shotId === "ED-30"
    ? [headlineFor(next.sourceText, shot.shotId), "演示模式", "字号与速度"]
    : Array.isArray(next.keyPhrases) && next.keyPhrases.length ? next.keyPhrases : [headlineFor(next.sourceText, shot.shotId)];
  next.requiredMaterialIds = [...new Set([...(next.requiredMaterialIds || []), ...(supportingMaterialId ? [supportingMaterialId] : [])])];
  if (recommendationValue.editMode === "full-package") {
    next.materialRoute = "approved-asset-pack";
    next.topology = "editorial-evidence-field";
    next.primaryMaterialId = supportingMaterialId;
    next.primaryActor = "真实版本证据与按文章归属的五次修改";
    next.presenterDirection = null;
    next.overlayBrief = null;
    next.presenterPackage = {intensity: "not-applicable", keyPhrases: [], spatialAnchor: "not-applicable", faceSafeZone: "not-applicable", occlusionRule: "不适用；真实版本界面被裁切成一条连续证据纵深，不重绘产品 UI。"};
    next.packageBrief = "以真实历史版本界面为底，让文章身份、五次版本与切回原文章形成三段空间纵深；不做白卡、HUD 或版本时间线重绘。";
    next.visualJob = "用真实版本界面做一段编辑式机制证明：每篇文章各自保留五次修改。";
    next.motionPhrase = "数字 5 先以尺度碰撞锁定，单位“次”晚入；真实主题名与五次版本从同一界面纵深依次展开；切回原文章时，文章身份与版本栈原位合拢。";
    next.structureDirections = ["真实版本列表占据纵向主轴，文章标题作为身份锚点。", "把五次版本做成由近到远的真实界面裁切纵深，禁止重绘。", "以原文章标题和第五个版本形成头尾对照，中间保留可读真实证据。"];
    next.layoutConstraints = [...new Set([...(next.layoutConstraints || []), "真实文章标题与“最近 5 次”必须在最终静帧中可读。", "真实界面必须占据主视觉，不得缩成白色卡片或 HUD。"] )];
  } else {
    next.materialRoute = "presenter-real-footage-plus-approved-assets";
    next.primaryMaterialId = "source-presenter-continuous-video";
    next.topology = choosePresenterTopology(shots, index);
    next.primaryActor = "本人讲述与对象绑定的真实界面证据";
    next.presenterDirection = "保持本人完整说完这句；在手势或停顿处让关键短语与真实界面局部进入肩后或桌面纵深。";
    next.overlayBrief = `只包装“${headlineFor(next.sourceText, shot.shotId).replace(/\n/g, " / ")}”；真实界面作为被谈论对象，不做悬浮 HUD。`;
    next.presenterPackage = {intensity: "editorial", keyPhrases: next.keyPhrases.slice(0, 3), spatialAnchor: "mixed-depth", faceSafeZone: "LOCK_EYES_AND_MOUTH", occlusionRule: "文字和真实界面只进入脸部两侧负空间或肩后纵深；不得覆盖眼睛、嘴、鼻部和主要手势。"};
    next.packageBrief = null;
    next.visualJob = "让本人继续讲述，用一个可读关键短语和一块真实界面证据完成对象绑定。";
    next.motionPhrase = "本人先建立句意；关键短语按语义分两拍锁定；真实界面证据从同一对象方向进入并在句尾退回，不画连接线。";
    next.structureDirections = ["人物居中偏一侧，关键短语占另一侧负空间，真实界面裁切进入肩后纵深。", "人物保持最高层级，真实界面沿桌面方向进入，关键短语只在停顿处锁定。", "先只见人物，随后真实界面成为侧后方对象，句尾由关键词接管转场。"];
    next.layoutConstraints = [...new Set([...(next.layoutConstraints || []), "人物眼睛、嘴与主要表情全程不可遮挡。", "真实界面必须绑定台词对象，不得变成浮动卡片、HUD 或无对象说明框。"] )];
    next.missingMaterialIds = presenterMediaBound
      ? (next.missingMaterialIds || []).filter((id) => id !== "presenter-footage")
      : [...new Set([...(next.missingMaterialIds || []), "presenter-footage"] )];
    next.materialGate = next.missingMaterialIds.length ? "BLOCKED_MEDIA_MISSING" : "READY_FOR_DESIGN_AFTER_PLAN_APPROVAL";
  }
  return next;
}

function mediumSummary(shots) {
  const total = shots.reduce((sum, shot) => sum + Number(shot.editWindow?.durationMs || 0), 0);
  return Object.fromEntries(["presenter-clean", "presenter-overlay", "screen-demo", "full-package", "type-only"].map((mode) => {
    const selected = shots.filter((shot) => shot.editMode === mode);
    const durationMs = selected.reduce((sum, shot) => sum + Number(shot.editWindow?.durationMs || 0), 0);
    return [mode, {shotCount: selected.length, durationMs, durationRatio: total ? Number((durationMs / total).toFixed(4)) : 0}];
  }));
}

if (!fs.existsSync(runPath)) throw new Error("whole-film-current-run-missing");
const originalRun = readJson(runPath);
if (originalRun.contract !== "A1WholeFilmAiDirectorRun/v1" || originalRun.status !== "completed" || originalRun.plan?.shots?.length !== 34) throw new Error("whole-film-current-run-invalid");
const beforeAudit = auditWholeFilmMediumRhythm(originalRun.plan.shots);
const revisedRun = structuredClone(originalRun);
const existingRevision = originalRun.plan.mediumRhythmRevision || null;
const existingRevisedShotIds = existingRevision?.revisedShotIds || [];
const affectedShotIds = [];
revisedRun.plan.shots = revisedRun.plan.shots.map((shot, index, shots) => {
  if (requestedShotId && shot.shotId !== requestedShotId) return shot;
  const proposed = recommendation(shot) || (existingRevisedShotIds.includes(shot.shotId)
    ? {editMode: shot.editMode, reason: shot.mediumDecisionReason || "刷新已应用的媒介节奏修订。"}
    : null);
  if (!proposed) return shot;
  affectedShotIds.push(shot.shotId);
  return applyRevisionToShot(shot, proposed, shots, index);
});
if (requestedShotId && !affectedShotIds.includes(requestedShotId)) throw new Error(`medium-rhythm-revision-shot-not-found:${requestedShotId}`);
const revisedShotIds = [...new Set([...existingRevisedShotIds, ...affectedShotIds])];
const afterAudit = auditWholeFilmMediumRhythm(revisedRun.plan.shots);
if (!afterAudit.pass) throw new Error(`medium-rhythm-revision-insufficient:${afterAudit.hardFailures.join(",")}`);
revisedRun.plan.mediumSummary = mediumSummary(revisedRun.plan.shots);
revisedRun.plan.mediumRhythmRevision = {contract: "A1WholeFilmMediumRhythmRevision/v1", status: "APPLIED_REVIEW_GATED", revisedShotIds, beforeAudit: existingRevision?.beforeAudit || beforeAudit, afterAudit, rule: "retain screen-demo only for direct observable operations; move explanatory claims to presenter packaging; move version isolation to source-bound full package", appliedAt: now};
revisedRun.plan.authorship.truthNote = `${revisedRun.plan.authorship.truthNote || ""} Medium rhythm was deterministically red-teamed and revised after pixel review; this is not a new AI director pass.`.trim();
revisedRun.plan.nextAction = presenterMediaBound
  ? "rebuild-and-criticize-medium-rhythm-revised-shots"
  : "rebuild-and-criticize-medium-rhythm-revised-shots-then-bind-real-presenter-video";

const revisionReport = {
  contract: "A1WholeFilmMediumRhythmRevision/v1",
  status: "APPLIED_REVIEW_GATED",
  revisedShotIds,
  affectedShotIds,
  beforeAudit: existingRevision?.beforeAudit || beforeAudit,
  currentInputAudit: beforeAudit,
  afterAudit,
  beforeModeSummary: originalRun.plan.mediumSummary,
  afterModeSummary: revisedRun.plan.mediumSummary,
  presenterMotionBlocker: presenterMediaBound ? null : "presenter-human-led-motion-source-missing",
  runSourceSha256Before: sha256(jsonText(originalRun)),
  runSourceSha256After: sha256(jsonText(revisedRun)),
  createdAt: now,
};

const update = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const revisedById = new Map(revisedRun.plan.shots.map((shot) => [shot.shotId, shot]));
  for (const shotId of affectedShotIds) {
    const shotAsset = next.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === shotId);
    if (!shotAsset) throw new Error(`shot-composition-missing:${shotId}`);
    const revisedDemand = revisedById.get(shotId);
    const typographyAssignment = structuredClone(shotAsset.shotDemand.typographyAssignment || {});
    typographyAssignment.headlineText = headlineFor(revisedDemand.sourceText, shotId);
    typographyAssignment.treatmentMode = revisedDemand.editMode === "full-package" ? "source-bound-mechanism-package" : "presenter-editorial-overlay";
    typographyAssignment.primaryFontAssetIds = ["type-pixel-correction", "type-editorial-heavy"];
    typographyAssignment.maxFontRoles = 2;
    typographyAssignment.bodyTextPolicy = "keep-real-interface-text";
    if ((shotAsset.candidates || []).length || shotAsset.selectedCandidateId || shotAsset.candidateRender) {
      shotAsset.revisionHistory ||= [];
      shotAsset.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(shotAsset.visualRevision?.round || 1), reason: "whole-film-medium-rhythm-revision", candidates: shotAsset.candidates || [], selectedCandidateId: shotAsset.selectedCandidateId || null, candidateRender: shotAsset.candidateRender || null, visualCritic: shotAsset.visualCritic || null, archivedAt: now});
    }
    shotAsset.shotDemand = {...shotAsset.shotDemand, ...revisedDemand, contract: "A1ShotDesignDemand/v1", typographyAssignment, candidateCount: 0, candidateGenerationAllowed: true};
    shotAsset.candidates = [];
    shotAsset.selectedCandidateId = null;
    delete shotAsset.candidateRender;
    delete shotAsset.visualCritic;
    shotAsset.status = "brief-ready";
    shotAsset.review = {status: "pending", note: "全片媒介节奏已修订，旧构图不再匹配本人/录屏/包装关系。", reviewedAt: now, reviewedBy: "system-medium-rhythm-red-team", approvedContentSha256: null};
    shotAsset.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: 1, sourceReportSha256: revisionReport.runSourceSha256After, prompt: revisedDemand.mediumDecisionReason, createdAt: now};
    const graphDemand = next.assetRequirementGraph.shotDemands.find((item) => item.shotId === shotId);
    if (graphDemand) {
      Object.assign(graphDemand, {editMode: revisedDemand.editMode, requiredMaterialIds: revisedDemand.requiredMaterialIds, materialGate: revisedDemand.materialGate, candidateAssetIds: [...new Set([...(graphDemand.candidateAssetIds || []), ...(revisedDemand.supportingMaterialIds || [])])]});
    }
  }
  next.production.maturityLoop.shotReports = Object.fromEntries(Object.entries(next.production.maturityLoop.shotReports || {}).filter(([shotId]) => !affectedShotIds.includes(shotId)));
  next.production.maturityLoop.rounds = (next.production.maturityLoop.rounds || []).filter((round) => {
    if (round.targetType === "representative-motion") return false;
    return !(String(round.targetType || "").startsWith("shot-frame") && affectedShotIds.includes(round.targetId));
  });
  // A whole-film visual repair invalidates every downstream proof, not only
  // the affected shot candidates. Keep old reports as history on disk, but
  // remove their live authority pointers so they cannot be mistaken for the
  // current Accepted Shot IR or Motion IR.
  delete next.production.maturityLoop.representativeMotionReport;
  delete next.production.maturityLoop.allShotSelectedReview;
  next.production.maturityLoop.provisionalVisualAdmissions = (next.production.maturityLoop.provisionalVisualAdmissions || []).filter((shotId) => !affectedShotIds.includes(shotId));
  next.production.maturityLoop.status = "paused-for-medium-rhythm-shot-rebuild";
  next.production.maturityLoop.nextAction = presenterMediaBound
    ? `rebuild-critic-${affectedShotIds.join("-")}`
    : `rebuild-critic-${affectedShotIds.join("-")}-then-bind-presenter-video`;
  next.production.maturityLoop.mediumRhythmRevision = {reportPublicUrl: `/${phaseRelative}/medium-rhythm-revision-v1/report.json`, ...revisionReport};
  next.production.acceptedShotIr = {contract: "A1AcceptedShotIRSet/v2", status: "locked-upstream-revision", sourceWorkspaceSha256: null, shotCount: 0, sha256: null, publicUrl: null, compiledAt: null};
  next.production.motion = {contract: "A1RepresentativeMotionGate/v1", status: "locked-upstream-revision", representativePlan: null, previewArtifact: null, review: {status: "pending", score: null, maxScore: 24, hardFailures: [], reviewedAt: null}, fullMotionAllowed: false};
  const runText = jsonText(revisedRun);
  next.directorInput.sha256 = sha256(runText);
  const event = createProductionEvent({workspace: current, action: "whole-film-medium-rhythm-revision-applied", payload: {revisedShotIds, affectedShotIds, beforeAudit, afterAudit, reportPublicUrl: `/${phaseRelative}/medium-rhythm-revision-v1/report.json`}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {"whole-film-director-input.json": revisedRun}});
  return recalculated;
});

const publicRevisionDir = path.join(phasePublic, "medium-rhythm-revision-v1");
const artifactRevisionDir = path.join(artifactDir, "medium-rhythm-revision-v1");
const originalBackupPath = path.join(artifactRevisionDir, "current-article-run.before.json");
if (!fs.existsSync(originalBackupPath)) writeAtomic(originalBackupPath, originalRun);
writeAtomic(path.join(publicRevisionDir, "report.json"), revisionReport);
writeAtomic(path.join(artifactRevisionDir, "report.json"), revisionReport);
writeAtomic(runPath, revisedRun);

console.log(JSON.stringify({status: revisionReport.status, revisedShotIds, affectedShotIds, beforeAudit: revisionReport.beforeAudit, currentInputAudit: beforeAudit, afterAudit, modeSummary: revisedRun.plan.mediumSummary, workspaceNextAction: update.production.maturityLoop.nextAction, reportPublicUrl: `/${phaseRelative}/medium-rhythm-revision-v1/report.json`}, null, 2));
