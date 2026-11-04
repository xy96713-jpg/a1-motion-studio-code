#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {writeRepairManifestSidecarAtomic} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const sidecarPath = path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json");
const conversationPath = path.join(artifactDir, "canonical-web-generation-v1", "conversation.json");
const args = process.argv.slice(2);
const inline = (name) => args.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || null;
const targetShotIds = (inline("--shotIds") || "ED-07,ED-08,ED-13,ED-19").split(",").map((item) => item.trim()).filter(Boolean);
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
if (!fs.existsSync(sidecarPath) || !fs.existsSync(conversationPath)) throw new Error("canonical-web-reopen-input-missing");
if (targetShotIds.length !== 4) throw new Error("canonical-web-reopen-requires-four-shots");
const workspace = readProjectWorkspace(appRoot);
const runtime = workspace.production.shotIntelligence;
const authority = runtime.canonicalDirectorAuthority;
const canonical = runtime.canonicalDirectorTargetRepairManifest;
const conversation = readJson(conversationPath);
if (authority?.status !== "PASS" || canonical?.boardRebuilt !== false || !targetShotIds.every((shotId) => (canonical.generationEligibleShotIds || []).includes(shotId))) throw new Error("canonical-web-reopen-authority-invalid");
if (workspace.production.generation.summary.queued || workspace.production.generation.summary.running) throw new Error("canonical-web-reopen-queue-not-idle");
if (runtime.currentAssembly?.length) throw new Error("canonical-web-reopen-assembly-not-empty");
const previous = readJson(sidecarPath);
const previousEntries = new Map((previous.entries || []).map((entry) => [entry.shotId, entry]));
for (const shotId of targetShotIds) if (!previousEntries.has(shotId)) throw new Error(`canonical-web-reopen-entry-missing:${shotId}`);
const revisionId = `web-provider-switch-${sha256({authoritySha256: authority.authoritySha256, canonicalManifestSha256: canonical.manifestSha256, targetShotIds, previousStatuses: targetShotIds.map((shotId) => previousEntries.get(shotId).status), conversationId: conversation.id}).slice(0, 16)}`;
const now = new Date().toISOString();
const next = structuredClone(previous);
next.checkpoint = "CANONICAL_TITLE_REPAIR_WEB_BATCH_PENDING";
next.generationDispatched = false;
next.boardRebuilt = false;
next.repairFinalization = {...(next.repairFinalization || {}), status: "NOT_RUN", executed: false};
next.webProviderRevision = {contract: "A1CanonicalWebProviderSwitchRevision/v1", revisionId, provider: "chatgpt-web-conversation", conversationId: conversation.id, conversationUrl: conversation.url, authoritySha256: authority.authoritySha256, canonicalManifestSha256: canonical.manifestSha256, sourceRevisionHash: canonical.sourceRevisionHash, targetShotIds, partialReturnAllowed: true, createdAt: now};
next.entries = (next.entries || []).map((entry) => {
  if (!targetShotIds.includes(entry.shotId)) return entry;
  const history = Array.isArray(entry.retryHistory) ? entry.retryHistory : [];
  return {
    ...entry,
    previousStatus: entry.status,
    previousCandidateSha: entry.candidateSha || null,
    candidateSha: null,
    auditSha: null,
    auditStatus: "NOT_RUN",
    status: "READY_FOR_GENERATION",
    generationState: "READY",
    attempt: Number(entry.attempt || 0) + 1,
    retryHistory: [...history, {kind: "PROVIDER_SWITCH_REVISION", fromProvider: "codex-imagegen", toProvider: "chatgpt-web-conversation", revisionId, at: now, previousStatus: entry.status, previousCandidateSha: entry.candidateSha || null}],
    nextAction: {action: "WEB_BATCH_GENERATE", provider: "chatgpt-web-conversation", revisionId, batchShotIds: targetShotIds, partialReturnAllowed: true},
    webProviderRevisionId: revisionId,
  };
});
next.manifestSha256 = sha256({...next, manifestSha256: undefined});
const committed = writeRepairManifestSidecarAtomic({manifestPath: sidecarPath, manifest: next, expectedManifestSha256: previous.manifestSha256});
const report = {contract: "A1CanonicalWebBatchReopenReport/v1", status: "PASS", revisionId, provider: "chatgpt-web-conversation", targetShotIds, previousStatuses: targetShotIds.map((shotId) => ({shotId, status: previousEntries.get(shotId).status})), manifestSha256: committed.manifestSha256, workspaceSha256: workspace.workspaceSha256, boardSha256: runtime.wholeFilmStaticBoard?.sha256 || null, queue: workspace.production.generation.summary, workerStatus: workspace.production.generation.workerStatus, assemblyCount: runtime.currentAssembly?.length || 0, boardRebuilt: false, imageGenCalls: 0, reportAt: now};
const artifactDirOut = path.join(artifactDir, "canonical-web-generation-v1");
const publicDirOut = path.join(publicDir, "canonical-web-generation-v1");
fs.mkdirSync(artifactDirOut, {recursive: true});
fs.mkdirSync(publicDirOut, {recursive: true});
fs.writeFileSync(path.join(artifactDirOut, "reopen-report.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(publicDirOut, "reopen-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
