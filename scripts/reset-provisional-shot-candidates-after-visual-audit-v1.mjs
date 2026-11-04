#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const rejectedRelative = `${phaseRelative}/shot-candidates-rejected-visual-audit-v1`;
const rejectedRoot = path.join(publicRoot, rejectedRelative);
const resetOrders = new Set(Array.from({length: 13}, (_, index) => index + 2));
const now = new Date().toISOString();
const auditBrief = "视觉抽查拒绝旧通用候选：禁止不可读黑字、atlas/HUD 直贴、六个近似副本、Logo 印章加截图面板。按 editMode 专用原语重建；主视觉必须全幅或绑定真实对象，标题逐字等于 typographyAssignment.headlineText，非本人干净镜头至少产生 3 种肉眼可见轮廓。";

function archiveRenderedCandidates(shotId) {
  const source = path.join(publicRoot, phaseRelative, "shot-candidates", shotId);
  const destination = path.join(rejectedRoot, shotId);
  if (!fs.existsSync(source) || fs.existsSync(destination)) return false;
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.cpSync(source, destination, {recursive: true, errorOnExist: true});
  return true;
}

const archived = [];
for (const order of [...resetOrders]) {
  const shotId = `ED-${String(order).padStart(2, "0")}`;
  if (archiveRenderedCandidates(shotId)) archived.push(shotId);
}

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const resetShotIds = [];

  for (const shot of next.library.assets.filter((asset) => asset.route === "shot-composition")) {
    if (!resetOrders.has(Number(shot.shotDemand?.order || 0))) continue;
    const shotId = shot.shotDemand.shotId;
    resetShotIds.push(shotId);
    shot.revisionHistory ||= [];
    if (shot.candidates?.length || shot.candidateRender || shot.visualCritic) {
      shot.revisionHistory.push({
        contract: "A1RejectedShotCandidateRound/v1",
        round: Number(shot.visualRevision?.round || 1),
        reason: "rejected-by-direct-cross-shot-visual-audit",
        candidates: shot.candidates || [],
        candidateRender: shot.candidateRender || null,
        visualCritic: shot.visualCritic || null,
        archivedPublicUrl: archived.includes(shotId) ? `/${rejectedRelative}/${shotId}/contact-sheet.png` : null,
        archivedAt: now,
      });
    }
    shot.candidates = [];
    shot.selectedCandidateId = null;
    delete shot.candidateRender;
    delete shot.visualCritic;
    shot.status = "brief-ready";
    shot.review = {
      status: "pending",
      note: "旧候选已被跨镜视觉抽查拒绝，等待按镜头类型重新构图。",
      reviewedAt: now,
      reviewedBy: "system-visual-audit",
      approvedContentSha256: null,
    };
    shot.visualRevision = {
      contract: "A1VisualRevisionBrief/v1",
      round: 1,
      sourceReportSha256: null,
      prompt: auditBrief,
      createdAt: now,
    };
  }

  next.production.maturityLoop.shotReports ||= {};
  for (const shotId of resetShotIds) delete next.production.maturityLoop.shotReports[shotId];
  next.production.maturityLoop.provisionalVisualAdmissions = (next.production.maturityLoop.provisionalVisualAdmissions || []).filter((id) => !resetShotIds.includes(id));
  next.production.maturityLoop.rounds = (next.production.maturityLoop.rounds || []).map((round) => resetShotIds.includes(round.targetId)
    ? {...round, supersededByVisualAudit: true, supersededAt: now}
    : round);
  next.production.maturityLoop.status = "paused-for-representative-shot-rebuild";
  next.production.maturityLoop.currentStage = "shot-candidates";
  next.production.maturityLoop.nextAction = "rebuild-and-inspect-ED-02-ED-07-ED-10-ED-12-ED-14";
  next.production.maturityLoop.lastTickAt = now;
  next.production.maturityLoop.updatedAt = now;

  const event = createProductionEvent({
    workspace: current,
    action: "provisional-shot-admissions-revoked-after-visual-audit",
    payload: {resetShotIds, archivedShotIds: archived, retainedShotIds: ["ED-01"], auditBrief},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return {workspace: recalculated, resetShotIds};
});

console.log(JSON.stringify({
  status: "PROVISIONAL_SHOT_ADMISSIONS_REVOKED",
  resetShotIds: updated.resetShotIds,
  archivedShotIds: archived,
  retainedShotIds: ["ED-01"],
  nextAction: updated.workspace.production.maturityLoop.nextAction,
  workspaceSha256: updated.workspace.workspaceSha256,
}, null, 2));
