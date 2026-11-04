#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/midfilm-eleven-carrier-rhythm-canary-v1/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const surface = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx"), "utf8");
const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(`midfilm-eleven-carrier-rhythm-canary-v1:${message}`); };
assert(manifest.contract === "A1MidfilmElevenCarrierRhythmCanary/v1", "contract");
assert(manifest.entries.length === 11 && manifest.scope.semanticDurationMs === 88640 && manifest.scope.editSlotDurationMs === 89620, "scope");
assert(manifest.diagnosis.currentLongestFullscreenScreenRun === 11 && manifest.diagnosis.candidateLongestSameCarrierRun === 1, "run-repair");
assert(manifest.checks.realScreenEvidencePreserved && manifest.checks.exactTimelinePresenterFrames && manifest.checks.presenterGeometryPass, "evidence-and-presenter");
assert(manifest.checks.generatedFormalTextAdded === false && manifest.checks.currentAuthorityMutated === false, "boundary-checks");
assert(manifest.boundary.candidateOnly && !manifest.boundary.motionProduced && manifest.boundary.userVisualApproval === "NOT_APPROVED", "boundary");
assert(surface.includes("midfilm-eleven-carrier-rhythm-canary-v1/manifest.json") && surface.includes("data-a1-midfilm-eleven-carrier-rhythm"), "surface");
for (const entry of manifest.entries) {
  const filePath = path.join(root, entry.candidateFrame.path);
  assert(fs.existsSync(filePath) && sha256File(filePath) === entry.candidateFrame.sha256, `frame-sha:${entry.shotId}`);
  const metadata = await sharp(filePath).metadata();
  assert(metadata.width === 960 && metadata.height === 540, `frame-size:${entry.shotId}`);
  if (entry.presenterGeometryAudit) assert(entry.presenterGeometryAudit.faces.length === 1 && entry.presenterGeometryAudit.humans.length === 1, `presenter:${entry.shotId}`);
}
for (const output of Object.values(manifest.outputs)) assert(sha256File(path.join(root, output.path)) === output.sha256, `output:${output.path}`);
assert(/^[a-f0-9]{64}$/u.test(manifest.sourceBindings.workspace.sha256 || ""), "source-workspace-sha-invalid");
assert(/^[a-f0-9]{64}$/u.test(manifest.sourceBindings.phase.sha256 || ""), "source-phase-sha-invalid");
console.log(JSON.stringify({status: "PASS", shotCount: 11, semanticDurationMs: manifest.scope.semanticDurationMs, editSlotDurationMs: manifest.scope.editSlotDurationMs, currentLongestFullscreenScreenRun: 11, candidateLongestSameCarrierRun: 1, hybridFaceCount: 3, candidateBoardSha256: manifest.outputs.candidateBoard.sha256, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"}, null, 2));
