import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  assertEditorialAssetWorkbench,
  editorialAssetContentSha256,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {runVisualMaturityCritic} from "../apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const assetId = arg("--asset");
const force = process.argv.includes("--force");
if (!assetId) throw new Error("usage: node scripts/run-visual-maturity-critic-v1.mjs --asset <asset-id> [--force]");

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const asset = workspace.library.assets.find((item) => item.id === assetId);
if (!asset?.typographySpec || asset.route !== "generated-glyph") throw new Error(`visual-critic-generated-glyph-not-found:${assetId}`);
const candidates = asset.typographySpec.generatedCandidates || [];
if (candidates.length < asset.typographySpec.candidateMinimum) throw new Error(`visual-critic-candidates-incomplete:${candidates.length}/${asset.typographySpec.candidateMinimum}`);
const images = candidates.map((candidate) => {
  const relative = String(candidate.publicUrl || "").replace(/^\/+/, "");
  const resolved = path.resolve(publicRoot, relative);
  if (!resolved.startsWith(`${path.resolve(publicRoot)}${path.sep}`) || !fs.existsSync(resolved)) throw new Error(`visual-critic-candidate-image-missing:${candidate.id}`);
  return resolved;
});

const criticCandidates = candidates.map((candidate) => ({
  candidateId: candidate.id,
  direction: candidate.direction,
  expectedText: asset.typographySpec.exactText,
  imagePublicUrl: candidate.publicUrl,
}));
const report = await runVisualMaturityCritic({
  scope: "asset-board",
  images,
  candidates: criticCandidates,
  context: {
    articleTitle: workspace.article.title,
    articleThesis: workspace.article.thesis,
    visualThesis: workspace.article.visualThesis,
    assetId,
    assetName: asset.name,
    purpose: asset.purpose,
    semanticRole: asset.semanticRole,
    expectedText: asset.typographySpec.exactText,
    usedByShotIds: asset.usedByShotIds,
    editableTextShadowRequired: true,
    generatedGlyphMayReplaceEvidenceText: false,
  },
  cacheDir: path.join(artifactDir, "visual-critic-cache"),
  force,
});

const reportSha256 = sha256(report);
const reportName = `visual-critic-${assetId}-${reportSha256.slice(0, 12)}.json`;
const latestName = `visual-critic-${assetId}-latest.json`;
const now = new Date().toISOString();

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const target = next.library.assets.find((item) => item.id === assetId);
  if (!target?.typographySpec) throw new Error(`visual-critic-target-disappeared:${assetId}`);
  for (const candidate of target.typographySpec.generatedCandidates || []) {
    const verdict = report.candidates.find((item) => item.candidateId === candidate.id);
    if (!verdict) continue;
    const verified = verdict.exactTextStatus === "verified" && verdict.observedText === target.typographySpec.exactText;
    candidate.textVerification = {
      status: verified ? "verified" : verdict.exactTextStatus === "rejected" ? "rejected" : "pending",
      expectedText: target.typographySpec.exactText,
      observedText: verdict.observedText,
      reviewedBy: `visual-maturity-critic:${report.trace.taskId}`,
    };
    candidate.visualCritic = {
      score: verdict.score,
      rank: verdict.rank,
      exactTextStatus: verdict.exactTextStatus,
      visualEvidence: verdict.visualEvidence,
      repairBrief: verdict.repairBrief,
      reportSha256,
    };
  }
  const selected = target.typographySpec.generatedCandidates.find((item) => item.id === report.selectedCandidateId);
  const canAdmit = report.verdict === "PASS"
    && report.totalScore >= 22
    && report.hardFailures.length === 0
    && selected?.textVerification?.status === "verified"
    && selected.textVerification.observedText === target.typographySpec.exactText;
  target.visualCritic = {
    contract: report.contract,
    verdict: report.verdict,
    totalScore: report.totalScore,
    maxScore: 24,
    hardFailures: report.hardFailures,
    selectedCandidateId: report.selectedCandidateId,
    reportPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${latestName}`,
    reportSha256,
    reviewedAt: now,
  };
  if (canAdmit) {
    target.selectedCandidateId = selected.id;
    target.typographySpec.textVerification = {
      status: "verified",
      expectedText: target.typographySpec.exactText,
      observedText: target.typographySpec.exactText,
      reviewedBy: `visual-maturity-critic:${report.trace.taskId}`,
    };
    target.status = "approved";
    target.provenance.reviewed = true;
    target.review = {
      status: "approved",
      note: `自动视觉红队 ${report.totalScore}/24 且无硬失败；采用 ${selected.id}。`,
      reviewedAt: now,
      reviewedBy: "system",
      approvedContentSha256: null,
    };
    target.review.approvedContentSha256 = editorialAssetContentSha256(target);
  } else {
    target.status = "revise";
    target.review = {
      status: "revise",
      note: `自动视觉红队 ${report.totalScore}/24，${report.verdict}。最高影响修复：${report.repairPlan.highestImpact}`,
      reviewedAt: now,
      reviewedBy: "system",
      approvedContentSha256: null,
    };
    target.visualRevision = {
      contract: "A1VisualRevisionBrief/v1",
      round: Math.max(1, Number(target.revisionHistory?.length || 0) + 1),
      sourceReportSha256: reportSha256,
      prompt: report.repairPlan.nextPrompt,
      createdAt: now,
    };
  }
  if (next.production.maturityLoop?.contract === "A1VisualMaturityLoop/v1") {
    next.production.maturityLoop.rounds.push({
      contract: "A1VisualMaturityRound/v1",
      targetType: "asset",
      targetId: assetId,
      round: Number(target.visualRevision?.round || 1),
      verdict: report.verdict,
      score: report.totalScore,
      maxScore: 24,
      hardFailures: report.hardFailures,
      selectedCandidateId: report.selectedCandidateId,
      reportSha256,
      completedAt: now,
    });
    next.production.maturityLoop.rounds = next.production.maturityLoop.rounds.slice(-200);
    next.production.maturityLoop.status = "running";
    next.production.maturityLoop.nextAction = canAdmit ? `continue-after-pass:${assetId}` : `auto-revise:${assetId}`;
    if (canAdmit) next.production.maturityLoop.counters.passed += 1;
    else next.production.maturityLoop.counters.revise += 1;
    next.production.maturityLoop.updatedAt = now;
  }
  const event = createProductionEvent({
    workspace: current,
    action: canAdmit ? "visual-critic-auto-admitted" : "visual-critic-revision-required",
    targetId: assetId,
    payload: {reportSha256, score: report.totalScore, verdict: report.verdict, selectedCandidateId: report.selectedCandidateId, hardFailures: report.hardFailures},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {[reportName]: report, [latestName]: report}});
  return recalculated;
});

console.log(JSON.stringify({
  status: report.verdict,
  assetId,
  score: report.totalScore,
  maxScore: 24,
  selectedCandidateId: report.selectedCandidateId,
  hardFailures: report.hardFailures,
  reportPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${latestName}`,
  workspaceSha256: updated.workspaceSha256,
}, null, 2));
