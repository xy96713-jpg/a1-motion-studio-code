#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertSequenceMediaAllocation, assertStoryboardMediaNeedPlan, assertStoryboardMediaRetrieval} from "../apps/studio-next/src/lib/a1-storyboard-media-retrieval-orchestrator-v1.mjs";
import {assertFreshExternalSearchCandidate, assertStoryboardLiveMediaSearchPlan} from "../apps/studio-next/src/lib/a1-storyboard-live-media-search-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "storyboard-media-retrieval-orchestrator-v1");
const result = JSON.parse(fs.readFileSync(path.join(phaseRoot, "result.json"), "utf8"));
const qualification = JSON.parse(fs.readFileSync(path.join(phaseRoot, "qualification.json"), "utf8"));
const phase = JSON.parse(fs.readFileSync(path.join(phaseRoot, "phase-contract.json"), "utf8"));
const current = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), "utf8"));
const authority = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json"), "utf8"));
const ffmpeg = path.join(root, ".tools", "bin", "ffmpeg");
const failures = [];
const check = (condition, id) => { if (!condition) failures.push(id); };
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

check(result.contract === "A1StoryboardMediaLiveSearchQualification/v2" && result.status === "PASS", "RESULT_NOT_PASS");
for (const row of qualification) {
  try { assertStoryboardMediaNeedPlan(row.plan); } catch (error) { failures.push(`PLAN_INVALID:${row.id}:${error instanceof Error ? error.message : "invalid"}`); }
  try { assertStoryboardLiveMediaSearchPlan(row.livePlan); } catch (error) { failures.push(`LIVE_PLAN_INVALID:${row.id}:${error instanceof Error ? error.message : "invalid"}`); }
  try { assertStoryboardMediaRetrieval(row.retrieval); } catch (error) { failures.push(`RETRIEVAL_INVALID:${row.id}:${error instanceof Error ? error.message : "invalid"}`); }
  try { assertSequenceMediaAllocation(row.allocation); } catch (error) { failures.push(`ALLOCATION_INVALID:${row.id}:${error instanceof Error ? error.message : "invalid"}`); }
  const selectedIds = row.allocation.assignments.map((assignment) => assignment.selected?.id).filter(Boolean);
  check(selectedIds.length === new Set(selectedIds).size, `DUPLICATE_CANDIDATE:${row.id}`);
  const sourceGroups = row.allocation.assignments.map((assignment) => assignment.selected?.sourceGroup).filter(Boolean);
  check(sourceGroups.length === new Set(sourceGroups).size, `SOURCE_GROUP_BALANCE:${row.id}`);
  for (const shot of row.retrieval.shots.filter((shot) => shot.evidenceDuty === "VERIFIED_EVIDENCE")) {
    check(shot.topCandidates.every((candidate) => candidate.evidenceCapable && !["FILM_REFERENCE", "LICENSED_BROLL"].includes(candidate.mediaClass)), `EVIDENCE_SUBSTITUTION:${row.id}:${shot.shotId}`);
  }
  for (const assignment of row.allocation.assignments.filter((assignment) => assignment.selected)) {
    const frame = path.join(root, assignment.selected.keyframePath);
    check(fs.existsSync(frame), `KEYFRAME_MISSING:${row.id}:${assignment.shotId}`);
    try { assertFreshExternalSearchCandidate(assignment.selected, result.searchStartedAt); } catch (error) { failures.push(`NOT_FRESH_EXTERNAL:${row.id}:${assignment.shotId}:${error instanceof Error ? error.message : "invalid"}`); }
    check(!/LOCAL|NAS/iu.test(assignment.selected.provider), `LOCAL_OR_NAS_SELECTED:${row.id}:${assignment.shotId}`);
    check(assignment.selected.productionUseAllowed === false && assignment.productionUseAllowed === false, `PRODUCTION_USE_ESCALATED:${row.id}:${assignment.shotId}`);
  }
}
for (const fixture of phase.generality?.blindFixtures || []) check(result.fixtures?.some((row) => row.id === fixture.id && row.status === "PASS"), `FIXTURE_NOT_PASS:${fixture.id}`);
check(result.networkReceipts?.length > 0 && result.networkReceipts.some((receipt) => receipt.ok && /wikimedia\.org|archive\.org|nasa\.gov/u.test(receipt.host)), "LIVE_NETWORK_RECEIPT_MISSING");

for (const artifact of result.selectedArtifacts || []) {
  if (!artifact.path) continue;
  const file = path.join(root, artifact.path);
  check(fs.existsSync(file) && shaFile(file) === artifact.sha256, `SELECTED_SHA:${artifact.fixtureId}:${artifact.shotId}`);
  if (fs.existsSync(file)) check(spawnSync(ffmpeg, ["-v", "error", "-i", file, "-f", "null", "-"], {encoding: "utf8", timeout: 120_000}).status === 0, `SELECTED_DECODE:${artifact.fixtureId}:${artifact.shotId}`);
  const source = path.join(root, artifact.sourcePath || "");
  check(Boolean(artifact.sourcePath) && fs.existsSync(source) && shaFile(source) === artifact.sourceSha256, `SOURCE_SHA:${artifact.fixtureId}:${artifact.shotId}`);
  check(!/LOCAL|NAS/iu.test(artifact.provider || "") && /^https:\/\//u.test(artifact.sourcePageUrl || ""), `EXTERNAL_PROVENANCE:${artifact.fixtureId}:${artifact.shotId}`);
}

const boardPath = path.join(root, result.reviewBoard.path);
check(fs.existsSync(boardPath) && shaFile(boardPath) === result.reviewBoard.sha256, "REVIEW_BOARD_SHA");
if (fs.existsSync(boardPath)) {
  const metadata = await sharp(boardPath).metadata();
  const stats = await sharp(boardPath).stats();
  check(metadata.width === result.reviewBoard.width && metadata.height === result.reviewBoard.height, "REVIEW_BOARD_DIMENSIONS");
  check(Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev)) >= 8, "REVIEW_BOARD_NOT_VISIBLE");
}

for (const key of ["threeStoryboardGenres", "liveExternalSearchExecuted", "liveSearchPlanBoundPerShot", "freshDownloadedExternalBytes", "zeroLocalOrNasSelections", "externalSourcePagesBound", "playableSelectedArtifacts", "formalAuthorityUnchanged"]) check(result.checks?.[key] === true, `RESULT_CHECK:${key}`);
check(result.checks?.productionUseAllowed === false && result.checks?.storyboardMutation === false && result.checks?.productionAdmission === false, "PRODUCTION_BOUNDARY_CHANGED");
const runtimeText = (phase.generality?.runtimeFiles || []).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const term of [...(phase.generality?.forbiddenFixtureIds || []), ...(phase.generality?.forbiddenTopicTerms || [])]) check(!runtimeText.includes(term), `RUNTIME_FIXTURE_LEAK:${term}`);
const currentSha = current.authority?.workspaceSha256 || current.workspaceSha256 || null;
check(authority.status === "PASS" && authority.authority?.workspaceSha256 === currentSha, "CURRENT_AUTHORITY_CHANGED_OR_STALE");

const body = {contract: "A1StoryboardMediaRetrievalOrchestratorAudit/v2", status: failures.length ? "FAIL" : "PASS", phaseId: phase.phaseId, resultSha256: result.resultSha256, fixtures: result.fixtures, selectedArtifacts: result.selectedArtifacts, networkRequestCount: result.networkReceipts?.length || 0, reviewBoard: result.reviewBoard, checks: result.checks, correction: result.correction, boundary: result.boundary, failures};
const report = {...body, auditSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(phaseRoot, "audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
