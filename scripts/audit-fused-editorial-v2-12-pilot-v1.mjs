#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "fused-editorial-v2-12-pilot-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const anchorDir = path.join(root, "apps/studio-next/public/generated/system-line/fused-editorial-v2-anchor-candidate-v1");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const reportPath = path.join(publicDir, "report.json");
const report = fs.existsSync(reportPath) ? read(reportPath) : null;
const designs = fs.existsSync(path.join(publicDir, "layered-shot-designs.json")) ? read(path.join(publicDir, "layered-shot-designs.json")) : null;
const board = fs.existsSync(path.join(publicDir, "design-board-manifest.json")) ? read(path.join(publicDir, "design-board-manifest.json")) : null;
const ledger = fs.existsSync(path.join(publicDir, "review-decisions.json")) ? read(path.join(publicDir, "review-decisions.json")) : null;
const anchorLedger = fs.existsSync(path.join(anchorDir, "review-decisions.json")) ? read(path.join(anchorDir, "review-decisions.json")) : null;
const currentPhase = fs.existsSync(currentPhasePath) ? read(currentPhasePath) : null;
const phasePresent = Boolean(report && designs && board && ledger);
const checks = [
  ["report-contract", report?.contract === "A1FusedEditorialV2TwelveShotPilotReport/v1"],
  ["canonical-compiler", report?.compiler?.contract === "A1FusedEditorialV2H47Compiler/v1" && designs?.compilerContract === report.compiler.contract],
  ["twelve-selected", report?.source?.totalShotCount === 47 && report?.source?.selectedShotIds?.length === 12 && designs?.designs?.length === 12],
  ["six-layer-designs", designs?.designs?.every((design) => design.contract === "A1LayeredShotDesign/v2" && Object.keys(design.layers || {}).length === 6)],
  ["pilot-phase-and-lock", board?.phase === "pilot-review" && board?.fullBoardGenerationAllowed === false && board?.motionDesignAllowed === false && board?.finalRenderAllowed === false],
  ["pilot-ledger-pending", ledger?.contract === "A1FusedEditorialV2TwelveShotPilotReviewLedger/v1" && ledger?.summary?.shotCount === 12 && ledger?.summary?.approvedCount === 0],
  ["reference-suite-is-not-a-pilot-gate", report?.gates?.referenceSuiteReviewRecommended === true && (!anchorLedger || anchorLedger?.fullBoardGenerationAllowed === false)],
  ["current-authority-unchanged", currentPhase?.phaseId === "h-series-semantic-directed-v1" && report?.currentAuthority?.unchanged === true && report.currentAuthority.sha256After === sha(currentPhasePath)],
  ["stills-present", (report?.shots || []).length === 12 && report.shots.every((shot) => shot.still?.publicUrl && fs.existsSync(path.join(root, "apps/studio-next/public", shot.still.publicUrl.replace(/^\//u, ""))))],
  ["contact-sheet-present", fs.existsSync(path.join(publicDir, "12-pilot-contact-sheet.jpg")) && fs.existsSync(path.join(artifactDir, "12-pilot-contact-sheet.jpg"))],
];
const failures = checks.filter(([, pass]) => !pass).map(([id]) => id);
const audit = {contract: "A1FusedEditorialV2TwelveShotPilotAudit/v1", phaseId, status: failures.length ? (phasePresent ? "FAIL" : "BLOCKED") : "PASS", checks: Object.fromEntries(checks), failures, currentAuthoritySha256: sha(currentPhasePath), nextAction: !phasePresent ? "build-12-shot-pilot" : failures.length ? "repair-12-shot-pilot" : ledger?.summary?.approvedCount === 12 ? "generate-47-shot-static-board" : "user-review-12-shot-pilot-before-47-board"};
fs.mkdirSync(artifactDir, {recursive: true}); fs.mkdirSync(publicDir, {recursive: true}); fs.writeFileSync(path.join(artifactDir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`); fs.writeFileSync(path.join(publicDir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
if (failures.length && phasePresent) process.exitCode = 1;
