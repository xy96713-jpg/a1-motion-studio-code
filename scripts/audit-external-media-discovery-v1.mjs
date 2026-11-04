#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "external-media-segment-candidate-v1");
const result = JSON.parse(fs.readFileSync(path.join(phaseRoot, "result.json"), "utf8"));
const phase = JSON.parse(fs.readFileSync(path.join(phaseRoot, "phase-contract.json"), "utf8"));
const current = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), "utf8"));
const authority = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json"), "utf8"));
const failures = [];
const check = (condition, id) => { if (!condition) failures.push(id); };

check(result.contract === "A1ExternalMediaDiscoveryQualification/v1" && result.status === "PASS", "RESULT_NOT_PASS");
check(result.counts?.requestCount === 3 && result.counts?.genreCount >= 3, "THREE_GENRE_REQUESTS_REQUIRED");
check(result.counts?.genresWithCandidates >= 2 && result.counts?.candidateCount > 0, "LIVE_METADATA_DISCOVERY_INSUFFICIENT");
check(result.checks?.requestContractsReady === true, "REQUEST_CONTRACTS_NOT_READY");
check(result.checks?.metadataOnly === true && result.boundary?.mediaDownloaded === false, "METADATA_ONLY_BOUNDARY_FAILED");
check(result.checks?.discoveryNeverAdmitsEvidence === true && result.boundary?.productionAdmission === false, "DISCOVERY_ADMISSION_BOUNDARY_FAILED");
check(result.rows?.every((row) => row.discovery.providers.every((provider) => provider.candidates.every((candidate) => candidate.discoveryOnly === true && candidate.sourcePageUrl))), "DISCOVERY_CANDIDATE_PROVENANCE_MISSING");
check(result.rows?.every((row) => row.discovery.providers.every((provider) => provider.candidates.every((candidate) => Number.isFinite(candidate.relevance?.score)))), "METADATA_RELEVANCE_MISSING");
check(result.rows?.some((row) => row.discovery.providers.some((provider) => provider.candidates.some((candidate) => candidate.mediaType === "IMAGE"))), "IMAGE_DISCOVERY_MISSING");
check(result.rows?.some((row) => row.discovery.providers.some((provider) => provider.candidates.some((candidate) => candidate.mediaType === "VIDEO"))), "VIDEO_DISCOVERY_MISSING");
const runtimeText = (phase.generality?.runtimeFiles || []).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const term of [...(phase.generality?.forbiddenFixtureIds || []), ...(phase.generality?.forbiddenTopicTerms || [])]) check(!runtimeText.includes(term), `RUNTIME_FIXTURE_LEAK:${term}`);
const currentSha = current.authority?.workspaceSha256 || current.workspaceSha256 || null;
check(authority.status === "PASS" && authority.authority?.workspaceSha256 === currentSha, "CURRENT_AUTHORITY_CHANGED_OR_STALE");
check(fs.existsSync(path.join(phaseRoot, "review.md")) && fs.statSync(path.join(phaseRoot, "review.md")).size > 200, "VISIBLE_REVIEW_MISSING");

const body = {
  contract: "A1ExternalMediaDiscoveryAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  counts: result.counts,
  resultSha256: result.resultSha256,
  reviewSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(phaseRoot, "review.md"))).digest("hex"),
  boundary: result.boundary,
  failures,
};
const report = {...body, auditSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(phaseRoot, "audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
