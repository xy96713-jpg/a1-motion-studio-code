#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {resolveActiveWorkSelectionV1} from "../apps/studio-next/src/lib/a1-active-work-selection-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const incumbentManifestFile = path.join(generatedRoot, "editorial-shot-director-v1/candidate-v1/manifest.json");
const manifestFile = path.join(generatedRoot, "editorial-shot-director-v1/candidate-v2/manifest.json");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const parkRecord = JSON.parse(fs.readFileSync(path.join(root,"work/system-maturity-consolidation-park-a-line-20260928.json"),"utf8"));
const researchPhase = JSON.parse(fs.readFileSync(path.join(root,".codex-artifacts/system-progress/current-phase.json"),"utf8"));
const formalPhase = JSON.parse(fs.readFileSync(path.join(root,".codex-artifacts/system-progress-system-line/current-phase.json"),"utf8"));
const selection=resolveActiveWorkSelectionV1({parkRecord,researchPhase,formalPhase,
  planExists:fs.existsSync(path.join(root,parkRecord.activeLine.planPath)),runtimeExists:fs.existsSync(path.join(root,parkRecord.activeLine.runtimeStatePath))});
if(selection.status==='PASS'&&selection.active?.taskId==='hupo-69-shot-reconstruction-v1'
  &&selection.parkedProduction.id==='editorial-asset-workbench-v1'&&selection.parkedProduction.status==='PARKED_PENDING_USER_APPROVAL'){
  console.log(JSON.stringify({contract:"A1EditorialShotDirectorStaticBoardAudit/v2",status:"SKIPPED_NOT_CURRENT",
    activeTaskId:selection.active.taskId,parkedProduction:selection.parkedProduction,failures:[],reviewFindings:["FORMAL_34_SHOT_LINE_PARKED_UNCHANGED"],
    userVisualApproval:"NOT_APPROVED",productionAdmission:false},null,2));
  process.exit(0);
}
const workspace = JSON.parse(fs.readFileSync(workspaceFile, "utf8"));
const incumbentManifest = JSON.parse(fs.readFileSync(incumbentManifestFile, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const failures = [];
const reviewFindings = [];
const expectedScreenIds = ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06", "ED-20", "ED-21", "ED-22", "ED-23", "ED-24", "ED-25", "ED-26", "ED-27", "ED-28", "ED-29", "ED-30"];
const manifestBody = structuredClone(manifest);
delete manifestBody.manifestSha256;
if (sha256(manifestBody) !== manifest.manifestSha256) failures.push("MANIFEST_HASH_MISMATCH");
if (manifest.sourceWorkspaceSha256 !== workspace.workspaceSha256) {
  const currentLifecycle = workspace.production?.packagingLifecycleProjection?.status;
  const articleAssetQaCurrent = workspace.production?.authority?.currentStage === "article-assets"
    && workspace.production?.authority?.nextAction?.id === "automatic-article-packaging-qa";
  const paletteBindingRepairCurrent = workspace.production?.authority?.currentStage === "creator-packaging-palette-binding-repair-required"
    || currentLifecycle === "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED";
  if (articleAssetQaCurrent || paletteBindingRepairCurrent || ["CANONICAL_TITLE_REPAIR_PENDING", "CANONICAL_TITLE_REPAIR_BINDING_REQUIRED", "CANONICAL_TITLE_REPAIR_GENERATING"].includes(currentLifecycle)) reviewFindings.push("SOURCE_WORKSPACE_DRIFT_REVIEW_ONLY_CANDIDATE_STALE");
  else failures.push("SOURCE_WORKSPACE_DRIFT");
}
if (manifest.contract !== "A1EditorialShotDirectorStaticBoardCandidate/v2") failures.push("CANDIDATE_CONTRACT_NOT_V2");
if (manifest.director?.contract !== "A1EditorialShotDirector/v2" || manifest.director?.status !== "READY_FOR_STATIC_REVIEW_BUILD") failures.push("DIRECTOR_NOT_READY");
if (manifest.director?.densityPolicy !== "NO_FIXED_GLOBAL_RATIO_SEMANTIC_EVENTS_ONLY") failures.push("FIXED_DENSITY_POLICY_FORBIDDEN");
if (manifest.shots?.length !== 34) failures.push("SHOT_COUNT_NOT_34");
if (JSON.stringify(manifest.screenFocusShotIds) !== JSON.stringify(expectedScreenIds)) failures.push("SCREEN_FOCUS_SHOT_SET_MISMATCH");
for (const shotId of expectedScreenIds) {
  const shot = manifest.shots.find((item) => item.shotId === shotId);
  if (shot?.route !== "SCREEN_FOCUS") failures.push(`SCREEN_FOCUS_ROUTE_MISSING:${shotId}`);
  const previewFile = path.join(publicRoot, String(shot?.preview?.publicUrl || "").replace(/^\//u, ""));
  if (!fs.existsSync(previewFile) || sha256(fs.readFileSync(previewFile)) !== shot?.preview?.sha256) failures.push(`SCREEN_FOCUS_PIXELS_INVALID:${shotId}`);
  for (const requirement of ["zoomRegion", "mouseTarget", "underline", "beforeState", "afterState", "stateRail"]) if (shot?.preview?.annotations?.[requirement] !== true) failures.push(`SCREEN_FOCUS_ANNOTATION_MISSING:${shotId}:${requirement}`);
  if (!Object.values(manifest.director.screenActionGrammars || {}).includes(shot?.screenAction?.grammar)) failures.push(`SCREEN_ACTION_GRAMMAR_INVALID:${shotId}`);
  const compareGrammar = shot?.screenAction?.grammar === "COMPARE_BEFORE_AFTER";
  if (shot?.preview?.annotations?.beforeInset !== compareGrammar || shot?.screenAction?.beforeInsetAllowed !== compareGrammar) failures.push(`SCREEN_BEFORE_INSET_POLICY_INVALID:${shotId}`);
  if (shot?.preview?.beforeStatePresentation !== (compareGrammar ? "ADAPTIVE_BEFORE_INSET" : "STATE_RAIL_ONLY")) failures.push(`SCREEN_BEFORE_STATE_PRESENTATION_INVALID:${shotId}`);
  if (shot?.preview?.genericOneStyleTemplateUsed !== false) failures.push(`GENERIC_SCREEN_TEMPLATE_NOT_REJECTED:${shotId}`);
  if (shot?.preview?.sourcePixelsPreserved !== true || shot?.preview?.syntheticCursorAdded !== false) failures.push(`SCREEN_FOCUS_SOURCE_SAFETY:${shotId}`);
}
const expectedGrammarCounts = {SELECT_FOCUS: 2, EDIT_REPLACE: 5, COMPARE_BEFORE_AFTER: 2, CONFIRM_RESULT: 7};
if (JSON.stringify(manifest.screenActionGrammarCounts) !== JSON.stringify(expectedGrammarCounts)) failures.push("SCREEN_ACTION_GRAMMAR_COUNTS_INVALID");
if (manifest.incumbentCandidate?.manifestSha256 !== incumbentManifest.manifestSha256 || manifest.incumbentBestEvidenceGate?.incumbentBoardSha256 !== incumbentManifest.boards?.timeline?.sha256) failures.push("INCUMBENT_V1_NOT_BOUND");
for (const incumbentShot of incumbentManifest.shots || []) {
  if (expectedScreenIds.includes(incumbentShot.shotId)) continue;
  const candidateShot = manifest.shots.find((shot) => shot.shotId === incumbentShot.shotId);
  if (candidateShot?.preview?.sha256 !== incumbentShot?.preview?.sha256) failures.push(`NON_SCREEN_INCUMBENT_PIXEL_DRIFT:${incumbentShot.shotId}`);
}
for (const [name, board] of Object.entries(manifest.boards || {})) {
  const file = path.join(publicRoot, String(board.publicUrl || "").replace(/^\//u, ""));
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== board.sha256) failures.push(`BOARD_INVALID:${name}`);
}
const ed14 = manifest.shots.find((shot) => shot.shotId === "ED-14");
const currentEd14 = workspace.production.shotIntelligence.wholeFilmStaticBoard.items.find((shot) => shot.shotId === "ED-14");
if (ed14?.route !== "SOURCE_WINDOW" || ed14?.preview?.sha256 !== currentEd14?.artifactSha256) failures.push("ED14_CURRENT_ACL_WINDOW_NOT_PRESERVED");
if (manifest.ed14?.sourceEvidenceBinding?.assetId !== "ed14-verified-acl-paper-source" || manifest.ed14?.oldPaperContentRestored !== false) failures.push("ED14_SOURCE_BINDING_OR_CONTENT_BOUNDARY_INVALID");
const comparison = manifest.incumbentBestEvidenceGate;
if (comparison?.automaticReplacementAllowed !== false || comparison?.screenShotGates?.length !== expectedScreenIds.length) failures.push("INCUMBENT_COMPARISON_GATE_INCOMPLETE");
if ((comparison?.screenShotGates || []).some((gate) => gate.contract !== "A1IncumbentBestEvidenceGate/v2" || gate.comparison?.status !== "PASS" || gate.decision !== "REPLACE_INCUMBENT")) failures.push("SCREEN_COMPARISON_NOT_STRICTLY_BETTER");
if (manifest.userVisualApproval !== "NOT_APPROVED" || manifest.productionAdmission !== false || manifest.boundaries?.motionPerformed !== false || manifest.boundaries?.assemblyCreated !== false) failures.push("REVIEW_BOUNDARY_BROKEN");
const report = {
  contract: "A1EditorialShotDirectorStaticBoardAudit/v2",
  status: failures.length ? "FAIL" : "PASS",
  failures,
  reviewFindings,
  manifestSha256: manifest.manifestSha256,
  sourceWorkspaceSha256: manifest.sourceWorkspaceSha256,
  shotCount: manifest.shots?.length || 0,
  screenFocusShotCount: manifest.screenFocusShotIds?.length || 0,
  routeCounts: manifest.routeCounts,
  screenActionGrammarCounts: manifest.screenActionGrammarCounts,
  boardShas: Object.fromEntries(Object.entries(manifest.boards || {}).map(([name, board]) => [name, board.sha256])),
  incumbentComparisonStatus: comparison?.status || null,
  userVisualApproval: manifest.userVisualApproval,
  productionAdmission: manifest.productionAdmission,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
