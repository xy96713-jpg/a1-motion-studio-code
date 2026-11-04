#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const generatedDir = path.join(root, "apps/studio-next/public/generated/system-line");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const articlePhaseIds = [
  "article-nasa-solar-eclipse-photography-fused-editorial-v2-v1",
  "article-our-world-in-data-energy-mix-fused-editorial-v2-v1",
  "article-apple-iphone-17e-fused-editorial-v2-v1",
  "article-paul-graham-life-is-short-fused-editorial-v2-v1",
];
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const exists = (file) => fs.existsSync(file) && fs.statSync(file).size > 0;
const checks = [];
const check = (id, pass, detail) => checks.push({id, status: pass ? "PASS" : "FAIL", detail});
const maturityPath = path.join(generatedDir, "maturity-acceptance-v1/maturity-manifest.json");
const maturity = read(maturityPath);
const maskReportPath = path.join(generatedDir, "birefnet-mask-benchmark-v1/report.json");
const maskEdgePath = path.join(generatedDir, "birefnet-mask-benchmark-v1/edge-review.json");
const mask = read(maskReportPath); const maskEdge = read(maskEdgePath);
check("maturity-label", maturity.status === "SYSTEM_VERIFIED_V1" && maturity.outputLabel === "SYSTEM_VERIFIED_V1" && maturity.matureArticleCount === 5 && maturity.review?.humanVisualApprovalStatus === "not-approved", {status: maturity.status, outputLabel: maturity.outputLabel, matureArticleCount: maturity.matureArticleCount, review: maturity.review});
check("selected-mask-reviewed", mask.status === "COMPLETE" && mask.selectedVariant === "lite" && mask.result?.lite?.generatedCount === 30 && mask.result?.lite?.reviewedCount === 30 && maskEdge.summary?.reviewedCount === 30, {status: mask.status, selectedVariant: mask.selectedVariant, lite: mask.result?.lite, edgeReview: maskEdge.summary});
const articleResults = [];
for (const phaseId of articlePhaseIds) {
  const publicDir = path.join(generatedDir, phaseId); const artifactDir = path.join(artifactRoot, phaseId); const report = read(path.join(publicDir, "report.json")); const designs = read(path.join(publicDir, "layered-shot-designs.json")); const board = read(path.join(publicDir, "design-board-manifest.json")); const provenance = read(path.join(publicDir, "source-provenance.json")); const motionLedger = read(path.join(publicDir, "540p-review-decisions.json"));
  const video = path.join(publicDir, "full-540p-review.mp4"); const sourceCache = path.join(artifactDir, "source.html"); const materialUri = provenance.material?.assetUri ? provenance.material.assetUri.replace(/^generated\//u, "generated/") : null; const material = materialUri ? path.join(root, "remotion-renderer/public", materialUri) : null;
  const treatments = fs.existsSync(path.join(artifactDir, "treatments")) ? fs.readdirSync(path.join(artifactDir, "treatments")).filter((name) => /\.png$/iu.test(name)) : [];
  const explicit1080 = report.formal1080?.reviewStatus === "FORMAL_1080_APPROVED_BY_DELEGATE" && exists(path.join(publicDir, "formal-1080-candidate.mp4"));
  const articleCheck = {
    phaseId,
    status: report.status,
    shotCount: designs.designs?.length || 0,
    cacheHit: Boolean(provenance.cacheHit && exists(sourceCache) && material && exists(material)),
    staticBoardApproved: board.summary?.approvedCount === board.summary?.shotCount && exists(path.join(publicDir, "static-board-contact-sheet.jpg")),
    sixLayers: Boolean(designs.designs?.every((design) => Object.keys(design.layers || {}).length === 6)),
    cropsAtLeastThree: treatments.length >= 3,
    fiveFortyApproved: motionLedger.status === "ARTICLE_540P_APPROVED_BY_DELEGATE" && motionLedger.summary?.approvedCount === motionLedger.summary?.shotCount && exists(video),
    explicit1080,
  };
  articleResults.push(articleCheck);
  check(`${phaseId}:complete`, articleCheck.status === "ARTICLE_540P_APPROVED_BY_DELEGATE" && articleCheck.shotCount >= 4 && articleCheck.cacheHit && articleCheck.staticBoardApproved && articleCheck.sixLayers && articleCheck.cropsAtLeastThree && articleCheck.fiveFortyApproved, articleCheck);
}
check("one-explicit-1080", articleResults.filter((item) => item.explicit1080).length >= 1, articleResults.map((item) => ({phaseId: item.phaseId, explicit1080: item.explicit1080})));
const failures = checks.filter((item) => item.status === "FAIL");
const audit = {contract: "A1FusedEditorialV2ArticleAcceptanceAudit/v1", phaseId: "fused-editorial-v2-article-acceptance-audit-v1", status: failures.length ? "BLOCKED" : "PASS", generatedAt: new Date().toISOString(), maturityManifestSha256: sha256(maturityPath), checks, failures, articleResults, nextAction: failures.length ? "repair-article-acceptance-contract" : "none"};
for (const target of [path.join(artifactRoot, "fused-editorial-v2-article-acceptance-audit-v1/report.json"), path.join(generatedDir, "fused-editorial-v2-article-acceptance-audit-v1/report.json")]) { fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, `${JSON.stringify(audit, null, 2)}\n`); }
console.log(JSON.stringify({status: audit.status, passCount: checks.filter((item) => item.status === "PASS").length, failureCount: failures.length, matureArticleCount: maturity.matureArticleCount, explicit1080Count: articleResults.filter((item) => item.explicit1080).length}, null, 2));
if (failures.length) process.exitCode = 1;
