#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildDirectionBoundImagegenRequest} from "../apps/studio-next/src/lib/a1-direction-bound-imagegen-request-v1.mjs";
import {readVisualDirectionAuthority} from "../apps/studio-next/src/lib/a1-visual-direction-authority-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/ed13-direction-bound-canary-v1");
const phase = JSON.parse(fs.readFileSync(phasePath, "utf8"));
if (phase?.reviewDecision?.userVisualApproval !== "NOT_APPROVED" || phase?.reviewDecision?.motionPrototypeAllowed !== false || phase?.reviewDecision?.resolveExportAllowed !== false || phase?.reviewDecision?.finalRenderAllowed !== false) throw new Error("ed13-direction-bound-request-build-invalid:approval-boundary");
const queue = phase?.authority?.generationQueueProjection;
if (Number(queue?.queued || 0) !== 0 || Number(queue?.running || 0) !== 0 || queue?.workerStatus !== "frozen") throw new Error("ed13-direction-bound-request-build-invalid:queue-boundary");
const workspace = readProjectWorkspace(appRoot);
const directionEnvelope = readVisualDirectionAuthority(appRoot);
if (!directionEnvelope) throw new Error("ed13-direction-bound-request-build-invalid:direction-authority-missing");
const requestedAt = new Date().toISOString();
const requests = ["ED-13-A", "ED-13-B"].map((selectedVariantId) => buildDirectionBoundImagegenRequest(workspace, directionEnvelope, {appRoot, shotId: "ED-13", selectedVariantId, requestedAt}));
fs.mkdirSync(path.join(outputRoot, "requests"), {recursive: true});
for (const request of requests) {
  const file = path.join(outputRoot, "requests", `${request.selectedVariantId.toLowerCase()}.json`);
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(request, null, 2)}\n`);
  fs.renameSync(temporary, file);
}
const index = {
  contract: "A1Ed13DirectionBoundCanaryRequestIndex/v1",
  status: "READY_FOR_BOUNDED_IMAGEGEN",
  shotId: "ED-13",
  directionAuthoritySha256: directionEnvelope.directionEnvelopeSha256,
  requests: requests.map((request) => ({selectedVariantId: request.selectedVariantId, requestId: request.requestId, requestSha256: request.requestSha256, optionalFusionMode: request.optionalFusion.mode, referenceIds: request.references.map((reference) => reference.id)})),
  boundary: {imageGenerationBudget: 2, generatedCount: 0, userVisualApproval: "NOT_APPROVED", motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false},
  generatedAt: requestedAt,
};
fs.writeFileSync(path.join(outputRoot, "request-index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify({status: index.status, outputRoot: path.relative(root, outputRoot), directionAuthoritySha256: index.directionAuthoritySha256, requests: index.requests, boundary: index.boundary}, null, 2));
