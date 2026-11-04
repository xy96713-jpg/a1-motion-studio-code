#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const reportPath = path.resolve(root, process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(reportPath)) throw new Error("usage:audit-telemetry-driven-screen-wave-v1 <batch-report.json>");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8")), ffmpeg = path.join(root, ".tools/bin/ffmpeg"), failures = [];
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (report.contract !== "A1TelemetryDrivenScreenWave/v1" || report.status !== "PASS" || report.fixtureCount !== 15 || report.fixtures.length !== 15) failures.push("BATCH_CONTRACT");
for (const fixture of report.fixtures) {
  const video = path.join(root, fixture.reviewVideo.path), source = path.join(root, fixture.sourceVideo.path);
  if (fixture.status !== "PASS" || !fs.existsSync(video) || sha(video) !== fixture.reviewVideo.sha256 || !fs.existsSync(source) || sha(source) !== fixture.sourceVideo.sha256) failures.push(`${fixture.id}:SOURCE_OR_REVIEW_SHA`);
  if (fixture.sourceVideo.cursorHidden !== true || fixture.interactionTimeline.maximumSyncOffsetMs > 240 || fixture.interactionTimeline.generatedActorCount > 1 || fixture.interactionTimeline.semanticZoomCount > 1) failures.push(`${fixture.id}:INTERACTION_CONTRACT`);
}
const reel = path.join(root, report.continuousReview.path), contact = path.join(root, report.contactSheet.path);
if (!fs.existsSync(reel) || sha(reel) !== report.continuousReview.sha256 || !fs.existsSync(contact) || sha(contact) !== report.contactSheet.sha256) failures.push("REVIEW_ARTIFACT_SHA");
const scan = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "info", "-i", reel, "-vf", "blackdetect=d=0.05:pix_th=0.02", "-an", "-f", "null", "-"], {encoding: "utf8", maxBuffer: 2_000_000});
const blackSegments = [...String(scan.stderr || "").matchAll(/black_start:([0-9.]+).*?black_end:([0-9.]+)/gu)].map((match) => ({startSec: Number(match[1]), endSec: Number(match[2])}));
if (scan.status !== 0) failures.push("FULL_DECODE");
if (blackSegments.length) failures.push(`BLACK_SEGMENTS:${blackSegments.length}`);
const audit = {contract: "A1TelemetryDrivenScreenWaveAudit/v1", status: failures.length ? "FAIL" : "PASS", sourceWorkspaceSha256: report.sourceWorkspaceSha256, fixtureCount: report.fixtureCount, checks: {cursorHiddenCount: report.fixtures.filter((fixture) => fixture.sourceVideo.cursorHidden).length, maximumSyncOffsetMs: Math.max(...report.fixtures.map((fixture) => fixture.interactionTimeline.maximumSyncOffsetMs)), generatedActorCounts: Object.fromEntries(report.fixtures.map((fixture) => [fixture.id, fixture.interactionTimeline.generatedActorCount])), atMostOneGeneratedActorPerShot: report.fixtures.every((fixture) => fixture.interactionTimeline.generatedActorCount <= 1), atMostOneSemanticZoomPerShot: report.fixtures.every((fixture) => fixture.interactionTimeline.semanticZoomCount <= 1), fullDecodePass: scan.status === 0, blackSegments}, continuousReview: report.continuousReview, contactSheet: report.contactSheet, boundaries: report.boundaries, failures, auditedAt: new Date().toISOString()};
const output = path.join(path.dirname(reportPath), "audit-report.json"); fs.writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`); console.log(JSON.stringify({...audit, auditPath: path.relative(root, output)}, null, 2)); if (failures.length) process.exitCode = 1;
