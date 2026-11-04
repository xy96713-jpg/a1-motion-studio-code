#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/opening-nine-carrier-rhythm-canary-v1");
const manifestPath = path.join(outputRoot, "manifest.json");
const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(`opening-nine-carrier-rhythm-canary-v1:${message}`);
};
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const surface = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx"), "utf8");
const expectedShotIds = Array.from({length: 9}, (_, index) => `ED-${String(index + 1).padStart(2, "0")}`);

assert(manifest.contract === "A1OpeningNineCarrierRhythmCanary/v1", "contract");
assert(manifest.status === "READY_FOR_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY", "status");
assert(JSON.stringify(manifest.scope.shotIds) === JSON.stringify(expectedShotIds), "membership");
assert(manifest.diagnosis.currentLongestFullscreenScreenRun === 5, "current-screen-run");
assert(manifest.diagnosis.candidateLongestSameCarrierRun === 1, "candidate-carrier-run");
assert(manifest.checks.exactCurrentBoardSemanticWindows === true, "semantic-window-binding");
assert(manifest.checks.realScreenEvidencePreserved === true, "real-screen-evidence");
assert(manifest.checks.hybridPresenterGeometryPass === true, "hybrid-presenter-geometry");
assert(manifest.checks.generatedFormalTextAdded === false, "generated-formal-text");
assert(manifest.checks.currentAuthorityMutated === false, "authority-mutation");
assert(manifest.boundary.candidateOnly === true && manifest.boundary.productionAdmission === false, "candidate-boundary");
assert(manifest.boundary.motionProduced === false && manifest.boundary.resolveWritten === false && manifest.boundary.finalRender === false, "production-boundary");
assert(manifest.boundary.userVisualApproval === "NOT_APPROVED", "user-approval");
assert(surface.includes("opening-nine-carrier-rhythm-canary-v1/manifest.json"), "surface-manifest-route");
assert(surface.includes("data-a1-opening-nine-carrier-rhythm"), "surface-review-card");

for (const output of Object.values(manifest.outputs)) {
  const filePath = path.join(root, output.path);
  assert(fs.existsSync(filePath) && sha256File(filePath) === output.sha256, `output-sha:${path.basename(filePath)}`);
}
for (const entry of manifest.entries) {
  const filePath = path.join(root, entry.candidateFrame.path);
  assert(fs.existsSync(filePath) && sha256File(filePath) === entry.candidateFrame.sha256, `frame-sha:${entry.shotId}`);
  const metadata = await sharp(filePath).metadata();
  assert(metadata.width === 960 && metadata.height === 540 && metadata.format === "png", `frame-metadata:${entry.shotId}`);
  if (["ED-03", "ED-05"].includes(entry.shotId)) {
    assert(entry.presenterGeometryAudit?.faces?.length === 1, `face-count:${entry.shotId}`);
    assert(entry.presenterGeometryAudit?.humans?.length === 1, `human-count:${entry.shotId}`);
  }
}
const workspacePath = path.join(root, manifest.sourceBindings.workspace.path);
const phasePath = path.join(root, manifest.sourceBindings.phase.path);
assert(/^[a-f0-9]{64}$/u.test(manifest.sourceBindings.workspace.sha256 || ""), "source-workspace-sha-invalid");
assert(/^[a-f0-9]{64}$/u.test(manifest.sourceBindings.phase.sha256 || ""), "source-phase-sha-invalid");

console.log(JSON.stringify({
  status: "PASS",
  shotCount: manifest.entries.length,
  currentLongestFullscreenScreenRun: manifest.diagnosis.currentLongestFullscreenScreenRun,
  candidateLongestSameCarrierRun: manifest.diagnosis.candidateLongestSameCarrierRun,
  hybridFaceCount: 2,
  hybridHumanCount: 2,
  candidateBoardSha256: manifest.outputs.candidateBoard.sha256,
  comparisonSha256: manifest.outputs.comparison.sha256,
  currentAuthorityMutated: false,
  userVisualApproval: manifest.boundary.userVisualApproval,
}, null, 2));
