#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileVideoShotcraftAdapterRequest, selectVideoShotcraftRecipes} from "../apps/studio-next/src/lib/a1-video-shotcraft-library-v1.mjs";
import {deriveVideoShotcraftContextFromStoryboardShot} from "../apps/studio-next/src/lib/a1-video-shotcraft-storyboard-context-v1.mjs";
import {compileScreenPostEditReceipt, compileScreenSourceBehaviorManifestFromStoryboardShot, toSourceBehaviorFidelityInput} from "../apps/studio-next/src/lib/a1-screen-source-behavior-manifest-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workRoot = path.join(root, "work/video-shotcraft-current-storyboard-dry-run-v1");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/video-shotcraft-catalog-v1.json"), "utf8"));
const shaBuffer = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const sha = (file) => shaBuffer(fs.readFileSync(file));
const workspaceShaBefore = sha(workspacePath), currentPhaseShaBefore = sha(currentPhasePath);
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const authority = workspace.production?.shotIntelligence?.currentStoryboardAuthority;
if (authority?.contract !== "A1CurrentStoryboardAuthority/v1" || authority.current !== true || authority.shots?.length !== 34) throw new Error("current-34-shot-storyboard-required");

const screenSourceProof = (shot) => {
  const captured = shot.motionReviewPlan?.capturedSource || {};
  const sourcePath = captured.path ? path.join(root, captured.path) : null;
  const exists = Boolean(sourcePath && fs.existsSync(sourcePath));
  const actualSha256 = exists ? sha(sourcePath) : null;
  return {path: captured.path || null, declaredSha256: captured.sha256 || null, actualSha256, exists, verified: exists && actualSha256 === captured.sha256 && captured.shaMatches === true};
};

const receipts = authority.shots.sort((left, right) => left.order - right.order).map((shot) => {
  const projection = deriveVideoShotcraftContextFromStoryboardShot(shot);
  const sourceProof = shot.route === "SCREEN_EVIDENCE" ? screenSourceProof(shot) : null;
  if (projection.disposition === "SKIP_SOURCE_LED") return {shotId: shot.shotId, order: shot.order, route: shot.route, genre: shot.route === "SCREEN_EVIDENCE" ? "product-tutorial" : "personal-opinion", disposition: "SKIP_SOURCE_LED", reason: projection.reason, intentId: null, selectedRecipeId: null, adapterStatus: null, sourceProof, blockers: []};
  const selection = selectVideoShotcraftRecipes(catalog, {...projection.context, limit: 5});
  const blockers = [...selection.failures];
  if (sourceProof && !sourceProof.verified) blockers.push("CURRENT_SCREEN_SOURCE_SHA_REQUIRED");
  let adapterRequest = null;
  let behaviorManifest = null;
  let editReceipt = null;
  if (selection.status === "SELECTED_EXISTING_RECIPE" && !blockers.length) {
    const captured = shot.motionReviewPlan?.capturedSource || {};
    const camera = shot.screenStoryboard?.cameraDirection || {};
    const sourceWidth = Number(captured.width || 0), sourceHeight = Number(captured.height || 0);
    const safeCropVerified = sourceWidth > 0 && sourceHeight > 0 ? Math.abs((sourceWidth / sourceHeight) / (16 / 9) - 1) <= .12 : false;
    let behaviorFidelity = null;
    if (shot.route === "SCREEN_EVIDENCE") {
      try {
        behaviorManifest = compileScreenSourceBehaviorManifestFromStoryboardShot(shot);
        const appliedEffects = selection.screenPostAdaptation?.appliedEffects || [];
        const cursorOverlayMode = appliedEffects.includes("TELEMETRY_CURSOR_SMOOTH") ? "TELEMETRY_BOUND_TRANSIENT" : "NONE";
        editReceipt = compileScreenPostEditReceipt(behaviorManifest, {appliedEffects, cursorOverlayMode});
        behaviorFidelity = toSourceBehaviorFidelityInput(behaviorManifest, editReceipt);
      } catch (error) {
        blockers.push(`SOURCE_BEHAVIOR_MANIFEST:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!blockers.length) adapterRequest = compileVideoShotcraftAdapterRequest({
      selection,
      sourceBinding: {versionId: shot.versionId, artifactSha256: shot.route === "SCREEN_EVIDENCE" ? captured.sha256 : shot.artifactSha256},
      slots: shot.route === "SCREEN_EVIDENCE" ? {sourceType: "REAL_SCREEN_RECORDING", sourceWidth, sourceHeight, cursorTelemetryBound: projection.context.evidence.cursorTelemetry === true, targetGeometryVerified: camera.resultTargetAdmission?.status === "PASS", safeCropVerified, cursorVisibleInFinalAllowed: shot.screenStoryboard?.presentationPolicy?.cursorInFinalAllowed === true, clickRingsAllowed: shot.screenStoryboard?.presentationPolicy?.clickRingsAllowed === true} : {sourceType: "CURRENT_STORYBOARD_STATIC", sourceWidth: 0, sourceHeight: 0, safeCropVerified: true},
      output: {width: 1920, height: 1080},
      requestedScale: shot.route === "SCREEN_EVIDENCE" ? Math.min(1.18, Number(camera.maximumScale || 1)) : null,
      behaviorFidelity,
    });
    if (adapterRequest && adapterRequest.status !== "READY") blockers.push(...adapterRequest.failures);
  }
  const behaviorFidelityBlocked=blockers.some((failure)=>String(failure).startsWith("SOURCE_BEHAVIOR_FIDELITY:"));
  const disposition = projection.disposition === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED_UNRESOLVED_INTENT"
    : behaviorFidelityBlocked ? "BLOCKED_SOURCE_BEHAVIOR_FIDELITY"
      : blockers.length ? "BLOCKED_REQUIRED_EVIDENCE"
    : selection.status === "SELECTED_EXISTING_RECIPE" && adapterRequest?.status === "READY" ? "SELECTED_RECIPE"
      : selection.status;
  return {shotId: shot.shotId, order: shot.order, route: shot.route, genre: projection.context.genre, disposition, reason: projection.reason, intentId: selection.intent.intentId, intentSource: selection.intent.source, selectedRecipeId: selection.selectedRecipeId, selectedStyleKey: selection.selectedStyleKey, adapterRecipeId: adapterRequest?.recipe?.id || null, adapterStyleKey: adapterRequest?.recipe?.styleKey || null, screenPostSafetyScope: adapterRequest?.adaptation?.screenPostSafety?.scope || null, runtimeAdapterId:adapterRequest?.execution?.runtimeAdapterId||null,runtimeBindingSha256:adapterRequest?.adaptation?.runtimeBinding?.bindingSha256||null,runtimeComponentPath:adapterRequest?.adaptation?.runtimeBinding?.runtime?.componentPath||null,directorTechnique:adapterRequest?.adaptation?.screenDirectorDecision?.technique||null,directorReason:adapterRequest?.adaptation?.screenDirectorDecision?.reason||null,predictedDriftPx:adapterRequest?.adaptation?.screenDirectorDecision?.sourceAnalysis?.predictedCenterDriftMagnitudePx??null,directorDecisionSha256:adapterRequest?.adaptation?.screenDirectorDecision?.directorDecisionSha256||null, selectionSha256: selection.selectionSha256, adapterStatus: adapterRequest?.status || null, adapterRequestSha256: adapterRequest?.requestSha256 || null, sourceBehaviorManifestSha256: behaviorManifest?.behaviorManifestSha256 || null, editReceiptSha256: editReceipt?.editReceiptSha256 || null, sourceBehaviorFidelitySha256: adapterRequest?.adaptation?.sourceBehaviorFidelity?.fidelitySha256 || null, fitPolicy: adapterRequest?.fitPolicy || null, sourceProof, blockers, topCandidates: selection.candidates.slice(0, 3).map((candidate) => ({recipeId: candidate.recipeId, score: candidate.score, executable: candidate.executable, intentCompatible: candidate.intentCompatible, blockers: candidate.blockers}))};
});

const allowed = new Set(["SELECTED_RECIPE", "SKIP_SOURCE_LED", "BLOCKED_REQUIRED_EVIDENCE", "BLOCKED_SOURCE_BEHAVIOR_FIDELITY", "BLOCKED_NO_INTENT_MATCH", "REVIEW_REQUIRED_UNRESOLVED_INTENT"]);
const failures = [];
if (receipts.length !== 34) failures.push(`SHOT_COVERAGE:${receipts.length}`);
if (receipts.some((receipt) => !allowed.has(receipt.disposition))) failures.push("INVALID_DISPOSITION");
if (receipts.some((receipt) => receipt.disposition === "SELECTED_RECIPE" && (!receipt.intentId || !receipt.selectedRecipeId || receipt.adapterStatus !== "READY"))) failures.push("SELECTED_RECEIPT_INCOMPLETE");
if (receipts.some((receipt) => receipt.disposition.includes("BLOCKED") && !receipt.blockers.length)) failures.push("BLOCKED_RECEIPT_WITHOUT_REASON");
const screenReceipts = receipts.filter((receipt) => receipt.route === "SCREEN_EVIDENCE");
if (screenReceipts.some((receipt) => receipt.disposition === "SELECTED_RECIPE" && receipt.sourceProof?.verified !== true)) failures.push("UNVERIFIED_SCREEN_SOURCE_SELECTED");
if (screenReceipts.some((receipt) => receipt.disposition === "SELECTED_RECIPE" && (!receipt.runtimeAdapterId || !/^[a-f0-9]{64}$/u.test(String(receipt.runtimeBindingSha256 || ""))))) failures.push("SCREEN_RUNTIME_BINDING_REQUIRED");

const colors = {SELECTED_RECIPE: "#4ee0a0", SKIP_SOURCE_LED: "#89939d", BLOCKED_REQUIRED_EVIDENCE: "#ff7d91", BLOCKED_SOURCE_BEHAVIOR_FIDELITY:"#ff5577", BLOCKED_NO_INTENT_MATCH: "#ff7d91", REVIEW_REQUIRED_UNRESOLVED_INTENT: "#ffba66"};
const row = (receipt, index) => {
  const column = index < 17 ? 0 : 1, local = index % 17, x = 28 + column * 724, y = 112 + local * 42;
  const result = receipt.selectedRecipeId || (receipt.reason === "NATIVE_FULL_STATE_ACTION_ALREADY_DIRECTS_ATTENTION" ? "native full-state action" : receipt.reason === "PRESENTER_SOURCE_IS_PRIMARY_ACTION" ? "presenter source only" : receipt.reason === "NO_SAFE_REUSABLE_INTENT" ? "director decision needed" : receipt.reason);
  return `<g transform="translate(${x} ${y})"><rect width="696" height="34" rx="8" fill="#151a20" stroke="#28313a"/><text x="12" y="22" fill="#f4f6f8" font-size="13" font-weight="700">${receipt.shotId}</text><text x="72" y="22" fill="${colors[receipt.disposition] || "#fff"}" font-size="12" font-family="monospace">${receipt.disposition}</text><text x="318" y="22" fill="#aab4be" font-size="12">${receipt.intentId || "—"}</text><text x="478" y="22" fill="${colors[receipt.disposition] || "#fff"}" font-size="12">${result}</text></g>`;
};
const counts = Object.fromEntries([...allowed].map((key) => [key, receipts.filter((receipt) => receipt.disposition === key).length]));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1480" height="860" viewBox="0 0 1480 860"><rect width="1480" height="860" fill="#0b0e12"/><text x="28" y="46" fill="#f4f6f8" font-size="28" font-weight="800">Current storyboard × Shotcraft dry-run</text><text x="28" y="75" fill="#8f9aa5" font-size="15">34/34 receipts · selected ${counts.SELECTED_RECIPE} · source-led skip ${counts.SKIP_SOURCE_LED} · review ${counts.REVIEW_REQUIRED_UNRESOLVED_INTENT} · fidelity block ${counts.BLOCKED_SOURCE_BEHAVIOR_FIDELITY} · other block ${counts.BLOCKED_REQUIRED_EVIDENCE + counts.BLOCKED_NO_INTENT_MATCH}</text>${receipts.map(row).join("")}<text x="28" y="842" fill="#8f9aa5" font-size="13">Read-only selection evidence — no rendering, no storyboard mutation, productionAdmission=false</text></svg>`;
fs.mkdirSync(workRoot, {recursive: true});
fs.writeFileSync(path.join(workRoot, "storyboard-selection-board.svg"), svg);
const workspaceShaAfter = sha(workspacePath), currentPhaseShaAfter = sha(currentPhasePath);
if (workspaceShaBefore !== workspaceShaAfter) failures.push("WORKSPACE_MUTATION");
if (currentPhaseShaBefore !== currentPhaseShaAfter) failures.push("CURRENT_PHASE_MUTATION");
const fixtureStatus = (genre) => receipts.some((receipt) => receipt.genre === genre) && receipts.filter((receipt) => receipt.genre === genre).every((receipt) => allowed.has(receipt.disposition));
const body = {contract: "A1CurrentStoryboardVideoShotcraftDryRunAudit/v1", status: failures.length ? "FAIL" : "PASS", source: {authorityContract: authority.contract, storyboardRevisionSha256: authority.lastRevisionSha256, shotCount: authority.shots.length, catalogSha256: catalog.catalogSha256}, summary: {shotCount: receipts.length, counts, screenShotCount: screenReceipts.length, screenSourceVerifiedCount: screenReceipts.filter((receipt) => receipt.sourceProof?.verified).length, safeReceiptCount: receipts.filter((receipt) => allowed.has(receipt.disposition)).length}, shots: receipts, fixtures: [{id:"current-product-tutorial",genre:"product-tutorial",status:fixtureStatus("product-tutorial")?"PASS":"FAIL"},{id:"current-evidence-explainer",genre:"evidence-explainer",status:fixtureStatus("evidence-explainer")?"PASS":"FAIL"},{id:"current-personal-opinion",genre:"personal-opinion",status:fixtureStatus("personal-opinion")?"PASS":"FAIL"}], checks: {allCurrentShotsCovered: receipts.length === 34, onlySafeDispositions: receipts.every((receipt) => allowed.has(receipt.disposition)), selectedReceiptsComplete: !receipts.some((receipt) => receipt.disposition === "SELECTED_RECIPE" && (!receipt.selectedRecipeId || receipt.adapterStatus !== "READY")), screenSourcesShaVerifiedBeforeSelection: !screenReceipts.some((receipt) => receipt.disposition === "SELECTED_RECIPE" && receipt.sourceProof?.verified !== true), unresolvedIntentsHeldForReview: !receipts.some((receipt) => receipt.disposition === "REVIEW_REQUIRED_UNRESOLVED_INTENT" && receipt.selectedRecipeId), sourceLedPresenterSkipped: receipts.filter((receipt)=>receipt.route==="PRESENTER_BASE").every((receipt)=>receipt.disposition==="SKIP_SOURCE_LED"), renderPerformed: false, workspaceAndCurrentPhaseUnchanged: workspaceShaBefore === workspaceShaAfter && currentPhaseShaBefore === currentPhaseShaAfter}, visibleProof: {path: "work/video-shotcraft-current-storyboard-dry-run-v1/storyboard-selection-board.svg", sha256: shaBuffer(Buffer.from(svg)), width: 1480, height: 860}, boundary: {reviewOnly: true, renderPerformed: false, productionAdmission: false, currentStoryboardMutationPerformed: false, workspaceShaBefore, workspaceShaAfter, currentPhaseShaBefore, currentPhaseShaAfter}, failures, generatedAt: new Date().toISOString()};
body.auditSha256 = shaBuffer(Buffer.from(JSON.stringify(body)));
fs.writeFileSync(path.join(workRoot, "audit-report.json"), `${JSON.stringify(body, null, 2)}\n`);
console.log(JSON.stringify({status: body.status, summary: body.summary, fixtures: body.fixtures, visibleProof: body.visibleProof, reviewRequired: receipts.filter((receipt)=>receipt.disposition==="REVIEW_REQUIRED_UNRESOLVED_INTENT").map((receipt)=>receipt.shotId), blocked: receipts.filter((receipt)=>receipt.disposition.includes("BLOCKED")).map((receipt)=>({shotId:receipt.shotId,blockers:receipt.blockers})), failures}, null, 2));
if (failures.length) process.exitCode = 1;
