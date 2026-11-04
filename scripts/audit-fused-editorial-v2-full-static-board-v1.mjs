#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const phaseId = "fused-editorial-v2-full-static-board-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const pilotDir = path.join(root, "apps/studio-next/public/generated/system-line/fused-editorial-v2-12-pilot-v1");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const report = read(path.join(publicDir, "report.json"));
const board = read(path.join(publicDir, "design-board-manifest.json"));
const designs = read(path.join(publicDir, "layered-shot-designs.json"));
const ledger = read(path.join(publicDir, "full-static-board-review-decisions.json"));
const pilotLedger = read(path.join(pilotDir, "review-decisions.json"));
if (report.contract !== "A1FusedEditorialV2FullStaticBoardReport/v1") throw new Error("full-static-board-report-contract-invalid");
if (report.currentAuthorityMutated !== false || report.currentAuthority?.phaseId !== "h-series-semantic-directed-v1") throw new Error("current-authority-mutated");
if (report.source?.shotCount !== 47 || report.shots?.length !== 47 || designs.designs?.length !== 47 || board.shots?.length !== 47) throw new Error("full-static-board-count-invalid");
if (!report.allShotsStableStills || report.treatmentSummary?.everySourceHasThreeReadyTreatments !== true) throw new Error("full-static-board-treatment-or-still-gate-invalid");
if (ledger.status !== "FULL_STATIC_BOARD_APPROVED_BY_DELEGATE" || ledger.summary?.approvedCount !== 47) throw new Error("full-static-board-review-not-approved");
if (pilotLedger.contract !== "A1FusedEditorialV2TwelveShotPilotReviewLedger/v1" || pilotLedger.summary?.approvedCount !== 12 || report.pilotReview?.ledgerSha256 !== crypto.createHash("sha256").update(fs.readFileSync(path.join(pilotDir, "review-decisions.json"))).digest("hex")) throw new Error("12-shot-pilot-lineage-invalid");
const families = designs.designs.map((design) => design.sceneFamily);
for (let i = 2; i < families.length; i += 1) if (families[i] === families[i - 1] && families[i] === families[i - 2]) throw new Error(`scene-family-run-over-two:${families[i]}:${i + 1}`);
for (const [index, design] of designs.designs.entries()) {
  if (design.order !== index + 1) throw new Error(`shot-order-invalid:${design.shotId}`);
  if (!design.narrative?.task || !design.narrative?.visualFocus || !design.narrative?.carryIn || !design.narrative?.carryOut) throw new Error(`narrative-contract-invalid:${design.shotId}`);
  if (!design.layers || Object.keys(design.layers).sort().join(",") !== "background,finish,foreground,material,semanticElements,typography") throw new Error(`six-layer-contract-invalid:${design.shotId}`);
  const still = report.shots[index]?.still?.publicUrl;
  if (!still || !fs.existsSync(path.join(root, "apps/studio-next/public", still.replace(/^\//u, "")))) throw new Error(`stable-still-missing:${design.shotId}`);
}
console.log(JSON.stringify({status: "PASS", phaseId, shotCount: 47, approvedCount: ledger.summary.approvedCount, familyCount: Object.keys(report.sceneFamilyCounts || {}).length, treatmentSummary: report.treatmentSummary, currentAuthorityUnchanged: report.currentAuthority.unchanged}, null, 2));
