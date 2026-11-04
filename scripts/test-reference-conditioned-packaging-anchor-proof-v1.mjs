#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phase = "generated/system-line/editorial-asset-workbench-v1/reference-conditioned-imagegen-v1";
const publicDir = path.join(publicRoot, phase);
const required = ["packaging-event-01", "packaging-event-02", "packaging-event-03"];
const fail = (message) => { throw new Error(message); };
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const proof = workspace.production.packagingAnchorProof;
if (!proof || proof.contract !== "A1ReferenceConditionedPackagingAnchorProof/v1") fail("reference-conditioned-proof-contract-missing");
if (proof.status !== "READY_FOR_REVIEW" || proof.visualStatus !== "READY_FOR_REVIEW" || proof.visualApproval !== "PENDING_USER_REVIEW") fail("reference-conditioned-proof-status-mismatch");
if (proof.route !== "reference-conditioned-imagegen-plus-editable-compositor") fail("reference-conditioned-proof-route-missing");
if (proof.criticPerformed || proof.motionPreviewPerformed || proof.fullFilmRenderPerformed) fail("reference-conditioned-proof-heavy-work-must-be-false");
if (workspace.production.generation.summary.queued !== 0 || workspace.production.generation.summary.running !== 0 || workspace.production.generation.workerStatus !== "frozen") fail("reference-conditioned-proof-queue-not-frozen");
if (JSON.stringify(proof.eventIds) !== JSON.stringify(required)) fail("reference-conditioned-proof-event-order-mismatch");
if (!proof.comparisonProofPublicUrl || !fs.existsSync(path.join(publicRoot, proof.comparisonProofPublicUrl.replace(/^\//u, "")))) fail("comparison-proof-missing");
const manifestFile = path.join(publicDir, "imagegen-manifest.json");
if (!fs.existsSync(manifestFile)) fail("imagegen-manifest-missing");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
for (const eventId of required) {
  const anchor = proof.anchors?.find((candidate) => candidate.eventId === eventId);
  if (!anchor) fail(`anchor-missing:${eventId}`);
  if (!anchor.imagegenMaster || anchor.imagegenMaster.status !== "IMAGEGEN_STYLE_MASTER_READY" || anchor.imagegenMaster.generatedReadableText) fail(`imagegen-material-contract:${eventId}`);
  if (!anchor.editableText || !anchor.editableTextSpecPublicUrl || !anchor.fontBindings?.every((font) => font.sha256)) fail(`editable-text-contract:${eventId}`);
  if (anchor.cleanOutputDebugLabels?.length) fail(`debug-label-in-clean-output:${eventId}`);
  const cleanPath = path.join(publicRoot, anchor.publicUrl.replace(/^\//u, ""));
  const specPath = path.join(publicRoot, anchor.editableTextSpecPublicUrl.replace(/^\//u, ""));
  if (!fs.existsSync(cleanPath) || !fs.existsSync(specPath)) fail(`anchor-artifacts-missing:${eventId}`);
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  if (!spec.nodes?.length || spec.nodes.some((node) => !node.fontSha256 || !node.geometry || !node.semanticRole)) fail(`editable-text-spec-incomplete:${eventId}`);
  const entry = manifest.anchors?.find((candidate) => candidate.eventId === eventId);
  if (!entry || !entry.attempts?.length || entry.attempts[entry.attempts.length - 1].status !== "IMAGEGEN_STYLE_MASTER_READY") fail(`imagegen-attempt-record-missing:${eventId}`);
  if (entry.attempts.length > 2) fail(`imagegen-attempt-limit:${eventId}`);
}
if (new Set(proof.anchors.map((anchor) => anchor.fingerprint)).size !== required.length) fail("anchor-fingerprint-duplicate");
console.log(JSON.stringify({status: "PASS", contract: proof.contract, eventIds: proof.eventIds, route: proof.route, visualStatus: proof.visualStatus, queue: workspace.production.generation.summary, worker: workspace.production.generation.workerStatus}, null, 2));
