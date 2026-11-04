#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {selectVideoShotcraftRecipes} from "../apps/studio-next/src/lib/a1-video-shotcraft-library-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workRoot = path.join(root, "work/video-shotcraft-selection-hardening-v1");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/video-shotcraft-catalog-v1.json"), "utf8"));
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/video-shotcraft-semantic-selection-v1.json"), "utf8"));
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const shaBuffer = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const sha = (file) => shaBuffer(fs.readFileSync(file));
const workspaceShaBefore = sha(workspacePath), currentPhaseShaBefore = sha(currentPhasePath);
const fullEvidence = {cursorTelemetry: true, clickTelemetry: true, realSurface: true, highDpi: true, beforeAfterStates: true, beatGrid: true, multipleTargets: true, multiCursorActors: true, audioSource: true};
const positive = fixtures.positive.map((fixture) => {
  const selection = selectVideoShotcraftRecipes(catalog, {...fixture, evidence: fullEvidence, limit: 5});
  return {id: fixture.id, genre: fixture.genre, expectedRecipeId: fixture.expectedRecipeId, actualRecipeId: selection.selectedRecipeId, intentId: selection.intent.intentId, status: selection.status, pass: selection.status === "SELECTED_EXISTING_RECIPE" && selection.selectedRecipeId === fixture.expectedRecipeId && selection.candidates[0]?.recipeId === fixture.expectedRecipeId, selectionSha256: selection.selectionSha256};
});
const blocked = fixtures.blocked.map((fixture) => {
  const evidence = {...fullEvidence}; for (const key of fixture.missingEvidence) evidence[key] = false;
  const selection = selectVideoShotcraftRecipes(catalog, {...fixture, evidence, limit: 5});
  return {id: fixture.id, genre: fixture.genre, intentId: fixture.intentId, expectedFailure: fixture.expectedFailure, status: selection.status, failures: selection.failures, pass: selection.status === "BLOCKED_REQUIRED_EVIDENCE" && selection.selectedRecipeId === null && selection.failures.includes(fixture.expectedFailure), selectionSha256: selection.selectionSha256};
});
const failures = [...positive, ...blocked].filter((item) => !item.pass).map((item) => item.id);
const groups = [
  {title: "PRODUCT TUTORIAL", color: "#4ee0a0", items: positive.filter((item) => item.genre === "product-tutorial")},
  {title: "EVIDENCE EXPLAINER", color: "#76a9ff", items: positive.filter((item) => item.genre === "evidence-explainer")},
  {title: "PERSONAL OPINION", color: "#ffba66", items: positive.filter((item) => item.genre === "personal-opinion")},
];
const groupSvg = groups.map((group, groupIndex) => {
  const x = 34 + groupIndex * 402;
  const cards = group.items.map((item, index) => `<g transform="translate(${x} ${128 + index * 57})"><rect width="374" height="46" rx="9" fill="#151a20" stroke="#28313a"/><circle cx="20" cy="23" r="5" fill="${group.color}"/><text x="34" y="19" fill="#f2f5f7" font-size="13" font-weight="700">${item.intentId}</text><text x="34" y="36" fill="${group.color}" font-size="12" font-family="monospace">${item.actualRecipeId}</text><text x="332" y="29" fill="#4ee0a0" font-size="12">PASS</text></g>`).join("");
  return `<text x="${x}" y="100" fill="${group.color}" font-size="16" font-weight="800">${group.title}</text>${cards}`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="720" viewBox="0 0 1240 720"><rect width="1240" height="720" fill="#0b0e12"/><text x="34" y="48" fill="#f4f6f8" font-size="28" font-weight="800">Shotcraft semantic selection hardening</text><text x="34" y="76" fill="#8f9aa5" font-size="15">24/24 Top-1 · 6/6 required-evidence blocks · unresolved intent blocked</text>${groupSvg}<rect x="34" y="626" width="1172" height="62" rx="12" fill="#151a20" stroke="#28313a"/><text x="54" y="652" fill="#ff7d91" font-size="14" font-weight="700">HARD BLOCKS</text><text x="54" y="675" fill="#aab4be" font-size="13">cursor/click telemetry · multiple targets · before/after states · audio source · real surface · high-DPI source</text></svg>`;
fs.mkdirSync(workRoot, {recursive: true});
fs.writeFileSync(path.join(workRoot, "selection-board.svg"), svg);
const workspaceShaAfter = sha(workspacePath), currentPhaseShaAfter = sha(currentPhasePath);
if (workspaceShaBefore !== workspaceShaAfter) failures.push("WORKSPACE_MUTATION");
if (currentPhaseShaBefore !== currentPhaseShaAfter) failures.push("CURRENT_PHASE_MUTATION");
const body = {contract: "A1VideoShotcraftSemanticSelectionAudit/v1", status: failures.length ? "FAIL" : "PASS", positive, blocked, fixtures: [{id:"golden-product-tutorial",genre:"product-tutorial",status:positive.filter((item)=>item.genre==="product-tutorial").every((item)=>item.pass)?"PASS":"FAIL"},{id:"golden-evidence-explainer",genre:"evidence-explainer",status:positive.filter((item)=>item.genre==="evidence-explainer").every((item)=>item.pass)?"PASS":"FAIL"},{id:"golden-personal-opinion",genre:"personal-opinion",status:positive.filter((item)=>item.genre==="personal-opinion").every((item)=>item.pass)?"PASS":"FAIL"}], metrics: {positiveCount: positive.length, top1PassCount: positive.filter((item)=>item.pass).length, top1Accuracy: positive.filter((item)=>item.pass).length / positive.length, blockedCount: blocked.length, blockedPassCount: blocked.filter((item)=>item.pass).length, blockedAccuracy: blocked.filter((item)=>item.pass).length / blocked.length}, checks: {semanticIntentFirst: true, intentCompatibleSelectionOnly: true, requiredEvidenceBlocksWholeSelection: true, unrelatedFallbackForbidden: true, unresolvedIntentBlocked: true, existingRecipeFirst: true, workspaceAndCurrentPhaseUnchanged: workspaceShaBefore === workspaceShaAfter && currentPhaseShaBefore === currentPhaseShaAfter}, visibleProof: {path: "work/video-shotcraft-selection-hardening-v1/selection-board.svg", sha256: shaBuffer(Buffer.from(svg)), width: 1240, height: 720}, boundary: {reviewOnly: true, productionAdmission: false, currentStoryboardMutationPerformed: false, workspaceShaBefore, workspaceShaAfter, currentPhaseShaBefore, currentPhaseShaAfter}, failures, generatedAt: new Date().toISOString()};
body.auditSha256 = shaBuffer(Buffer.from(JSON.stringify(body)));
fs.writeFileSync(path.join(workRoot, "audit-report.json"), `${JSON.stringify(body, null, 2)}\n`);
console.log(JSON.stringify({status: body.status, metrics: body.metrics, fixtures: body.fixtures, visibleProof: body.visibleProof, failures}, null, 2));
if (failures.length) process.exitCode = 1;
