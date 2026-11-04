#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const cleanupFile = path.join(artifactRoot, "cleanup-candidates-v1/report.json");
const workspaceFile = path.join(publicRoot, "workspace.json");
const outputFile = path.join(artifactRoot, "superseded-media-quarantine-v1/plan.json");
const sha = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const within = (base, target) => target.startsWith(base + path.sep);

const cleanup = JSON.parse(fs.readFileSync(cleanupFile, "utf8"));
const workspaceBytes = fs.readFileSync(workspaceFile);
const workspace = JSON.parse(workspaceBytes);
const ageMs = Date.now() - Date.parse(cleanup.createdAt);
if (cleanup.contract !== "A1SystemLineCleanupCandidateInventory/v1"
  || cleanup.deletionPerformed !== false || cleanup.movePerformed !== false
  || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > 24 * 60 * 60 * 1000
  || cleanup.sourceWorkspaceSha256 !== workspace.workspaceSha256
  || cleanup.sourcePhaseWorkspaceSha256 !== workspace.workspaceSha256
  || cleanup.sourceAuthorityWorkspaceSha256 !== workspace.workspaceSha256
  || cleanup.sourceWorkspaceFileSha256 !== sha(workspaceBytes)
  || cleanup.candidateInventorySha256 !== sha(cleanup.candidates)) {
  throw new Error("cleanup-inventory-stale-or-invalid");
}

const referenceFiles = [
  workspaceFile,
  path.join(publicRoot, "current-visual-decision-ledger-v1/ledger.json"),
  path.join(artifactRoot, "current-phase.json"),
  path.join(artifactRoot, "system-line-current-authority-v2/audit-report.json"),
  path.join(root, ".codex-artifacts/system-progress/current-phase.json"),
  path.join(root, "work/hupo-69-shot-reconstruction-v1/shot-task-plan-v1.json"),
  path.join(root, "work/system-maturity-consolidation-park-a-line-20260928.json"),
];
const currentText = referenceFiles.filter((file) => fs.existsSync(file))
  .map((file) => fs.readFileSync(file, "utf8")).join("\n");

function inventory(target) {
  let bytes = 0, files = 0;
  const stack = [target];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("cleanup-candidate-symlink-forbidden");
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile()) { bytes += fs.statSync(file).size; files += 1; }
    }
  }
  return {bytes, files};
}
function fileInventory(target) {
  const files = [], stack = [target];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("cleanup-candidate-symlink-forbidden");
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile()) files.push({relativePath: path.relative(target, file), bytes: fs.statSync(file).size, sha256: shaFile(file)});
    }
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

const entries = [];
for (const candidate of cleanup.candidates) {
  if (typeof candidate.path !== "string" || candidate.path.startsWith("/")
    || candidate.path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("cleanup-candidate-path-invalid");
  }
  const absolute = path.resolve(root, candidate.path);
  if (!within(publicRoot, absolute) && !within(artifactRoot, absolute)) throw new Error("cleanup-candidate-outside-scope");
  const exists = fs.existsSync(absolute);
  let status;
  if (!exists && !candidate.exists) status = "ALREADY_ABSENT";
  else if (exists !== candidate.exists || !fs.lstatSync(absolute).isDirectory()) status = "BLOCKED_INVENTORY_DRIFT";
  else {
    const actual = inventory(absolute);
    const publicMarker = within(path.join(root, "apps/studio-next/public"), absolute)
      ? `/${candidate.path.slice("apps/studio-next/public/".length)}` : null;
    const referenced = currentText.includes(candidate.path) || (publicMarker && currentText.includes(publicMarker));
    const mirror = within(publicRoot, absolute)
      ? path.join(artifactRoot, "editorial-asset-workbench-v1", path.relative(publicRoot, absolute)) : null;
    status = actual.bytes !== candidate.bytes || actual.files !== candidate.files
      ? "BLOCKED_INVENTORY_DRIFT"
      : referenced ? "BLOCKED_CURRENT_REFERENCE"
        : mirror && fs.existsSync(mirror) ? "BLOCKED_MIRROR_PARITY"
          : "SAFE_RECOVERABLE_QUARANTINE";
  }
  entries.push({
    id: candidate.id, path: candidate.path, bytes: candidate.bytes, files: candidate.files,
    reason: candidate.reason, status, sourceExists: exists,
    ...(status === "SAFE_RECOVERABLE_QUARANTINE" ? {inventorySha256: sha(fileInventory(absolute))} : {}),
    destinationRelativePath: `superseded-media/${candidate.path}`,
  });
}

const safe = entries.filter((item) => item.status === "SAFE_RECOVERABLE_QUARANTINE");
const blocked = entries.filter((item) => item.status.startsWith("BLOCKED_"));
const body = {
  contract: "A1SystemLineSupersededMediaQuarantinePlan/v1",
  status: safe.length ? "READY_FOR_EXPLICIT_APPLY" : "NO_SAFE_CANDIDATES",
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceWorkspaceFileSha256: sha(workspaceBytes),
  sourceCandidateInventorySha256: cleanup.candidateInventorySha256,
  sourceLedgerSha256: workspace.production?.currentVisualDecisionLedger?.ledgerSha256 || null,
  scope: "EXPLICIT_CLEANUP_CANDIDATES_ZERO_CURRENT_REFERENCE_ONLY",
  entries, safeCount: safe.length, safeBytes: safe.reduce((sum, item) => sum + item.bytes, 0),
  blockedCount: blocked.length, blockedBytes: blocked.reduce((sum, item) => sum + item.bytes, 0),
  absentCount: entries.filter((item) => item.status === "ALREADY_ABSENT").length,
  recoveryPolicy: "MOVE_TO_CONTENT_INVENTORIED_QUARANTINE_AND_RESTORE_BY_MANIFEST",
  deleted: false, currentAuthorityMutationAllowed: false, generatedAt: new Date().toISOString(),
};
const plan = {...body, planSha256: sha({...body, generatedAt: undefined})};
fs.mkdirSync(path.dirname(outputFile), {recursive: true});
if (fs.existsSync(outputFile)) {
  const previous = fs.readFileSync(outputFile);
  const history = path.join(path.dirname(outputFile), "history");
  fs.mkdirSync(history, {recursive: true});
  const snapshot = path.join(history, `${sha(previous)}.json`);
  if (!fs.existsSync(snapshot)) fs.writeFileSync(snapshot, previous, {flag: "wx"});
}
fs.writeFileSync(outputFile, `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({
  status: plan.status, planSha256: plan.planSha256, sourceWorkspaceSha256: plan.sourceWorkspaceSha256,
  safeCount: plan.safeCount, safeBytes: plan.safeBytes, blockedCount: plan.blockedCount,
  absentCount: plan.absentCount, output: path.relative(root, outputFile),
  safe: safe.map((item) => ({path: item.path, bytes: item.bytes})),
  blocked: blocked.map((item) => ({path: item.path, status: item.status})),
}, null, 2));
