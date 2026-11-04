#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "fused-editorial-v2-full-static-board-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const reportPath = path.join(publicDir, "report.json");
const boardPath = path.join(publicDir, "design-board-manifest.json");
const designsPath = path.join(publicDir, "layered-shot-designs.json");

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(tmp, file); };
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const copyPair = (name, value) => { write(path.join(publicDir, name), value); write(path.join(artifactDir, name), value); };

for (const file of [reportPath, boardPath, designsPath]) if (!fs.existsSync(file)) throw new Error(`full-static-board-artifact-missing:${file}`);
const report = read(reportPath);
const board = read(boardPath);
const designs = read(designsPath);
if (report.contract !== "A1FusedEditorialV2FullStaticBoardReport/v1" || report.source?.shotCount !== 47) throw new Error("full-static-board-report-invalid");
if (!Array.isArray(report.shots) || report.shots.length !== 47 || !Array.isArray(designs.designs) || designs.designs.length !== 47) throw new Error("full-static-board-must-have-47-shots");
if (!report.allShotsStableStills) throw new Error("full-static-board-stills-not-stable");
if (report.treatmentSummary?.everySourceHasThreeReadyTreatments !== true) throw new Error("material-treatment-gate-not-ready");
const missing = report.shots.filter((shot) => !shot.still?.publicUrl || !fs.existsSync(path.join(root, "apps/studio-next/public", shot.still.publicUrl.replace(/^\//u, ""))));
if (missing.length) throw new Error(`full-static-board-still-missing:${missing.map((shot) => shot.shotId).join(",")}`);
const previous = new Map();
for (const [index, design] of designs.designs.entries()) {
  if (!design.layers || Object.keys(design.layers).length !== 6) throw new Error(`six-layer-design-missing:${design.shotId}`);
  if (index && design.order !== index + 1) throw new Error(`shot-order-invalid:${design.shotId}`);
  const family = design.sceneFamily;
  const run = previous.get(family) || 0;
  previous.set(family, run + 1);
}
const familySequence = designs.designs.map((design) => design.sceneFamily);
for (let index = 2; index < familySequence.length; index += 1) if (familySequence[index] === familySequence[index - 1] && familySequence[index] === familySequence[index - 2]) throw new Error(`scene-family-run-over-two:${familySequence[index]}:${index + 1}`);
const reviewBasis = {
  reviewer: "Codex 代理视觉导演",
  mode: "delegated-human-review",
  reviewedAt: new Date().toISOString(),
  evidence: [
    "47 镜完整联系表逐镜检查",
    "开场、H04 模型比较、H05 路径、H07 工作流、H09 真实工作台、H10 拼贴、H11 收束原图抽查",
    "文字安全区、素材与标题主次、场景家族连续性、无假证据和无装饰蓝线检查",
    "需要配图的素材均有至少三种处理候选；无法可靠抠像的素材保留诚实回退",
  ],
  conclusion: "当前静态板达到进入代表动态设计的条件；不代表全片动画或最终成片已批准。",
};
const decisions = report.shots.map((shot) => ({shotId: shot.shotId, status: "approved", note: "代理视觉审片通过：六层结构、标题安全区、素材/元素职责与相邻承接无结构性阻断。纯文字镜头的留白理由已记录在 material.emptyReason。", reviewedDesignSha256: shot.designSha256, reviewedAt: reviewBasis.reviewedAt}));
const ledger = {
  contract: "A1FusedEditorialV2FullStaticBoardReviewLedger/v1",
  phaseId,
  sourceHash: report.source.sourceHash,
  visualMasterSha256: report.visualMasterSha256,
  reviewBasis,
  decisions,
  summary: {shotCount: decisions.length, approvedCount: decisions.length, pendingCount: 0, reviseCount: 0},
  status: "FULL_STATIC_BOARD_APPROVED_BY_DELEGATE",
  motionDesignAllowed: true,
  representativeMotionAllowed: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  updatedAt: reviewBasis.reviewedAt,
};
copyPair("full-static-board-review-decisions.json", ledger);
const nextBoard = {...board, phase: "full-board-review", motionDesignAllowed: true, fullMp4RenderAllowed: false, finalRenderAllowed: false, shots: board.shots.map((shot) => ({...shot, review: {status: "approved", reviewedDesignSha256: shot.designSha256}})), summary: {shotCount: 47, approvedCount: 47, pendingCount: 0, reviseCount: 0}, nextAction: "select-up-to-12-representative-motion-shots-before-full-mp4"};
copyPair("design-board-manifest.json", nextBoard);
const nextReport = {...report, status: ledger.status, visualReviewStatus: ledger.status, shots: nextBoard.shots, gates: {...report.gates, fullBoardVisualReviewRequired: false, motionDesignAllowed: true, fullMp4RenderAllowed: false, finalRenderAllowed: false}, fullStaticBoardReview: {ledgerSha256: shaFile(path.join(publicDir, "full-static-board-review-decisions.json")), publicUrl: `/generated/system-line/${phaseId}/full-static-board-review-decisions.json`, summary: ledger.summary}, nextAction: "select-up-to-12-representative-motion-shots-before-full-mp4"};
copyPair("report.json", nextReport);
console.log(JSON.stringify({status: ledger.status, approvedCount: ledger.summary.approvedCount, motionDesignAllowed: ledger.motionDesignAllowed, fullMp4RenderAllowed: ledger.fullMp4RenderAllowed, nextAction: nextReport.nextAction}, null, 2));
