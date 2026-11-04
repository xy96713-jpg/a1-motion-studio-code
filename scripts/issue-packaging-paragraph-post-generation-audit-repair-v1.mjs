#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {buildPackagingParagraphCanaryImplementationBinding} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-implementation-binding-v1.mjs";
import {assertPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";
import {createPackagingParagraphPostGenerationAuditRepair} from "../apps/studio-next/src/lib/a1-packaging-paragraph-objective-pixel-audit-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const artifactRoot = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const pack = assertPackagingParagraphCanaryRequestPack(JSON.parse(fs.readFileSync(path.join(artifactRoot, "packaging-paragraph-canary-request-pack.json"), "utf8")));
const preflightPath = path.join(artifactRoot, "packaging-paragraph-canary-preflight.json");
const reviewRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/packaging-paragraph-canary-review-v1", pack.source.canaryPlanSha256);
const manifest = JSON.parse(fs.readFileSync(path.join(reviewRoot, "manifest.json"), "utf8"));
const priorAuditPath = path.join(reviewRoot, "objective-pixel-audit-v1/objective-pixel-audit.json");
const priorAudit = JSON.parse(fs.readFileSync(priorAuditPath, "utf8"));
const preflightBytes = fs.readFileSync(preflightPath);
const preflight = JSON.parse(preflightBytes);
const currentImplementation = buildPackagingParagraphCanaryImplementationBinding(projectRoot);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const repair = createPackagingParagraphPostGenerationAuditRepair({
  source: {workspaceSha256: manifest.workspaceSha256, transitionSha256: manifest.transitionSha256, planSha256: manifest.planSha256, requestPackSha256: manifest.requestPackSha256, reviewBatchManifestSha256: manifest.manifestSha256, imagegenResultReceiptSha256: manifest.imagegenInput.resultReceiptSha256, authorizationReceiptSha256: manifest.authorizationReceiptSha256, previousImplementationSha256: manifest.implementationSha256, currentImplementationSha256: currentImplementation.implementationSha256, preflightFileSha256: sha256(preflightBytes), priorObjectivePixelAuditFileSha256: sha256(fs.readFileSync(priorAuditPath)), priorObjectivePixelAuditSha256: priorAudit.auditSha256},
  previousImplementationEntries: preflight.checks.find((check) => check.id === "IMPLEMENTATION_HASH_BINDING").evidence.entries,
  currentImplementation,
  mediaOutputs: manifest.outputs.map((output) => ({shotId: output.shotId, sha256: output.sha256, bytes: output.bytes})),
  issuedAt: new Date().toISOString(),
});
const outputRoot = path.join(artifactRoot, "packaging-paragraph-post-generation-audit-repairs");
const outputPath = path.join(outputRoot, `${pack.packSha256}.json`);
if (fs.existsSync(outputPath)) throw new Error("paragraph-post-generation-audit-repair-already-exists");
fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(repair, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
console.log(JSON.stringify({status: repair.status, outputPath, repairSha256: repair.repairSha256, previousImplementationSha256: repair.source.previousImplementationSha256, currentImplementationSha256: repair.source.currentImplementationSha256, implementationDiff: repair.implementationDiff, mediaRewriteAllowed: false, regenerationAllowed: false, recompositionAllowed: false, productionAdmitted: false}, null, 2));
