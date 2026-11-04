#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertCurrentRepairManifestAuthority, assertUniqueCurrentRepairManifestAuthority, sha256} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {readProjectWorkspace, projectDirs} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const canonicalPath = path.join(artifactDir, "incremental-repair-executor-v1/repair-manifest.json");
const publicPath = path.join(publicDir, "incremental-repair-executor-v1/repair-manifest.json");
const historicalPath = path.join(root, ".codex-artifacts/system-progress-system-line/incremental-repair-executor-v1/repair-manifest.json");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const authorityReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/report.json");

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => sha256(fs.readFileSync(file));
const canonical = read(canonicalPath);
const publicMirror = read(publicPath);
const historical = read(historicalPath);
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const currentPhase = read(phasePath);
const authorityReport = read(authorityReportPath);

assert.equal(canonical.manifestSha256, publicMirror.manifestSha256, "current/public repair manifest SHA drift");
assert.deepEqual(publicMirror, canonical, "current/public repair manifest content drift");
assert.equal(sha256File(canonicalPath), sha256File(publicPath), "current/public repair manifest file SHA drift");
assert.equal(workspace.production.incrementalRepairManifestAuthority.manifestFileSha256, sha256File(publicPath), "workspace repair manifest file SHA pointer drift");
assert.equal(currentPhase.repairManifestAuthority.manifestFileSha256, sha256File(publicPath), "current-phase repair manifest file SHA pointer drift");
assert.equal(authorityReport.repairManifestAuthority.manifestFileSha256, sha256File(publicPath), "authority report repair manifest file SHA pointer drift");
assert.equal(canonical.authorityState, "CURRENT");
assert.equal(canonical.current, true);
assert.equal(canonical.historyReadOnly, false);
assert.equal(historical.authorityState, "HISTORY_READ_ONLY");
assert.equal(historical.current, false);
assert.equal(historical.historyReadOnly, true);
assert.equal(historical.advisoryOnly, true);
assert.equal(historical.supersededByManifestSha256, canonical.manifestSha256);
assert.notEqual(historical.manifestSha256, canonical.manifestSha256);

const currentPackageEntries = canonical.entries.filter((entry) => entry.reasonCodes?.includes("PACKAGE_ROUTE") && entry.packageDecision !== "NO_PACKAGE");
const currentNoPackageEntries = canonical.entries.filter((entry) => entry.packageDecision === "NO_PACKAGE");
assert.deepEqual({packageCount: canonical.summary.packageCount, noPackageCount: canonical.summary.noPackageCount}, {packageCount: 13, noPackageCount: 21});
assert.equal(currentPackageEntries.length, 13);
assert.equal(currentNoPackageEntries.length, 21);
const ed15 = canonical.entries.find((entry) => entry.shotId === "ED-15");
assert.equal(ed15.packageDecision, "NO_PACKAGE");
assert.equal(ed15.route, "PRESENTER_BASE");
assert.equal(ed15.status, "NO_REPAIR_REQUIRED");
assert.equal(ed15.generationAllowed, false);
assert.equal(ed15.staticPackageBoardBlocking, false);
assert.match(ed15.sequenceRhythm.rationale, /ED-14 evidence.*ED-15 presenter breathing beat.*ED-16 hero conclusion/);
const supersededSha = canonical.supersedesCurrentManifest?.supersededManifestSha256;
assert.ok(supersededSha, "current repair manifest must point at the archived 14-package authority");
const currentRepairHistoryPath = path.join(artifactDir, "incremental-repair-executor-v1/history", `repair-manifest-${supersededSha}.json`);
assert.ok(fs.existsSync(currentRepairHistoryPath), "superseded current repair manifest archive missing");
const supersededCurrent = read(currentRepairHistoryPath);
assert.equal(supersededCurrent.current, false);
assert.equal(supersededCurrent.historyReadOnly, true);
assert.equal(supersededCurrent.authorityState, "HISTORY_READ_ONLY");
assert.equal(supersededCurrent.supersededByManifestSha256, canonical.manifestSha256);

const ed20 = canonical.entries.find((entry) => entry.shotId === "ED-20");
assert.deepEqual({packageDecision: ed20.packageDecision, contentTreatment: ed20.contentTreatment, frameOccupation: ed20.frameOccupation, generationAllowed: ed20.generationAllowed}, {packageDecision: "NO_PACKAGE", contentTreatment: "REAL_EVIDENCE", frameOccupation: "CLEAN_BASE", generationAllowed: false});
assert.ok(!ed20.reasonCodes.includes("PACKAGE_ROUTE"));
assert.ok(!ed20.reasonCodes.includes("MUST_REVIEW"));
assert.ok(!ed20.reasonCodes.includes("GOLDEN_ANCHOR_SELECTION_REQUIRED"));
assert.equal(ed20.sourceCaptureHandoff.packagingPaletteBlocking, false);
assert.equal(ed20.sourceCaptureHandoff.staticPackageBoardBlocking, false);
assert.deepEqual(new Set(Object.keys(ed20)), new Set([
  "shotId", "status", "current", "packageDecision", "contentTreatment", "frameOccupation", "route", "evidenceOwnership", "reasonCodes", "generationAllowed", "nextAction", "packagingPaletteBlocking", "staticPackageBoardBlocking", "sourceCaptureHandoff", "historyReadOnlyHistory", "updatedAt",
]));

assertCurrentRepairManifestAuthority({workspace, manifest: canonical, publicMirror, currentPhase, authorityReport});
assertUniqueCurrentRepairManifestAuthority({workspace, manifest: canonical, publicMirror, currentPhase, authorityReport, historicalMirrors: [historical]});

const stalePublicMirror = {...publicMirror, manifestSha256: "0".repeat(64)};
assert.throws(() => assertCurrentRepairManifestAuthority({workspace, manifest: canonical, publicMirror: stalePublicMirror, currentPhase, authorityReport}), /incremental-repair-public-mirror-stale/);
const contradictoryCurrent = structuredClone(canonical);
contradictoryCurrent.entries.find((entry) => entry.shotId === "ED-20").generatorLane = "LANE_B_TYPOGRAPHY_EXPLAINER";
contradictoryCurrent.manifestSha256 = sha256({...contradictoryCurrent, manifestSha256: undefined});
assert.throws(() => assertCurrentRepairManifestAuthority({workspace, manifest: contradictoryCurrent, publicMirror, currentPhase, authorityReport}), /incremental-repair-ed20-contradictory-current-fields/);

console.log(JSON.stringify({
  status: "PASS",
  currentManifestSha256: canonical.manifestSha256,
  currentPublicMirror: "IN_SYNC",
  historicalMirror: "HISTORY_READ_ONLY",
  ed20: "NO_PACKAGE_REAL_EVIDENCE_EDITOR_OWNED_NONBLOCKING",
  workspacePointer: workspace.production.incrementalRepairManifestAuthority.manifestSha256,
  phasePointer: currentPhase.repairManifestAuthority.manifestSha256,
  authorityReportPointer: authorityReport.repairManifestAuthority.manifestSha256,
}, null, 2));
