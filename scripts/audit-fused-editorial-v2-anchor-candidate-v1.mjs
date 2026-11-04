#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const phaseId = "fused-editorial-v2-anchor-candidate-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const auditArtifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/fused-editorial-v2-anchor-audit-v1");
const auditPublicDir = path.join(root, "apps/studio-next/public/generated/system-line/fused-editorial-v2-anchor-audit-v1");
const baseUrl = process.env.A1_SYSTEM_LINE_REVIEW_URL || "http://127.0.0.1:4311";

const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const sha = (file) => fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const checks = [];
const check = (id, pass, detail, severity = "blocker") => checks.push({id, status: pass ? "PASS" : "FAIL", severity, detail});

async function http(url) {
  try {
    const response = await fetch(url, {cache: "no-store"});
    return {ok: response.ok, status: response.status, text: await response.text()};
  } catch (error) {
    return {ok: false, status: 0, text: error instanceof Error ? error.message : String(error)};
  }
}

const reportPath = path.join(publicDir, "report.json");
const artifactReportPath = path.join(artifactDir, "report.json");
const ledgerPath = path.join(publicDir, "review-decisions.json");
const boardPath = path.join(publicDir, "design-board-manifest.json");
const visualMasterPath = path.join(publicDir, "visual-master.json");
const designsPath = path.join(publicDir, "anchor-designs.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const pageSourcePath = path.join(root, "apps/studio-next/src/app/system-line-review/page.tsx");
const panelSourcePath = path.join(root, "apps/studio-next/src/app/system-line-review/FusedEditorialV2ReviewPanel.tsx");
const apiSourcePath = path.join(root, "apps/studio-next/src/app/api/system-line/fused-editorial-v2-review/route.ts");

const report = readJson(reportPath) || {};
const ledger = readJson(ledgerPath) || {};
const board = readJson(boardPath) || {};
const visualMaster = readJson(visualMasterPath) || {};
const designs = readJson(designsPath) || {};
const currentPhase = readJson(currentPhasePath) || {};
const pageSource = fs.existsSync(pageSourcePath) ? fs.readFileSync(pageSourcePath, "utf8") : "";
const panelSource = fs.existsSync(panelSourcePath) ? fs.readFileSync(panelSourcePath, "utf8") : "";
const apiSource = fs.existsSync(apiSourcePath) ? fs.readFileSync(apiSourcePath, "utf8") : "";

check("report-artifact-public-parity", sha(reportPath) !== null && sha(reportPath) === sha(artifactReportPath), {public: sha(reportPath), artifact: sha(artifactReportPath)});
check("visual-master-contract", visualMaster.contract === "A1VisualMasterProfile/v2" && visualMaster.id === "fused-editorial-v2" && visualMaster.sceneFamilies?.length === 8, {contract: visualMaster.contract, id: visualMaster.id, familyCount: visualMaster.sceneFamilies?.length});
check("six-layer-design-contract", designs.contract === "A1FusedEditorialV2AnchorDesignSet/v1" && designs.anchors?.length === 3 && designs.anchors.every((anchor) => anchor.design?.contract === "A1LayeredShotDesign/v2" && Object.keys(anchor.design.layers || {}).length === 6), {contract: designs.contract, anchorCount: designs.anchors?.length});
check("design-board-contract", board.contract === "A1DesignBoardManifest/v1" && board.phase === "anchor-review" && board.shots?.length === 3 && board.reviewOnly === true, {contract: board.contract, phase: board.phase, shotCount: board.shots?.length});
check("machine-pass-is-not-human-approval", report.structuralStatus === "PASS" && report.gates?.humanVisualApprovalRequired === true && report.visualReviewStatus !== "PASS", {structuralStatus: report.structuralStatus, visualReviewStatus: report.visualReviewStatus});
check("current-authority-stays-h47", currentPhase.contract === "A1SystemLineCurrentPhase/v1" && currentPhase.phaseId === "h-series-semantic-directed-v1" && report.currentAuthority?.unchanged === true && report.currentAuthority?.sha256After === sha(currentPhasePath), {phaseId: currentPhase.phaseId, currentPhaseSha256: sha(currentPhasePath), report: report.currentAuthority});
check("human-gates-bound", ledger.contract === "A1FusedEditorialV2AnchorReviewLedger/v1" && ledger.visualMasterSha256 === report.visualMaster?.sha256 && ledger.summary?.anchorCount === 3 && board.summary?.approvedCount === ledger.summary?.approvedCount, {ledgerStatus: ledger.status, ledgerSummary: ledger.summary, boardSummary: board.summary});
check("motion-and-render-locked", board.motionDesignAllowed === false && board.fullMp4RenderAllowed === false && board.finalRenderAllowed === false && report.gates?.motionDesignAllowed === false && report.gates?.fullMp4RenderAllowed === false && report.gates?.finalRenderAllowed === false, {board: {motion: board.motionDesignAllowed, fullMp4: board.fullMp4RenderAllowed, final: board.finalRenderAllowed}, report: report.gates});
check("reference-suite-does-not-unlock-full-board", ledger.referenceSuiteApproved === (ledger.summary?.approvedCount === 3) && board.fullBoardGenerationAllowed === false && report.gates?.fullBoardGenerationAllowed === false, {approvedCount: ledger.summary?.approvedCount, referenceSuiteApproved: ledger.referenceSuiteApproved, boardAllowed: board.fullBoardGenerationAllowed, reportAllowed: report.gates?.fullBoardGenerationAllowed});

const stillChecks = (report.anchors || []).map((anchor) => {
  const publicFile = path.join(root, "apps/studio-next/public", String(anchor.still?.publicUrl || "").replace(/^\//u, ""));
  return {anchorId: anchor.anchorId, exists: fs.existsSync(publicFile), shaMatches: fs.existsSync(publicFile) && sha(publicFile) === anchor.still?.sha256, width: anchor.still?.width, height: anchor.still?.height};
});
check("three-stable-960x540-stills", stillChecks.length === 3 && stillChecks.every((item) => item.exists && item.shaMatches && item.width === 960 && item.height === 540), stillChecks);

const treatmentChecks = (report.anchors || []).flatMap((anchor) => (anchor.treatments || []).map((treatment) => ({anchorId: anchor.anchorId, id: treatment.id, ready: (treatment.outputs || []).filter((output) => output.status === "ready" && output.publicUrl && fs.existsSync(path.join(root, "apps/studio-next/public", output.publicUrl.replace(/^\//u, "")))).length, fallback: (treatment.outputs || []).filter((output) => output.status === "fallback-to-crop").length, alpha: treatment.subjectAnalysis?.hasTransparentBackground === true})));
check("four-treatment-material-factory", treatmentChecks.length === 4 && treatmentChecks.every((item) => item.ready >= 3) && report.assetFactory?.allSourcesHaveAtLeastThreeReadyTreatments === true, treatmentChecks);
check("cutout-failure-not-faked", treatmentChecks.filter((item) => !item.alpha).every((item) => item.fallback === 1) && report.assetFactory?.honestFallbackCount >= 1, {treatments: treatmentChecks, honestFallbackCount: report.assetFactory?.honestFallbackCount});
check("no-phase-mp4-created", !fs.readdirSync(publicDir).some((name) => /\.mp4$/iu.test(name)), {files: fs.readdirSync(publicDir)});
check("single-review-page-wiring", pageSource.includes("<FusedEditorialV2ReviewPanel />") && pageSource.includes('href="#fused-editorial-v2"') && pageSource.includes('data-a1-historical-candidate="editorial-evidence-kinetic-system-v1"'), {pageSource: path.relative(root, pageSourcePath)});
check("ui-exposes-six-layers-and-locks", panelSource.includes("data-a1-fused-six-layer-inspector") && (panelSource.includes('data-a1-fused-editorial-v2-motion="locked"') || panelSource.includes("data-a1-fused-editorial-v2-motion={motionUiStatus}")) && panelSource.includes("系统参考原型"), {panelSource: path.relative(root, panelSourcePath)});
check("review-api-hash-binds-and-does-not-render", apiSource.includes("visualMasterSha256") && apiSource.includes("designSha256") && apiSource.includes("currentPhase.phaseId !== \"h-series-semantic-directed-v1\"") && !apiSource.includes("renderMedia") && !apiSource.includes("current-phase.json\", next"), {apiSource: path.relative(root, apiSourcePath)});

const [pageResponse, apiResponse, ...assetResponses] = await Promise.all([
  http(`${baseUrl}/system-line-review`),
  http(`${baseUrl}/api/system-line/fused-editorial-v2-review`),
  ...(report.anchors || []).map((anchor) => http(`${baseUrl}${anchor.still.publicUrl}`)),
]);
const hasSystemAcceptance = pageResponse.text.includes("data-a1-fused-article-acceptance=\"SYSTEM_VERIFIED_V1\"") || pageResponse.text.includes("data-a1-fused-article-acceptance=\"MATURE_REVIEWED_V1\"");
const livePageHasSingleEntry = pageResponse.ok && pageResponse.text.includes("data-a1-fused-editorial-v2=") && (pageResponse.text.includes("data-a1-fused-editorial-v2=\"anchor-review\"") || pageResponse.text.includes("data-a1-fused-editorial-v2=\"pilot-review\"") || pageResponse.text.includes("data-a1-fused-editorial-v2=\"pilot-approved\"") || pageResponse.text.includes("data-a1-fused-editorial-v2=\"representative-motion-approved\"") || pageResponse.text.includes("data-a1-fused-editorial-v2=\"full-540p-approved\""));
check("live-page-single-entry", livePageHasSingleEntry, {status: pageResponse.status, markers: {candidate: pageResponse.text.includes("data-a1-fused-editorial-v2"), fullBoardLocked: pageResponse.text.includes("data-a1-fused-editorial-v2-full-board=\"locked\""), systemAcceptance: hasSystemAcceptance} });
let apiPayload = null;
try { apiPayload = JSON.parse(apiResponse.text); } catch {}
check("live-review-api-readonly-state", apiResponse.ok && apiPayload?.ok === true && apiPayload?.ledger?.summary?.anchorCount === 3, {status: apiResponse.status, ledgerStatus: apiPayload?.ledger?.status, summary: apiPayload?.ledger?.summary});
check("live-still-assets", assetResponses.length === 3 && assetResponses.every((item) => item.ok), assetResponses.map((item) => item.status));

const failures = checks.filter((item) => item.status === "FAIL" && item.severity === "blocker");
const warnings = checks.filter((item) => item.status === "FAIL" && item.severity === "warning");
const audit = {
  contract: "A1FusedEditorialV2AnchorCandidateAudit/v1",
  phaseId: "fused-editorial-v2-anchor-audit-v1",
  status: failures.length ? "BLOCKED" : warnings.length ? "PASS_WITH_WARNINGS" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  structuralPassOnly: true,
  humanVisualApprovalStatus: ledger.status || "MISSING",
  currentAuthorityMutated: false,
  fullBoardGenerationAllowed: false,
  motionDesignAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  summary: {checkCount: checks.length, passCount: checks.filter((item) => item.status === "PASS").length, failureCount: failures.length, warningCount: warnings.length, anchorCount: report.anchors?.length || 0, treatmentSourceCount: treatmentChecks.length},
  checks,
  failures,
  warnings,
  nextAction: failures.length ? "repair-fused-editorial-v2-reference-suite" : "build-12-shot-pilot-before-full-board",
};
writeJson(path.join(auditArtifactDir, "report.json"), audit);
writeJson(path.join(auditPublicDir, "report.json"), audit);
console.log(JSON.stringify({status: audit.status, summary: audit.summary, failures: failures.map((item) => item.id), warnings: warnings.map((item) => item.id), humanVisualApprovalStatus: audit.humanVisualApprovalStatus, nextAction: audit.nextAction}, null, 2));
if (failures.length) process.exitCode = 1;
