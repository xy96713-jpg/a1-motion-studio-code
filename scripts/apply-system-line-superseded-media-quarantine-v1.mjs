#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const planFile = path.join(artifactRoot, "superseded-media-quarantine-v1/plan.json");
const cleanupFile = path.join(artifactRoot, "cleanup-candidates-v1/report.json");
const expected = process.env.A1_MEDIA_QUARANTINE_PLAN_SHA256 || null;
const approved = process.env.A1_MEDIA_QUARANTINE_APPLY_APPROVED === "1";
const sha = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha(fs.readFileSync(file));
const within = (base, target) => target.startsWith(base + path.sep);

if (!/^[a-f0-9]{64}$/u.test(String(expected || "")) || !approved) throw new Error("media-quarantine-explicit-plan-approval-required");
const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
const hashBody = structuredClone(plan);
delete hashBody.planSha256;
delete hashBody.generatedAt;
const ageMs = Date.now() - Date.parse(plan.generatedAt);
if (plan.contract !== "A1SystemLineSupersededMediaQuarantinePlan/v1"
  || plan.status !== "READY_FOR_EXPLICIT_APPLY" || !Number.isFinite(ageMs)
  || ageMs < 0 || ageMs > 24 * 60 * 60 * 1000
  || plan.planSha256 !== expected || sha(hashBody) !== plan.planSha256) throw new Error("media-quarantine-plan-invalid");

const workspace = readProjectWorkspace(appRoot);
const workspaceFile = path.join(publicRoot, "workspace.json");
const cleanup = JSON.parse(fs.readFileSync(cleanupFile, "utf8"));
const phase = JSON.parse(fs.readFileSync(path.join(artifactRoot, "current-phase.json"), "utf8"));
const authority = JSON.parse(fs.readFileSync(path.join(artifactRoot, "system-line-current-authority-v2/audit-report.json"), "utf8"));
if (plan.sourceWorkspaceSha256 !== workspace.workspaceSha256
  || plan.sourceWorkspaceFileSha256 !== shaFile(workspaceFile)
  || plan.sourceLedgerSha256 !== workspace.production?.currentVisualDecisionLedger?.ledgerSha256
  || plan.sourceCandidateInventorySha256 !== cleanup.candidateInventorySha256
  || cleanup.sourceWorkspaceSha256 !== workspace.workspaceSha256
  || phase.authority?.workspaceSha256 !== workspace.workspaceSha256
  || authority.authority?.workspaceSha256 !== workspace.workspaceSha256) throw new Error("media-quarantine-plan-authority-drift");

const safe = plan.entries.filter((item) => item.status === "SAFE_RECOVERABLE_QUARANTINE");
if (!safe.length || safe.length !== plan.safeCount || safe.reduce((sum, item) => sum + item.bytes, 0) !== plan.safeBytes) {
  throw new Error("media-quarantine-no-safe-candidates");
}
const rootName = `system-line-superseded-media-${workspace.workspaceSha256.slice(0, 12)}-${plan.planSha256.slice(0, 12)}`;
const quarantineRoot = path.join(root, ".codex-artifacts/quarantine", rootName);
if (fs.existsSync(quarantineRoot)) throw new Error(`media-quarantine-destination-exists:${rootName}`);

function inventory(target) {
  const files = [], stack = [target];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("media-quarantine-source-symlink-forbidden");
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile()) files.push({relativePath: path.relative(target, file), bytes: fs.statSync(file).size, sha256: shaFile(file)});
    }
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

const prepared = [];
for (const item of safe) {
  const source = path.resolve(root, item.path);
  if ((!within(publicRoot, source) && !within(artifactRoot, source))
    || !fs.existsSync(source) || !fs.lstatSync(source).isDirectory()) throw new Error(`media-quarantine-source-invalid:${item.path}`);
  const files = inventory(source), bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const inventorySha256 = sha(files);
  if (bytes !== item.bytes || files.length !== item.files || inventorySha256 !== item.inventorySha256) {
    throw new Error(`media-quarantine-inventory-drift:${item.path}`);
  }
  prepared.push({...item, files, inventorySha256, destination: path.join(quarantineRoot, item.destinationRelativePath)});
}

fs.mkdirSync(quarantineRoot, {recursive: true});
const moved = [];
try {
  for (const item of prepared) {
    if (fs.existsSync(item.destination)) throw new Error(`media-quarantine-target-exists:${item.destination}`);
    fs.mkdirSync(path.dirname(item.destination), {recursive: true});
    fs.renameSync(path.join(root, item.path), item.destination);
    moved.push(item);
  }
} catch (error) {
  for (const item of [...moved].reverse()) {
    const source = path.join(root, item.path);
    if (!fs.existsSync(source) && fs.existsSync(item.destination)) {
      fs.mkdirSync(path.dirname(source), {recursive: true});
      fs.renameSync(item.destination, source);
    }
  }
  throw error;
}

const appliedAt = new Date().toISOString();
const body = {
  contract: "A1SystemLineSupersededMediaQuarantineReceipt/v1", status: "QUARANTINED_RECOVERABLE",
  sourceWorkspaceSha256: workspace.workspaceSha256, sourceWorkspaceFileSha256: plan.sourceWorkspaceFileSha256,
  sourceLedgerSha256: plan.sourceLedgerSha256, sourceCandidateInventorySha256: plan.sourceCandidateInventorySha256,
  planSha256: plan.planSha256, quarantineRoot: path.relative(root, quarantineRoot),
  movedEntryCount: moved.length, movedFileCount: moved.reduce((sum, item) => sum + item.files.length, 0),
  movedBytes: moved.reduce((sum, item) => sum + item.bytes, 0),
  blockedEntries: plan.entries.filter((item) => item.status !== "SAFE_RECOVERABLE_QUARANTINE"),
  moved: moved.map((item) => ({id: item.id, source: item.path, destination: path.relative(root, item.destination),
    bytes: item.bytes, fileCount: item.files.length, inventorySha256: item.inventorySha256, files: item.files})),
  deleted: false, recoverable: true, currentAuthorityMutationPerformed: false, appliedAt,
};
const receipt = {...body, receiptSha256: sha({...body, appliedAt: undefined})};
fs.writeFileSync(path.join(quarantineRoot, "quarantine-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
const reportFile = path.join(artifactRoot, "superseded-media-quarantine-v1/apply-receipt.json");
if (fs.existsSync(reportFile)) {
  const previous = fs.readFileSync(reportFile), history = path.join(path.dirname(reportFile), "history");
  fs.mkdirSync(history, {recursive: true});
  const snapshot = path.join(history, `${sha(previous)}.json`);
  if (!fs.existsSync(snapshot)) fs.writeFileSync(snapshot, previous, {flag: "wx"});
}
fs.writeFileSync(reportFile, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({
  status: receipt.status, planSha256: receipt.planSha256, receiptSha256: receipt.receiptSha256,
  movedEntryCount: receipt.movedEntryCount, movedFileCount: receipt.movedFileCount,
  movedBytes: receipt.movedBytes, quarantineRoot: receipt.quarantineRoot,
  deleted: false, recoverable: true,
}, null, 2));
