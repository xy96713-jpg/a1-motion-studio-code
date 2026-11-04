#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const incumbentManifestFile = path.join(generatedRoot, "editorial-shot-director-v1/candidate-v2/manifest.json");
const manifestFile = path.join(generatedRoot, "editorial-shot-director-v1/candidate-v3/manifest.json");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));
const workspace = readJson(workspaceFile);
const incumbent = readJson(incumbentManifestFile);
const manifest = readJson(manifestFile);
const failures = [];
const expectedPresenterIds = ["ED-01", "ED-07", "ED-13", "ED-19", "ED-31"];
const expectedScreenIds = ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06", "ED-20", "ED-21", "ED-22", "ED-23", "ED-24", "ED-25", "ED-26", "ED-27", "ED-28", "ED-29", "ED-30"];
const expectedPresenterGrammarCounts = {IDENTITY_LOCKUP: 1, QUESTION_ECHO: 1, CONTRAST_CORRECTION: 1, PROCESS_CLUSTER: 1, PROBLEM_TO_CONTROL: 1, KEYWORD_PUNCTUATION: 0};

const manifestBody = structuredClone(manifest);
delete manifestBody.manifestSha256;
if (sha256(manifestBody) !== manifest.manifestSha256) failures.push("MANIFEST_HASH_MISMATCH");
if (manifest.contract !== "A1EditorialShotDirectorStaticBoardCandidate/v3") failures.push("CANDIDATE_CONTRACT_NOT_V3");
if (manifest.director?.contract !== "A1EditorialShotDirector/v3" || manifest.director?.version !== 3 || manifest.director?.status !== "READY_FOR_STATIC_REVIEW_BUILD") failures.push("DIRECTOR_V3_NOT_READY");
if (manifest.sourceWorkspaceSha256 !== workspace.workspaceSha256 || manifest.sourceBoardSha256 !== workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256) failures.push("CANONICAL_SOURCE_DRIFT");
if (manifest.incumbentCandidate?.manifestSha256 !== incumbent.manifestSha256 || manifest.incumbentCandidate?.timelineBoardSha256 !== incumbent.boards.timeline.sha256) failures.push("INCUMBENT_V2_NOT_BOUND");
if (manifest.status !== "AGENT_LAYOUT_REVIEW_PASS_USER_APPROVAL_REQUIRED" || manifest.actualPixelReview !== "PASS") failures.push("ACTUAL_PIXEL_REVIEW_NOT_ADMITTED");
const pixelReviewLedgerFile = publicFile(manifest.pixelReviewLedger?.publicUrl);
if (!fs.existsSync(pixelReviewLedgerFile)) failures.push("PIXEL_REVIEW_LEDGER_MISSING");
else {
  const ledger = readJson(pixelReviewLedgerFile);
  const ledgerBody = structuredClone(ledger);
  delete ledgerBody.ledgerSha256;
  if (ledger.contract !== "A1PresenterSemanticMarkerPixelReviewLedger/v1" || ledger.ledgerSha256 !== sha256(ledgerBody) || manifest.pixelReviewLedger?.sha256 !== ledger.ledgerSha256 || ledger.actualPixelsViewed !== true || ledger.userVisualApproval !== "NOT_APPROVED") failures.push("PIXEL_REVIEW_LEDGER_INVALID");
}
if (manifest.shots?.length !== 34) failures.push("SHOT_COUNT_NOT_34");
if (manifest.director?.densityPolicy !== "NO_FIXED_GLOBAL_RATIO_SEMANTIC_EVENTS_ONLY") failures.push("FIXED_DENSITY_POLICY_FORBIDDEN");
for (const requiredRoute of ["SOURCE_WINDOW", "CROP_ANNOTATION", "SOURCE_COLLAGE"]) if (manifest.director?.routes?.[requiredRoute] !== requiredRoute) failures.push(`FORMAL_SOURCE_ROUTE_MISSING:${requiredRoute}`);
if (JSON.stringify(manifest.presenterMarkerGrammarCounts) !== JSON.stringify(expectedPresenterGrammarCounts)) failures.push("PRESENTER_GRAMMAR_COUNTS_INVALID");

const presenterSystem = manifest.presenterMarkerSystem;
if (presenterSystem?.classifierBasis !== "SOURCE_TEXT_SEMANTICS_NOT_SHOT_ID" || presenterSystem?.layoutBasis !== "AVAILABLE_REGION_AND_PROTECTED_GEOMETRY" || presenterSystem?.universalLayoutContract !== "A1PresenterSemanticMarkerLayout/v1" || presenterSystem?.perShotCoordinatesAllowed !== false || presenterSystem?.maximumCoverage !== 0.35) failures.push("PRESENTER_SYSTEM_POLICY_INVALID");
for (const forbidden of ["FULLSCREEN_PRESENTER_BACKGROUND", "PERSISTENT_PANEL", "FIXED_CORNER_TEMPLATE", "LONG_DECORATIVE_LINE", "HUD_ROLE_LABELS"]) if (!presenterSystem?.forbidden?.includes(forbidden)) failures.push(`PRESENTER_FORBIDDEN_POLICY_MISSING:${forbidden}`);
for (const shotId of expectedPresenterIds) {
  const shot = manifest.shots.find((item) => item.shotId === shotId);
  const proposal = presenterSystem?.proposals?.find((item) => item.shotId === shotId);
  const gate = manifest.incumbentBestEvidenceGate?.presenterShotGates?.find((item) => item.shotId === shotId);
  if (shot?.route !== "PRESENTER_LOCAL_MARKER" || !shot?.presenterMarker?.grammar) failures.push(`PRESENTER_MARKER_ROUTE_OR_GRAMMAR_MISSING:${shotId}`);
  if (shot?.presenterMarker?.classifierBasis !== "SOURCE_TEXT_SEMANTICS_NOT_SHOT_ID") failures.push(`PRESENTER_SHOT_ID_CLASSIFIER_FORBIDDEN:${shotId}`);
  if (shot?.presenterMarker?.persistentPanelAllowed !== false || shot?.presenterMarker?.fixedCornerTemplateAllowed !== false || shot?.presenterMarker?.longDecorativeLineAllowed !== false) failures.push(`PRESENTER_TEMPLATE_POLICY_BROKEN:${shotId}`);
  if (!proposal || proposal.actualPixelReview !== "PASS" || proposal.safetyAudit?.status !== "PASS") failures.push(`PRESENTER_PROPOSAL_NOT_REVIEWED_OR_SAFE:${shotId}`);
  if (proposal?.layout?.contract !== "A1PresenterSemanticMarkerLayout/v1" || proposal?.layout?.status !== "READY_FOR_STATIC_RENDER" || proposal?.layout?.layoutBasis !== "AVAILABLE_REGION_AND_PROTECTED_GEOMETRY" || !proposal?.selectedSafeRegion?.id) failures.push(`PRESENTER_UNIVERSAL_LAYOUT_NOT_BOUND:${shotId}`);
  if (proposal?.occupiedRatio > 0.35 || proposal?.safetyAudit?.faceOverlap !== false || proposal?.safetyAudit?.microphoneOverlap !== false) failures.push(`PRESENTER_SUBJECT_SAFETY_INVALID:${shotId}`);
  const proposalFile = publicFile(proposal?.publicUrl);
  if (!fs.existsSync(proposalFile) || sha256(fs.readFileSync(proposalFile)) !== proposal?.sha256) failures.push(`PRESENTER_PROPOSAL_PIXELS_INVALID:${shotId}`);
  if (gate?.contract !== "A1IncumbentBestEvidenceGate/v2" || gate?.comparison?.status !== "PASS" || gate?.decision !== "REPLACE_INCUMBENT") failures.push(`PRESENTER_INCUMBENT_GATE_NOT_STRICT_IMPROVEMENT:${shotId}`);
  if (shot?.preview?.sha256 !== proposal?.sha256 || shot?.selectionDecision !== "PROMOTE_PROPOSAL_INTO_REVIEW_ONLY_V3") failures.push(`PRESENTER_PROPOSAL_NOT_SELECTED:${shotId}`);
}

for (const incumbentShot of incumbent.shots || []) {
  if (expectedPresenterIds.includes(incumbentShot.shotId)) continue;
  const candidateShot = manifest.shots.find((shot) => shot.shotId === incumbentShot.shotId);
  if (candidateShot?.preview?.sha256 !== incumbentShot.preview?.sha256 || candidateShot?.pixelBytesUnchanged !== true) failures.push(`NON_PRESENTER_PIXEL_DRIFT:${incumbentShot.shotId}`);
}
if (JSON.stringify(manifest.inheritedScreenEvidence?.shotIds) !== JSON.stringify(expectedScreenIds) || manifest.inheritedScreenEvidence?.pixelsByteIdentical !== true) failures.push("SCREEN_EVIDENCE_INHERITANCE_INVALID");
if (manifest.inheritedScreenEvidence?.laneStatus !== "BLOCKED" || !manifest.inheritedScreenEvidence?.failures?.some((item) => String(item).startsWith("ED-20:source-evidence-coverage-partial"))) failures.push("ED20_PARTIAL_BOUNDARY_HIDDEN");
if (manifest.inheritedScreenEvidence?.ed20EvidenceBoundary?.coverage !== "PARTIAL" || manifest.inheritedScreenEvidence?.ed20EvidenceBoundary?.coverageComplete !== false) failures.push("ED20_PARTIAL_CLAIM_INVALID");

const ed14 = manifest.shots.find((shot) => shot.shotId === "ED-14");
const incumbentEd14 = incumbent.shots.find((shot) => shot.shotId === "ED-14");
if (ed14?.route !== "SOURCE_WINDOW" || ed14?.preview?.sha256 !== incumbentEd14?.preview?.sha256 || manifest.ed14?.pixelsByteIdenticalToCandidateV2 !== true) failures.push("ED14_CANDIDATE_V2_WINDOW_NOT_PRESERVED");
if (manifest.ed14?.sourceEvidenceBinding?.assetId !== "ed14-verified-acl-paper-source" || manifest.ed14?.oldPaperContentRestored !== false || manifest.ed14?.windowsEvidenceLanguagePreserved !== true) failures.push("ED14_SOURCE_OR_WINDOWS_LANGUAGE_BOUNDARY_INVALID");

for (const [name, board] of Object.entries(manifest.boards || {})) {
  const file = publicFile(board.publicUrl);
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== board.sha256) failures.push(`BOARD_INVALID:${name}`);
}
const comparison = manifest.incumbentBestEvidenceGate;
if (comparison?.automaticReplacementAllowed !== false || JSON.stringify(comparison?.changedShotIds) !== JSON.stringify(expectedPresenterIds) || comparison?.status !== "AGENT_RECOMMENDS_MIXED_BEST_PENDING_USER_APPROVAL") failures.push("INCUMBENT_COMPARISON_GATE_INCOMPLETE");
if (manifest.current !== false || manifest.userVisualApproval !== "NOT_APPROVED" || manifest.productionAdmission !== false || manifest.boundaries?.motionPerformed !== false || manifest.boundaries?.assemblyCreated !== false || manifest.boundaries?.resolveUsed !== false || manifest.boundaries?.finalRenderUsed !== false) failures.push("REVIEW_ONLY_BOUNDARY_BROKEN");

const report = {
  contract: "A1EditorialShotDirectorStaticBoardAudit/v3",
  status: failures.length ? "FAIL" : "PASS",
  failures,
  manifestSha256: manifest.manifestSha256,
  sourceWorkspaceSha256: manifest.sourceWorkspaceSha256,
  shotCount: manifest.shots?.length || 0,
  presenterMarkerShotCount: expectedPresenterIds.length,
  presenterMarkerGrammarCounts: manifest.presenterMarkerGrammarCounts,
  inheritedScreenShotCount: manifest.inheritedScreenEvidence?.shotIds?.length || 0,
  ed20EvidenceCoverage: manifest.inheritedScreenEvidence?.ed20EvidenceBoundary?.coverage || null,
  changedShotIds: comparison?.changedShotIds || [],
  boardShas: Object.fromEntries(Object.entries(manifest.boards || {}).map(([name, board]) => [name, board.sha256])),
  userVisualApproval: manifest.userVisualApproval,
  productionAdmission: manifest.productionAdmission,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
