#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertNasSemanticSceneCatalog, assertNasSemanticSceneRetrieval} from "../apps/studio-next/src/lib/a1-nas-semantic-scene-index-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "nas-semantic-scene-index-v2");
const result = JSON.parse(fs.readFileSync(path.join(phaseRoot, "result.json"), "utf8"));
const phase = JSON.parse(fs.readFileSync(path.join(phaseRoot, "phase-contract.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(phaseRoot, "catalog.json"), "utf8"));
const retrievals = JSON.parse(fs.readFileSync(path.join(phaseRoot, "retrievals.json"), "utf8"));
const dependencyLock = JSON.parse(fs.readFileSync(path.join(phaseRoot, "dependency-lock.json"), "utf8"));
const current = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), "utf8"));
const authority = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json"), "utf8"));
const ffmpeg = path.join(root, ".tools", "bin", "ffmpeg");
const lancePython = path.join(phaseRoot, ".venv", "bin", "python");
const failures = [];
const check = (condition, id) => { if (!condition) failures.push(id); };
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

check(result.contract === "A1NasSemanticSceneIndexQualification/v2" && result.status === "PASS", "RESULT_NOT_PASS");
try { assertNasSemanticSceneCatalog(catalog); } catch (error) { failures.push(`CATALOG_INVALID:${error instanceof Error ? error.message : "invalid"}`); }
for (const retrieval of retrievals) {
  const {lanceResults: _lanceResults, ...contractRetrieval} = retrieval;
  try { assertNasSemanticSceneRetrieval(contractRetrieval); } catch (error) { failures.push(`RETRIEVAL_INVALID:${retrieval.query?.id}:${error instanceof Error ? error.message : "invalid"}`); }
}
for (const fixture of phase.generality?.blindFixtures || []) check(result.fixtures?.some((row) => row.id === fixture.id && row.status === "PASS"), `FIXTURE_NOT_PASS:${fixture.id}`);
check(result.fixtures?.filter((row) => row.retrievalStatus === "NO_SEMANTIC_MATCH").length >= 2, "NO_MATCH_REJECTION_PROOF_MISSING");
check(result.fixtures?.some((row) => row.retrievalStatus === "READY_FOR_REVIEW"), "POSITIVE_RETRIEVAL_PROOF_MISSING");

const sourceStat = fs.statSync(result.source.path);
check(sourceStat.size === result.source.bytes && sourceStat.mtime.toISOString() === result.source.modifiedAt && /^[a-f0-9]{64}$/u.test(result.source.sha256), "SOURCE_IDENTITY_DRIFT");
const proxyPath = path.join(root, result.proxy.path);
check(fs.existsSync(proxyPath) && shaFile(proxyPath) === result.proxy.sha256, "PROXY_SHA_MISMATCH");
check(result.proxy.fullDecode === true && result.proxy.durationMs <= 900_250, "PROXY_BOUNDARY_INVALID");
for (const artifact of result.selectedArtifacts || []) {
  const file = path.join(root, artifact.path);
  check(fs.existsSync(file) && shaFile(file) === artifact.sha256, `SELECTED_SHA:${artifact.queryId}`);
  check(artifact.range.outMs - artifact.range.inMs <= 15_000, `SELECTED_RANGE_TOO_LONG:${artifact.queryId}`);
  if (fs.existsSync(file)) check(spawnSync(ffmpeg, ["-v", "error", "-i", file, "-f", "null", "-"], {encoding: "utf8", timeout: 120_000}).status === 0, `SELECTED_DECODE:${artifact.queryId}`);
}

const contactPath = path.join(root, result.contactSheet.path);
check(fs.existsSync(contactPath) && shaFile(contactPath) === result.contactSheet.sha256, "CONTACT_SHEET_SHA");
if (fs.existsSync(contactPath)) {
  const metadata = await sharp(contactPath).metadata();
  const stats = await sharp(contactPath).stats();
  check(metadata.width === result.contactSheet.width && metadata.height === result.contactSheet.height, "CONTACT_SHEET_DIMENSIONS");
  check(Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev)) >= 8, "CONTACT_SHEET_NOT_VISIBLE");
}

const wheelPath = path.join(root, dependencyLock.wheel.path);
check(fs.existsSync(wheelPath) && shaFile(wheelPath) === dependencyLock.wheel.sha256, "LANCEDB_WHEEL_SHA");
const lanceProbe = spawnSync(lancePython, ["-c", `import json,lancedb; db=lancedb.connect(${JSON.stringify(path.join(phaseRoot, "lancedb"))}); t=db.open_table('scenes'); print(json.dumps({'version':lancedb.__version__,'rows':t.count_rows()}))`], {encoding: "utf8", timeout: 60_000});
let lanceState = null;
try { lanceState = JSON.parse(lanceProbe.stdout.trim()); } catch {}
check(lanceProbe.status === 0 && lanceState?.version === "0.27.1" && lanceState?.rows === catalog.scenes.length, "LANCEDB_LIVE_PARITY");

for (const key of ["singleSourceFullSha", "boundedAnalysisRange", "sourceReferenceOnly", "sceneDetectionBound", "transcriptBound", "ocrAnalyzed", "vlmTopKOnly", "lanceRowParity", "threeGenreQueries", "selectedRangeBound", "exactSelectedRangesDecoded", "rightsFilteredBeforeRanking", "noProductionUse", "formalAuthorityUnchanged"]) check(result.checks?.[key] === true, `RESULT_CHECK:${key}`);
check(result.checks?.wholeNasScan === false && result.checks?.storyboardMutation === false && result.checks?.productionAdmission === false, "PRODUCTION_BOUNDARY_CHANGED");
const runtimeText = (phase.generality?.runtimeFiles || []).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const term of [...(phase.generality?.forbiddenFixtureIds || []), ...(phase.generality?.forbiddenTopicTerms || [])]) check(!runtimeText.includes(term), `RUNTIME_FIXTURE_LEAK:${term}`);
const currentSha = current.authority?.workspaceSha256 || current.workspaceSha256 || null;
check(authority.status === "PASS" && authority.authority?.workspaceSha256 === currentSha, "CURRENT_AUTHORITY_CHANGED_OR_STALE");

const body = {contract: "A1NasSemanticSceneIndexAudit/v2", status: failures.length ? "FAIL" : "PASS", phaseId: phase.phaseId, resultSha256: result.resultSha256, source: result.source, catalog: result.catalog, lancedb: {...result.lancedb, live: lanceState}, fixtures: result.fixtures, contactSheet: result.contactSheet, selectedArtifacts: result.selectedArtifacts, checks: result.checks, boundary: result.boundary, failures};
const report = {...body, auditSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(phaseRoot, "audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
