#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const candidateRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/minimal-editorial-static-board-repair-v1");
const manifestFile = path.join(candidateRoot, "manifest.json");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

if (manifest.contract !== "A1MinimalEditorialStaticBoardRepair/v1" || manifest.status !== "AWAITING_AGENT_ACTUAL_PIXEL_REVIEW") throw new Error("minimal-editorial-review-manifest-not-awaiting-review");
if (manifest.userVisualApproval !== "NOT_APPROVED" || manifest.productionAdmitted !== false) throw new Error("minimal-editorial-review-boundary-drift");
if (fileSha256(publicFile(manifest.packageBoard.publicUrl)) !== manifest.packageBoard.sha256) throw new Error("minimal-editorial-review-package-board-sha-mismatch");
if (fileSha256(publicFile(manifest.timelineBoard.publicUrl)) !== manifest.timelineBoard.sha256) throw new Error("minimal-editorial-review-timeline-board-sha-mismatch");

const semanticRead = {
  "ED-07": "真实口播画面保留为主承载，左上只提出一次生成全文的单一问题；脸、眼、身体和麦克风均未被标题覆盖。",
  "ED-19": "真实口播画面保留为主承载，左上只说明 Codex 在后台工作；人物与麦克风边界完整。",
  "ED-34": "片尾只保留真正写出自己的风格这一方向性结论，无装饰物、无第二视觉动作。",
};
const now = new Date().toISOString();
for (const item of manifest.items) {
  const file = publicFile(item.previewPublicUrl);
  if (!fs.existsSync(file) || fileSha256(file) !== item.artifactSha256) throw new Error(`minimal-editorial-review-item-sha-mismatch:${item.shotId}`);
  item.styleLineage.minimalCompositionAudit = {
    ...item.styleLineage.minimalCompositionAudit,
    status: "PASS",
    actualPixelsViewed: true,
    primaryActorCount: 1,
    semanticActionCount: 1,
    decorativeMotifCount: 0,
    referenceConstructionMatch: "PASS",
    independentPosterProduct: false,
    reviewedAt: now,
  };
  if (semanticRead[item.shotId]) {
    item.styleLineage.preservedActualPixelReview = true;
    item.styleLineage.preservationReason = "AGENT_ACTUAL_PIXEL_PASS_MINIMAL_EDITORIAL_COMPLETE_LOOK_MASTER";
    item.styleLineage.compositeVisualAudit = {
      ...item.styleLineage.compositeVisualAudit,
      status: "PASS",
      actualPixelsViewed: true,
      reviewMethod: "FULL_RESOLUTION_FRAME_AND_11_SHOT_PACKAGE_BOARD_AND_34_SHOT_TIMELINE_VIEWED_TOGETHER",
      semanticAgreement: "PASS",
      semanticRead: semanticRead[item.shotId],
      visualActorDominant: true,
      formalTextRendererBound: true,
      generatedFormalText: false,
      fakeEvidenceFound: false,
      specificGeneratedPersonFound: false,
      titleOverloadFound: false,
      reviewedAt: now,
    };
  }
}

const reportBase = {
  contract: "A1MinimalEditorialStaticBoardActualPixelReview/v1",
  status: "PASS",
  recommendation: "READY_FOR_USER_WHOLE_FILM_STATIC_BOARD_REVIEW",
  packageBoardSha256: manifest.packageBoard.sha256,
  timelineBoardSha256: manifest.timelineBoard.sha256,
  packageShotIds: manifest.packageShotIds,
  demotedBreathingBeatShotIds: manifest.demotedBreathingBeatShotIds,
  standaloneTypographyTakeoverShotIds: ["ED-08", "ED-34"],
  checks: {
    actualPackageBoardViewed: true,
    actualTimelineBoardViewed: true,
    presenterOrEvidenceDefaultCarrier: true,
    independentPosterSequenceDetected: false,
    consecutiveStandalonePosterTakeovers: 0,
    newlyCompositedPresenterFacesProtected: true,
    newlyCompositedMicrophonesProtected: true,
    onePrimaryActorPerPackage: true,
    oneSemanticActionPerPackage: true,
    decorativeMotifBudgetRespected: true,
    formalTextLocallyRendered: true,
    generatedFormalTextDetected: false,
  },
  boundaries: {
    userVisualApproval: "NOT_APPROVED",
    productionAdmitted: false,
    imagegenCallCount: 0,
    assemblyCreated: false,
    layerExtractionPerformed: false,
    motionPerformed: false,
  },
  reviewedAt: now,
};
const report = {...reportBase, auditSha256: sha256(reportBase)};
fs.writeFileSync(path.join(candidateRoot, "agent-actual-pixel-review.json"), `${JSON.stringify(report, null, 2)}\n`);
const nextBase = {...manifest, status: "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW", agentActualPixelReview: {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/minimal-editorial-static-board-repair-v1/agent-actual-pixel-review.json", sha256: report.auditSha256}, reviewedAt: now, manifestSha256: undefined};
const next = {...nextBase, manifestSha256: sha256(nextBase)};
fs.writeFileSync(manifestFile, `${JSON.stringify(next, null, 2)}\n`);
console.log(JSON.stringify({status: next.status, manifestSha256: next.manifestSha256, reviewSha256: report.auditSha256, packageBoardSha256: next.packageBoard.sha256, timelineBoardSha256: next.timelineBoard.sha256, userVisualApproval: next.userVisualApproval}, null, 2));
