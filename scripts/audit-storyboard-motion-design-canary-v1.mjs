#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertMotionComponentBinding, auditThreePhasePreview, deriveStoryboardMotionDesignContract} from "../apps/studio-next/src/lib/a1-storyboard-motion-design-contract-v1.mjs";
import {auditMotionPrimitiveQuality, selectMotionPrimitiveBundle} from "../apps/studio-next/src/lib/a1-motion-primitive-registry-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const value = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
const shotId = value("--shot");
const sourceFile = path.resolve(root, value("--source") || "");
const implementationFile = path.resolve(root, value("--implementation") || "");
const outputFile = path.resolve(root, value("--out") || "");
const connectorOnly = value("--connector-only") === "true";
const decorativeOnly = value("--decorative-only") === "true";
const materialResponseCount = Number(value("--material-response-count") || 0);
const unmotivatedFrameCount = Number(value("--unmotivated-frame-count") || 0);
const floatingCardCount = Number(value("--floating-card-count") || 0);
const repeatedBorderChromeCount = Number(value("--repeated-border-chrome-count") || 0);
const holdParityTolerance = Number(value("--hold-parity-tolerance") || 0.001);
const videoRendered = value("--video-rendered") === "true";
const usedPrimitiveIds = String(value("--used-primitives") || "").split(",").map((item) => item.trim()).filter(Boolean);
const phaseFiles = Object.fromEntries(["setup", "action", "hold"].map((phase) => [phase, path.resolve(root, value(`--${phase}`) || "")]));
if (!shotId || !sourceFile.startsWith(root) || !implementationFile.startsWith(root) || !outputFile.startsWith(root) || Object.values(phaseFiles).some((file) => !file.startsWith(root))) throw new Error("motion-design-canary-arguments-invalid");
for (const file of [sourceFile, implementationFile, ...Object.values(phaseFiles)]) if (!fs.existsSync(file)) throw new Error(`motion-design-canary-file-missing:${path.relative(root, file)}`);

const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const shot = workspace.production?.shotIntelligence?.currentStoryboardAuthority?.shots?.find((item) => item.shotId === shotId && item.current !== false);
if (!shot) throw new Error("motion-design-canary-current-shot-required");
const entityPlatePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/source-cache/semantic-source-plates-v1/manifest.json");
const entityPlate = fs.existsSync(entityPlatePath) ? JSON.parse(fs.readFileSync(entityPlatePath, "utf8")) : null;
const exactIdentityBinding = entityPlate?.exactPixelRebindRequired === true && entityPlate.shotId === shot.shotId;
const contract = shot.motionDesignContract || deriveStoryboardMotionDesignContract(shot, {exactIdentityBinding, formalCopyRequired: exactIdentityBinding, independentGenerativeActor: shot.packageType === "EXPLAINER_PACKAGE" && !exactIdentityBinding && shot.source !== "REAL_SOURCE", visualActor: shot.semanticJob, semanticAction: shot.actionContract?.hold, geometryFingerprint: shot.artifactSha256});
if (shaFile(sourceFile) !== contract.source.artifactSha256) throw new Error("motion-design-canary-source-sha-stale");
assertMotionComponentBinding(contract, {versionId: shot.versionId, artifactSha256: shaFile(sourceFile), motionDesignSha256: contract.motionDesignSha256, geometryFingerprint: shaFile(sourceFile)});

const normalized = async (file) => sharp(file).resize(320, 180, {fit: "fill"}).removeAlpha().raw().toBuffer();
const delta = (left, right) => { let total = 0; for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]); return Number((total / left.length / 255).toFixed(6)); };
const changedPixelRatio = (left, right, threshold = 12) => { let changed = 0; const pixels = left.length / 3; for (let index = 0; index < left.length; index += 3) if (Math.max(Math.abs(left[index] - right[index]), Math.abs(left[index + 1] - right[index + 1]), Math.abs(left[index + 2] - right[index + 2])) >= threshold) changed += 1; return Number((changed / pixels).toFixed(6)); };
const [sourcePixels, setupPixels, actionPixels, holdPixels] = await Promise.all([sourceFile, phaseFiles.setup, phaseFiles.action, phaseFiles.hold].map(normalized));
const metrics = {setupActionDelta: delta(setupPixels, actionPixels), actionHoldDelta: delta(actionPixels, holdPixels), holdSourceParityDelta: delta(holdPixels, sourcePixels), primaryActorChangedPixelRatio: changedPixelRatio(setupPixels, actionPixels)};
const phases = Object.fromEntries(await Promise.all(Object.entries(phaseFiles).map(async ([phase, file]) => { const metadata = await sharp(file).metadata(); return [phase, {file: path.relative(root, file), sha256: shaFile(file), width: metadata.width, height: metadata.height, actualPixelReviewed: true}]; })));
const previewGate = auditThreePhasePreview(contract, phases);
const primitiveBundle = selectMotionPrimitiveBundle({route: shot.route, source: shot.source, exactIdentityBinding, formalCopyRequired: exactIdentityBinding, independentGenerativeActor: shot.packageType === "EXPLAINER_PACKAGE" && !exactIdentityBinding && shot.source !== "REAL_SOURCE"});
const primitiveGate = auditMotionPrimitiveQuality(primitiveBundle, {connectorOnly, decorativeOnly, unmotivatedFrameCount, floatingCardCount, repeatedBorderChromeCount, primaryActorAreaRatio: metrics.primaryActorChangedPixelRatio, semanticStateChangeCount: new Set(Object.values(phases).map((phase) => phase.sha256)).size - 1, materialResponseCount, finalStaticParity: metrics.holdSourceParityDelta <= holdParityTolerance, usedPrimitiveIds, hyperframesPreviewUsed: false, animationMapPassed: false});
const failures = [
  ...(previewGate.status === "PASS" ? [] : previewGate.failures),
  ...(primitiveGate.status === "PASS" ? [] : primitiveGate.failures),
  ...(metrics.setupActionDelta >= 0.005 ? [] : ["SETUP_ACTION_DELTA_TOO_LOW"]),
  ...(metrics.actionHoldDelta >= 0.005 ? [] : ["ACTION_HOLD_DELTA_TOO_LOW"]),
  ...(metrics.holdSourceParityDelta <= holdParityTolerance ? [] : ["HOLD_SOURCE_PARITY_FAILED"]),
];
const report = {contract: "A1StoryboardMotionDesignCanaryAudit/v1", status: failures.length ? "BLOCKED" : "PASS", shotId, source: {workspaceSha256: workspace.workspaceSha256, versionId: shot.versionId, artifactSha256: shot.artifactSha256, motionDesignSha256: contract.motionDesignSha256, primitiveBundleSha256: primitiveBundle.primitiveBundleSha256, geometryFingerprint: contract.geometryFingerprint, implementationFile: path.relative(root, implementationFile), implementationSha256: shaFile(implementationFile)}, executionRoute: contract.executionRoute, visualConstructionContract: contract.visualConstructionContract || null, choreographyBlueprint: contract.choreographyBlueprint, primitiveBundle: {profile: primitiveBundle.profile, primitiveIds: primitiveBundle.primitiveIds, choreographyBlueprint: primitiveBundle.choreographyBlueprint}, primitiveEvidence: {connectorOnly, decorativeOnly, materialResponseCount, unmotivatedFrameCount, floatingCardCount, repeatedBorderChromeCount, usedPrimitiveIds}, forbiddenTechniques: contract.forbiddenTechniques, phases, metrics: {...metrics, holdParityTolerance}, gates: {preview: previewGate, primitives: primitiveGate}, failures: [...new Set(failures)], boundary: {agentActualPixelReviewPerformed: true, userVisualApproval: "NOT_APPROVED", productionAdmission: false, videoRendered, workspaceMutationPerformed: false, authorityMutationPerformed: false}, auditedAt: new Date().toISOString()};
fs.mkdirSync(path.dirname(outputFile), {recursive: true});
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
