#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertArticleExternalMediaProgram} from "../apps/studio-next/src/lib/a1-article-external-media-program-v1.mjs";
import {assertExternalMediaSegmentCandidate} from "../apps/studio-next/src/lib/a1-external-media-discovery-v1.mjs";
import {assertLocalVideoSegmentIndex} from "../apps/studio-next/src/lib/a1-local-video-segment-index-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "article-external-media-program-v1");
const result = JSON.parse(fs.readFileSync(path.join(phaseRoot, "result.json"), "utf8"));
const phase = JSON.parse(fs.readFileSync(path.join(phaseRoot, "phase-contract.json"), "utf8"));
const current = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), "utf8"));
const authority = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json"), "utf8"));
const ffmpeg = path.join(root, ".tools", "bin", "ffmpeg");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const failures = [];
const check = (condition, id) => { if (!condition) failures.push(id); };

check(result.contract === "A1ArticleExternalMediaProgramQualification/v1" && result.status === "PASS", "RESULT_NOT_PASS");
check(result.fixtures?.length === 3 && new Set(result.fixtures.map((fixture) => fixture.genre)).size === 3, "THREE_ARTICLE_GENRES_REQUIRED");
for (const row of result.articleRows || []) {
  try { assertArticleExternalMediaProgram(row.program); } catch (error) { failures.push(`PROGRAM_INVALID:${row.id}:${error instanceof Error ? error.message : "invalid"}`); }
  check(row.program.boundaries.actualFilmExcerptRequiresExplicitRights === true && row.program.boundaries.automaticCandidateSelection === false, `PROGRAM_RIGHTS_BOUNDARY:${row.id}`);
}
for (const id of ["articleDriven", "interviewLanePresent", "evidenceLanePresent", "contextualAndCinematicBrollPresent", "filmExcerptAutomaticUseForbidden", "licensedSourceHashBound", "exactSegmentReadyForPackageReview", "attributionBound", "formalAuthorityUnchanged"]) check(result.checks?.[id] === true, `RESULT_CHECK:${id}`);
check(result.checks?.mediaDownloadedCount === 1 && result.checks?.storyboardMutation === false && result.checks?.productionAdmission === false, "DOWNLOAD_OR_PRODUCTION_BOUNDARY");
const canaryReceiptPath = path.join(root, result.canary.receiptPath);
check(fs.existsSync(canaryReceiptPath), "CANARY_RECEIPT_MISSING");
if (fs.existsSync(canaryReceiptPath)) {
  const receipt = JSON.parse(fs.readFileSync(canaryReceiptPath, "utf8"));
  try { assertLocalVideoSegmentIndex(receipt.index); } catch (error) { failures.push(`CANARY_INDEX_INVALID:${error instanceof Error ? error.message : "invalid"}`); }
  try { assertExternalMediaSegmentCandidate(receipt.segmentCandidate); } catch (error) { failures.push(`CANARY_SEGMENT_INVALID:${error instanceof Error ? error.message : "invalid"}`); }
  check(receipt.segmentCandidate.status === "READY_FOR_PACKAGE_REVIEW", "CANARY_NOT_PACKAGE_REVIEW_READY");
  check(receipt.licenseReview?.status === "PASS" && /^CC BY/iu.test(receipt.licenseReview.licenseName) && receipt.licenseReview.attribution, "CANARY_LICENSE_REVIEW_INVALID");
  const sourcePath = path.join(root, receipt.source.localPath);
  const selectedPath = path.join(root, receipt.selectedArtifact.path);
  check(fs.existsSync(sourcePath) && shaFile(sourcePath) === receipt.source.sha256, "CANARY_SOURCE_SHA");
  check(fs.existsSync(selectedPath) && shaFile(selectedPath) === receipt.selectedArtifact.sha256, "CANARY_SEGMENT_SHA");
  if (fs.existsSync(selectedPath)) check(spawnSync(ffmpeg, ["-v", "error", "-i", selectedPath, "-f", "null", "-"], {encoding: "utf8"}).status === 0, "CANARY_SEGMENT_DECODE");
}
const contactPath = path.join(root, result.contactSheet.path);
check(fs.existsSync(contactPath) && shaFile(contactPath) === result.contactSheet.sha256, "CONTACT_SHEET_SHA");
if (fs.existsSync(contactPath)) {
  const metadata = await sharp(contactPath).metadata();
  const stats = await sharp(contactPath).stats();
  check(metadata.width === result.contactSheet.width && metadata.height === result.contactSheet.height, "CONTACT_SHEET_DIMENSIONS");
  check(Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev)) >= 8, "CONTACT_SHEET_NOT_VISIBLE");
}
const runtimeText = (phase.generality?.runtimeFiles || []).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const term of [...(phase.generality?.forbiddenFixtureIds || []), ...(phase.generality?.forbiddenTopicTerms || [])]) check(!runtimeText.includes(term), `RUNTIME_FIXTURE_LEAK:${term}`);
const currentSha = current.authority?.workspaceSha256 || current.workspaceSha256 || null;
check(authority.status === "PASS" && authority.authority?.workspaceSha256 === currentSha, "CURRENT_AUTHORITY_CHANGED_OR_STALE");
check(fs.existsSync(path.join(phaseRoot, "review.md")) && fs.statSync(path.join(phaseRoot, "review.md")).size > 300, "VISIBLE_REVIEW_MISSING");
const body = {contract: "A1ArticleExternalMediaProgramAudit/v1", status: failures.length ? "FAIL" : "PASS", counts: result.counts, canary: result.canary, contactSheet: result.contactSheet, checks: result.checks, boundary: result.boundary, failures};
const report = {...body, auditSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(phaseRoot, "audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;

