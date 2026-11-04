#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertYouTubeReferenceDiscovery} from "../apps/studio-next/src/lib/a1-youtube-reference-search-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "youtube-reference-search-v1");
const result = JSON.parse(fs.readFileSync(path.join(phaseRoot, "result.json"), "utf8"));
const qualification = JSON.parse(fs.readFileSync(path.join(phaseRoot, "qualification.json"), "utf8"));
const phase = JSON.parse(fs.readFileSync(path.join(phaseRoot, "phase-contract.json"), "utf8"));
const current = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), "utf8"));
const authority = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json"), "utf8"));
const failures = [];
const check = (condition, id) => { if (!condition) failures.push(id); };
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

check(result.contract === "A1YouTubeReferenceSearchQualification/v1" && result.status === "PASS", "RESULT_NOT_PASS");
check(qualification.length === 3 && new Set(qualification.map((row) => row.genre)).size === 3, "THREE_GENRES_REQUIRED");
for (const row of qualification) {
  try { assertYouTubeReferenceDiscovery(row.discovery); } catch (error) { failures.push(`DISCOVERY_INVALID:${row.id}:${error instanceof Error ? error.message : "invalid"}`); }
  check(row.selected?.status === "CC_METADATA_FOUND_REVIEW_REQUIRED", `CC_METADATA_MISSING:${row.id}`);
  check(row.selected?.boundaries?.referenceOnly === true && row.selected?.boundaries?.automaticDownload === false, `REFERENCE_BOUNDARY:${row.id}`);
  check(/^https:\/\/www\.youtube\.com\/watch/u.test(row.selected?.sourcePageUrl || ""), `SOURCE_PAGE:${row.id}`);
  const previewPath = path.join(root, row.preview?.path || "");
  check(Boolean(row.preview?.path) && fs.existsSync(previewPath) && shaFile(previewPath) === row.preview.sha256, `PREVIEW_SHA:${row.id}`);
}
for (const key of ["threeGenres", "liveYouTubeSearchExecuted", "creativeCommonsMetadataFound", "sourcePagesBound", "previewPixelsCached", "allReferenceOnly"]) check(result.checks?.[key] === true, `RESULT_CHECK:${key}`);
check(result.checks?.automaticDownload === false && result.checks?.storyboardMutation === false && result.checks?.productionAdmission === false, "PRODUCTION_BOUNDARY_CHANGED");
check(result.ytDlp?.usedCookies === false && result.ytDlp?.usedAccountLogin === false, "YOUTUBE_AUTH_BOUNDARY");
const boardPath = path.join(root, result.reviewBoard.path);
check(fs.existsSync(boardPath) && shaFile(boardPath) === result.reviewBoard.sha256, "BOARD_SHA");
if (fs.existsSync(boardPath)) {
  const metadata = await sharp(boardPath).metadata();
  const stats = await sharp(boardPath).stats();
  check(metadata.width === result.reviewBoard.width && metadata.height === result.reviewBoard.height, "BOARD_DIMENSIONS");
  check(Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev)) >= 8, "BOARD_NOT_VISIBLE");
}
const runtimeText = (phase.generality?.runtimeFiles || []).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const term of [...(phase.generality?.forbiddenFixtureIds || []), ...(phase.generality?.forbiddenTopicTerms || [])]) check(!runtimeText.includes(term), `RUNTIME_FIXTURE_LEAK:${term}`);
const currentSha = current.authority?.workspaceSha256 || current.workspaceSha256 || null;
check(authority.status === "PASS" && authority.authority?.workspaceSha256 === currentSha, "CURRENT_AUTHORITY_CHANGED_OR_STALE");
const body = {contract: "A1YouTubeReferenceSearchAudit/v1", status: failures.length ? "FAIL" : "PASS", phaseId: phase.phaseId, resultSha256: result.resultSha256, fixtures: result.fixtures, reviewBoard: result.reviewBoard, checks: result.checks, boundary: result.boundary, failures};
const report = {...body, auditSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(phaseRoot, "audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
