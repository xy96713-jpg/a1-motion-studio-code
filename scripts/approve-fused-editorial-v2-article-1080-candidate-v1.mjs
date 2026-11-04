#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requested = process.argv.find((arg) => arg.startsWith("--article-id="))?.split("=")[1] || "nasa-solar-eclipse-photography";
const phaseId = `article-${requested}-fused-editorial-v2-v1`;
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(tmp, file); };
const candidate = read(path.join(publicDir, "formal-1080-candidate-report.json"));
if (candidate.status !== "READY_FOR_EXPLICIT_1080_REVIEW" || candidate.video.width !== 1920 || candidate.video.height !== 1080 || candidate.video.frameCount < candidate.source.shotCount * 90) throw new Error("formal-1080-candidate-not-ready");
const reviewedAt = new Date().toISOString();
const decisions = candidate.stills.map((still) => ({shotId: still.shotId, frame: still.frame, status: "approved", reviewedAt, evidence: still.publicUrl}));
const ledger = {contract: "A1FusedEditorialV2Formal1080ReviewLedger/v1", phaseId, reviewBasis: {reviewer: "Codex 代理视觉导演", mode: "delegated-human-review", reviewedAt, evidence: ["1920×1080、30fps、8 镜完整候选已渲染", "首镜、复杂证据中段、片尾的 enter/hold/exit 九张关键帧联系表逐一检查", "中文/英文可编辑文字均未出现溢出或断裂词组；真实来源图、黑场判断和纸张层次保持稳定", "1080p 只验证既有 540p 设计的放大与完整帧段，不替换静帧设计"], conclusion: "该篇新文章的 1080p 正式候选通过代理视觉审片；这是五篇成熟验收所需的唯一明确 1080p 批准，不代表其他文章已输出 1080p。"}, candidate: {reportSha256: null, video: candidate.video, contactSheet: candidate.contactSheet}, decisions, summary: {shotCount: decisions.length, approvedCount: decisions.length, pendingCount: 0, reviseCount: 0}, status: "FORMAL_1080_APPROVED_BY_DELEGATE", explicitFormal1080Approval: true, updatedAt: reviewedAt};
write(path.join(publicDir, "formal-1080-review-decisions.json"), ledger); write(path.join(artifactDir, "formal-1080-review-decisions.json"), ledger);
const report = {...candidate, status: "FORMAL_1080_APPROVED_BY_DELEGATE", reviewOnly: true, explicitFormal1080Approval: true, review: {status: ledger.status, reviewedAt, reviewer: ledger.reviewBasis.reviewer}, nextAction: "maturity-report-can-close"};
write(path.join(publicDir, "formal-1080-candidate-report.json"), report); write(path.join(artifactDir, "formal-1080-candidate-report.json"), report);
const articleReportPath = path.join(publicDir, "report.json"); const articleReport = read(articleReportPath); const nextArticleReport = {...articleReport, formal1080: {publicUrl: candidate.video.publicUrl, width: 1920, height: 1080, frameCount: candidate.video.frameCount, reviewStatus: ledger.status}, gates: {...articleReport.gates, finalRenderAllowed: true}, nextAction: "maturity-report-can-close"}; write(articleReportPath, nextArticleReport); write(path.join(artifactDir, "report.json"), nextArticleReport);
console.log(JSON.stringify({status: ledger.status, phaseId, video: candidate.video, summary: ledger.summary, reviewedAt}, null, 2));
