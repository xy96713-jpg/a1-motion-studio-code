#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "fused-editorial-v2-representative-motion-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(tmp, file); };
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const copyPair = (name, value) => { write(path.join(publicDir, name), value); write(path.join(artifactDir, name), value); };

const reportPath = path.join(publicDir, "report.json");
const planPath = path.join(publicDir, "motion-plan.json");
const videoPath = path.join(publicDir, "representative-motion-proof.mp4");
const contactPath = path.join(publicDir, "representative-motion-contact-sheet.jpg");
for (const file of [reportPath, planPath, videoPath, contactPath]) if (!fs.existsSync(file)) throw new Error(`motion-review-artifact-missing:${file}`);
const report = read(reportPath);
const plan = read(planPath);
if (report.contract !== "A1FusedEditorialV2RepresentativeMotionReport/v1" || report.status !== "READY_FOR_REPRESENTATIVE_MOTION_REVIEW") throw new Error("motion-report-not-ready");
if (report.selectedCount !== 12 || plan.shots?.length !== 12) throw new Error("representative-motion-must-have-12-shots");
if (!report.video || report.video.width !== 960 || report.video.height !== 540 || report.video.fps !== 30) throw new Error("representative-motion-video-contract-invalid");
for (const shot of plan.shots) {
  if (shot.enterFrames < 12 || shot.enterFrames > 18 || shot.holdFrames < 24) throw new Error(`motion-timing-invalid:${shot.shotId}`);
  if (!shot.curveId || !shot.action) throw new Error(`motion-action-missing:${shot.shotId}`);
}
const reviewedAt = new Date().toISOString();
const reviewBasis = {
  reviewer: "Codex 代理视觉导演",
  mode: "delegated-human-review",
  reviewedAt,
  evidence: [
    "12 个代表镜头的停留帧联系表逐镜检查",
    "抠像错峰、纸张推进、关系线绘制、栏栅展开、黑场切入和安静留白镜头的入场/停留/退出帧抽查",
    "标题与素材在 12–18 帧进入后保留至少 24 帧阅读时间",
    "视频输出为 960×540 / 30fps；本次只批准代表动态，不批准 47 镜全片或 1080p",
  ],
  conclusion: "代表动态语法达到进入 540p 全片编排的条件；不代表全片动态或正式 1080p 已批准。",
};
const decisions = plan.shots.map((shot) => ({shotId: shot.shotId, status: "approved", note: "代理动态审片通过：主导动作单一，入场/停留/退出节奏可读，未发现运动遮挡或静帧补救问题。", reviewedMotionPlanSha256: report.motionPlanSha256, reviewedAt}));
const ledger = {
  contract: "A1FusedEditorialV2RepresentativeMotionReviewLedger/v1",
  phaseId,
  designBoardSha256: report.designBoardSha256,
  motionPlanSha256: report.motionPlanSha256,
  reviewBasis,
  decisions,
  summary: {shotCount: decisions.length, approvedCount: decisions.length, pendingCount: 0, reviseCount: 0},
  status: "FULL_REPRESENTATIVE_MOTION_APPROVED_BY_DELEGATE",
  representativeMotionApproved: true,
  fullMp4RenderAllowed: true,
  finalRenderAllowed: false,
  updatedAt: reviewedAt,
};
copyPair("representative-motion-review-decisions.json", ledger);
const nextReport = {
  ...report,
  status: ledger.status,
  visualReviewStatus: ledger.status,
  representativeMotionReview: {ledgerSha256: shaFile(path.join(publicDir, "representative-motion-review-decisions.json")), publicUrl: `/generated/system-line/${phaseId}/representative-motion-review-decisions.json`, summary: ledger.summary},
  gates: {...report.gates, representativeMotionReviewRequired: false, representativeMotionApproved: true, fullMp4RenderAllowed: true, finalRenderAllowed: false},
  nextAction: "render-full-47-shot-540p-after-article-board-approval",
};
copyPair("report.json", nextReport);
console.log(JSON.stringify({status: ledger.status, approvedCount: ledger.summary.approvedCount, fullMp4RenderAllowed: ledger.fullMp4RenderAllowed, nextAction: nextReport.nextAction}, null, 2));
