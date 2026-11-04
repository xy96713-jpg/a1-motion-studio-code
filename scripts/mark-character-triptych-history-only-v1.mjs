#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const triptychRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/ed13-approved-static-triptych-v1");
const manifestPath = path.join(triptychRoot, "manifest.json");
const approvalPath = path.join(root, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/ed13-direction-bound-canary-v1/repair-v1/user-static-look-master-approval.json");
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const manifest = read(manifestPath);
const {manifestSha256: _manifestSha256, ...manifestBody} = manifest;
const supersededManifest = {
  ...manifestBody,
  status: "SUPERSEDED",
  supersession: {
    contract: "A1StaticCharacterTriptychSupersession/v1",
    status: "HISTORY_ONLY",
    reason: "Latest user direction forbids specific human or mascot as the default actor; retain the prior character triptych only as reference evidence.",
    supersededBy: "A1LayeredAssetTriptychWithoutCharacter/v1",
    currentAuthorityMustNotConsume: true,
  },
  boundary: {...manifestBody.boundary, independentVisualVerdict: "HISTORY_ONLY", productionAdmitted: false, userVisualApproval: "NOT_APPROVED"},
  nextAction: "HISTORY_ONLY_NOT_CURRENT_DIRECTION",
};
supersededManifest.manifestSha256 = sha256(Object.fromEntries(Object.entries(supersededManifest).filter(([key]) => key !== "manifestSha256")));
write(manifestPath, supersededManifest);

if (fs.existsSync(approvalPath)) {
  const approval = read(approvalPath);
  const {approvalSha256: _approvalSha256, ...approvalBody} = approval;
  const supersededApproval = {
    ...approvalBody,
    status: "SUPERSEDED_HISTORY_ONLY",
    supersession: {reason: "The approved A-R1 character is retained for palette/layout/material reference only; it is not a default character authority.", currentAuthorityMustNotConsume: true},
    scope: {...approvalBody.scope, staticLookMaster: "REFERENCE_ONLY", deterministicPixelReconstruction: "NOT_CURRENT", derivedStaticTriptych: "SUPERSEDED_HISTORY_ONLY"},
    boundary: {...approvalBody.boundary, globalUserVisualApprovalRemains: "NOT_APPROVED"},
  };
  supersededApproval.approvalSha256 = sha256(Object.fromEntries(Object.entries(supersededApproval).filter(([key]) => key !== "approvalSha256")));
  write(approvalPath, supersededApproval);
}

const reportBody = {
  contract: "A1CharacterTriptychHistoryDisposition/v1",
  status: "SUPERSEDED_HISTORY_ONLY",
  sourceManifestPath: manifestPath,
  sourceManifestSha256Before: _manifestSha256,
  sourceApprovalPath: approvalPath,
  reason: "Specific human or mascot is not a current default actor.",
  deletionPerformed: false,
  projectionMutationPerformed: false,
  currentAuthorityMutationPerformed: false,
  userVisualApproval: "NOT_APPROVED",
  createdAt: new Date().toISOString(),
};
const report = {...reportBody, reportSha256: sha256(reportBody)};
write(path.join(triptychRoot, "supersession-history-only.json"), report);
console.log(JSON.stringify({status: report.status, reportSha256: report.reportSha256, manifestSha256: supersededManifest.manifestSha256, deletionPerformed: false, projectionMutationPerformed: false}, null, 2));
