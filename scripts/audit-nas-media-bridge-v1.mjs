#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {assertNasMediaBridgePlan, assertNasMediaClipReceipt} from "../apps/studio-next/src/lib/a1-nas-media-bridge-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "nas-media-bridge-v1");
const result = JSON.parse(fs.readFileSync(path.join(phaseRoot, "result.json"), "utf8"));
const phase = JSON.parse(fs.readFileSync(path.join(phaseRoot, "phase-contract.json"), "utf8"));
const current = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), "utf8"));
const authority = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json"), "utf8"));
const ffmpeg = path.join(root, ".tools", "bin", "ffmpeg");
const failures = [];
const check = (condition, id) => { if (!condition) failures.push(id); };
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

check(result.contract === "A1NasMediaBridgeCanary/v1" && result.status === "PASS", "RESULT_NOT_PASS");
for (const key of ["mountOnline", "mountWritable", "licensedSourceHashBound", "clipFullDecode", "attributionBound", "existingNasMediaIndexed", "articleCandidateAutomaticallyRouted", "contentHashDeferredUntilSelection", "drmCaptureForbidden", "formalAuthorityUnchanged"]) check(result.checks?.[key] === true, `RESULT_CHECK:${key}`);
check(result.checks?.storyboardMutation === false && result.checks?.productionAdmission === false, "PRODUCTION_BOUNDARY_CHANGED");

const sourcePath = result.source?.path || "";
check(Boolean(sourcePath) && fs.existsSync(sourcePath) && shaFile(sourcePath) === result.source.sha256, "SOURCE_SHA_MISMATCH");
const clipPath = result.clip?.path || "";
check(Boolean(clipPath) && fs.existsSync(clipPath) && shaFile(clipPath) === result.clip.sha256, "CLIP_SHA_MISMATCH");
if (fs.existsSync(clipPath)) check(spawnSync(ffmpeg, ["-v", "error", "-i", clipPath, "-f", "null", "-"], {encoding: "utf8", timeout: 120_000}).status === 0, "CLIP_DECODE_FAILED");

const receipt = JSON.parse(fs.readFileSync(result.clip.receiptPath, "utf8"));
try { assertNasMediaClipReceipt(receipt); } catch (error) { failures.push(`CLIP_RECEIPT_INVALID:${error instanceof Error ? error.message : "invalid"}`); }
const plan = JSON.parse(fs.readFileSync(result.plan.path, "utf8"));
try { assertNasMediaBridgePlan(plan); } catch (error) { failures.push(`BRIDGE_PLAN_INVALID:${error instanceof Error ? error.message : "invalid"}`); }
check(plan.decisions.some((decision) => decision.action === "REFERENCE_ONLY_FIND_ALTERNATIVE"), "DRM_REFERENCE_ROUTE_MISSING");
check(plan.decisions.some((decision) => decision.action === "DIRECT_CLIP_FROM_NAS"), "DIRECT_CLIP_ROUTE_MISSING");

const inventory = JSON.parse(fs.readFileSync(result.inventory.path, "utf8"));
check(inventory.contract === "A1NasMediaInventory/v1" && inventory.status === "PASS", "INVENTORY_INVALID");
check(inventory.counts?.videoCount >= 1 && inventory.counts?.readableCount === inventory.counts.videoCount, "INVENTORY_READABILITY");
check(inventory.scan?.recursiveWholeNasScan === false && inventory.boundaries?.contentHashDeferredUntilSelection === true, "INVENTORY_SCOPE_INVALID");

const runtimeText = (phase.generality?.runtimeFiles || []).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const term of [...(phase.generality?.forbiddenFixtureIds || []), ...(phase.generality?.forbiddenTopicTerms || [])]) check(!runtimeText.includes(term), `RUNTIME_FIXTURE_LEAK:${term}`);
const currentSha = current.authority?.workspaceSha256 || current.workspaceSha256 || null;
check(authority.status === "PASS" && authority.authority?.workspaceSha256 === currentSha, "CURRENT_AUTHORITY_CHANGED_OR_STALE");

let liveProof = {status: "BLOCKED"};
try {
  const page = await fetch("http://127.0.0.1:8766/video-analysis");
  const html = await page.text();
  const jobsResponse = await fetch("http://127.0.0.1:8766/api/video-analysis-jobs");
  const jobs = await jobsResponse.json();
  const job = jobs.jobs?.find((candidate) => candidate.title === "Wikipedia 20 Jimmy CC canary");
  const detailResponse = job ? await fetch(`http://127.0.0.1:8766/api/video-analysis-job/${encodeURIComponent(job.id)}`) : null;
  const detail = detailResponse ? await detailResponse.json() : null;
  const exportedPath = detail?.summary?.exportedVideoPath || "";
  liveProof = {status: page.ok && jobsResponse.ok && detailResponse?.ok && detail?.status === "done" && detail?.summary?.downloadOnly === true && exportedPath.startsWith(result.mount.libraryRoot) && fs.existsSync(exportedPath) ? "PASS" : "BLOCKED", pageStatus: page.status, frontendAssetBound: /\/video-analysis\/assets\//u.test(html), jobId: job?.id || null, jobStatus: detail?.status || null, downloadOnly: detail?.summary?.downloadOnly === true, exportedPath};
} catch (error) {
  liveProof = {status: "BLOCKED", error: error instanceof Error ? error.message : String(error)};
}
check(liveProof.status === "PASS" && liveProof.frontendAssetBound === true, "LIVE_VIDEO_ANALYSIS_PROOF_FAILED");

const body = {contract: "A1NasMediaBridgeAudit/v1", status: failures.length ? "FAIL" : "PASS", phaseId: phase.phaseId, resultSha256: result.resultSha256, counts: result.inventory.counts, articleRouting: result.articleRouting, liveProof, checks: result.checks, boundary: {formalAuthorityUnchanged: result.checks.formalAuthorityUnchanged, storyboardMutation: false, productionAdmission: false}, failures};
const report = {...body, auditSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(phaseRoot, "audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
