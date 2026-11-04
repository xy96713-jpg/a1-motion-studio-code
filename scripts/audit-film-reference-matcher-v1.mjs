#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertFilmReferenceBrief, assertFilmReferenceRanking} from "../apps/studio-next/src/lib/a1-film-reference-matcher-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "work", "article-film-reference-matcher-v1");
const result = JSON.parse(fs.readFileSync(path.join(outputRoot, "result.json"), "utf8"));
const phase = JSON.parse(fs.readFileSync(path.join(outputRoot, "phase-contract.json"), "utf8"));
const current = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), "utf8"));
const authority = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json"), "utf8"));
const failures = [];
const check = (condition, id) => { if (!condition) failures.push(id); };

check(result.contract === "A1FilmReferenceMatcherQualification/v1" && result.status === "PASS", "RESULT_NOT_PASS");
check(result.fixtures?.length === 3 && new Set(result.fixtures.map((fixture) => fixture.genre)).size === 3, "THREE_GENRES_REQUIRED");
for (const row of result.rows || []) {
  try { assertFilmReferenceBrief(row.brief); } catch (error) { failures.push(`BRIEF_INVALID:${row.id}:${error instanceof Error ? error.message : "invalid"}`); }
  try { assertFilmReferenceRanking(row.ranking); } catch (error) { failures.push(`RANKING_INVALID:${row.id}:${error instanceof Error ? error.message : "invalid"}`); }
  check(row.ranking.topCandidates.length >= 1 && row.ranking.topCandidates.every((candidate) => candidate.semanticAnchorCount > 0) && (!row.ranking.topCandidates[1] || row.ranking.topCandidates[0].score >= row.ranking.topCandidates[1].score), `TOP_RANKING_INVALID:${row.id}`);
  check(row.ranking.candidates.every((candidate) => candidate.productionUseAllowed === false), `PRODUCTION_USE_LEAK:${row.id}`);
}
for (const id of ["cinematicGrammarCompiled", "evidenceNeverReplaced", "userMediaRequired", "genericBrollFallbackPresent", "noForcedLowFitRecommendations", "formalAuthorityUnchanged"]) check(result.checks?.[id] === true, `RESULT_CHECK:${id}`);
check(result.checks?.filmProductionUseAutomatic === false && result.checks?.mediaDownloaded === false && result.checks?.storyboardMutation === false && result.checks?.productionAdmission === false, "RIGHTS_OR_PRODUCTION_BOUNDARY");
check(fs.existsSync(path.join(root, result.intakeTemplate.path)) && crypto.createHash("sha256").update(fs.readFileSync(path.join(root, result.intakeTemplate.path))).digest("hex") === result.intakeTemplate.sha256, "INTAKE_TEMPLATE_SHA");
check(fs.existsSync(path.join(outputRoot, "review.md")) && fs.statSync(path.join(outputRoot, "review.md")).size > 500, "VISIBLE_REVIEW_MISSING");
const runtimeText = (phase.generality?.runtimeFiles || []).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const term of [...(phase.generality?.forbiddenFixtureIds || []), ...(phase.generality?.forbiddenTopicTerms || [])]) check(!runtimeText.includes(term), `RUNTIME_FIXTURE_LEAK:${term}`);
const currentSha = current.authority?.workspaceSha256 || current.workspaceSha256 || null;
check(authority.status === "PASS" && authority.authority?.workspaceSha256 === currentSha, "CURRENT_AUTHORITY_CHANGED_OR_STALE");
const body = {contract: "A1FilmReferenceMatcherAudit/v1", status: failures.length ? "FAIL" : "PASS", counts: result.counts, fixtures: result.fixtures, checks: result.checks, boundary: result.boundary, failures};
const report = {...body, auditSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(outputRoot, "audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
