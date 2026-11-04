#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertLocalVideoSegmentIndex} from "../apps/studio-next/src/lib/a1-local-video-segment-index-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "external-media-local-segment-indexer-v1");
const result = JSON.parse(fs.readFileSync(path.join(phaseRoot, "result.json"), "utf8"));
const phase = JSON.parse(fs.readFileSync(path.join(phaseRoot, "phase-contract.json"), "utf8"));
const current = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), "utf8"));
const authority = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json"), "utf8"));
const ffmpeg = path.join(root, ".tools", "bin", "ffmpeg");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const failures = [];
const check = (condition, id) => { if (!condition) failures.push(id); };

check(result.contract === "A1LocalVideoSegmentIndexQualification/v1" && result.status === "PASS", "RESULT_NOT_PASS");
check(result.fixtures?.length === 3 && result.counts?.fixtureCount === 3, "THREE_FIXTURES_REQUIRED");
check(result.counts?.sceneCount >= 3 && result.counts?.keyframeCount >= 6 && result.counts?.transcriptSegmentCount >= 3, "ANALYSIS_COVERAGE_INSUFFICIENT");
for (const fixture of result.fixtures || []) {
  const receiptPath = path.join(root, fixture.receiptPath);
  check(fs.existsSync(receiptPath), `RECEIPT_MISSING:${fixture.id}`);
  if (!fs.existsSync(receiptPath)) continue;
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const {selectedArtifact, ...index} = receipt;
  try { assertLocalVideoSegmentIndex(index); } catch (error) { failures.push(`INDEX_INVALID:${fixture.id}:${error instanceof Error ? error.message : "invalid"}`); }
  const selectedPath = path.join(root, receipt.selectedArtifact.path);
  check(fs.existsSync(selectedPath) && shaFile(selectedPath) === receipt.selectedArtifact.sha256, `SELECTED_SEGMENT_SHA:${fixture.id}`);
  if (fs.existsSync(selectedPath)) check(spawnSync(ffmpeg, ["-v", "error", "-i", selectedPath, "-f", "null", "-"], {encoding: "utf8"}).status === 0, `SELECTED_SEGMENT_DECODE:${fixture.id}`);
  check(receipt.selectedArtifact.durationMs >= receipt.query.minimumMs - 200 && receipt.selectedArtifact.durationMs <= receipt.query.maximumMs + 200, `SELECTED_DURATION:${fixture.id}`);
  check(receipt.selected.selectedRange.absoluteSourceInMs >= receipt.clip.sourceInMs && receipt.selected.selectedRange.absoluteSourceOutMs <= receipt.clip.sourceOutMs, `ABSOLUTE_RANGE:${fixture.id}`);
  check(receipt.source.referenceOnly === true && receipt.boundaries.sourceAuthorityUpgraded === false && receipt.boundaries.productionAdmission === false, `REFERENCE_BOUNDARY:${fixture.id}`);
  for (const frame of receipt.analysis.keyframes) check(fs.existsSync(path.join(root, frame.path)) && shaFile(path.join(root, frame.path)) === frame.sha256, `KEYFRAME_SHA:${fixture.id}:${frame.id}`);
}
const contactPath = path.join(root, result.contactSheet?.path || "");
check(fs.existsSync(contactPath) && shaFile(contactPath) === result.contactSheet.sha256, "CONTACT_SHEET_SHA");
if (fs.existsSync(contactPath)) {
  const metadata = await sharp(contactPath).metadata();
  const stats = await sharp(contactPath).stats();
  check(metadata.width === result.contactSheet.width && metadata.height === result.contactSheet.height, "CONTACT_SHEET_DIMENSIONS");
  check(Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev)) >= 8, "CONTACT_SHEET_VISIBILITY");
}
for (const checkId of ["sceneDetectionBound", "wordTimestampsBound", "openclipRevisionBound", "exactSourceRangesBound", "sourceOrderPreserved", "referenceOnly", "formalAuthorityUnchanged"]) check(result.checks?.[checkId] === true, `RESULT_CHECK:${checkId}`);
const runtimeText = (phase.generality?.runtimeFiles || []).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const term of [...(phase.generality?.forbiddenFixtureIds || []), ...(phase.generality?.forbiddenTopicTerms || [])]) check(!runtimeText.includes(term), `RUNTIME_FIXTURE_LEAK:${term}`);
const currentSha = current.authority?.workspaceSha256 || current.workspaceSha256 || null;
check(authority.status === "PASS" && authority.authority?.workspaceSha256 === currentSha, "CURRENT_AUTHORITY_CHANGED_OR_STALE");
const body = {contract: "A1LocalVideoSegmentIndexAudit/v1", status: failures.length ? "FAIL" : "PASS", counts: result.counts, contactSheet: result.contactSheet, checks: result.checks, boundary: result.boundary, failures};
const report = {...body, auditSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(phaseRoot, "audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
