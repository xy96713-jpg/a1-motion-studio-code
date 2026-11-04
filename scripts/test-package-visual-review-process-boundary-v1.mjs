import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {Readable} from "node:stream";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

import {runBoundedProcessGroup} from "../apps/studio-next/src/lib/a1-bounded-process-group-v1.mjs";
import {
  A1_PACKAGE_VISUAL_REVIEW_PROCESS_MAX_INPUT_BYTES,
  assertPackageAssemblyParityVisualReviewProcessInput,
  readPackageVisualReviewProcessInput,
  serializePackageAssemblyParityVisualReviewProcessInput,
} from "../apps/studio-next/src/lib/a1-package-visual-review-process-contract-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const cacheRoot = path.join(repoRoot, ".codex-artifacts/system-progress-system-line/package-assembly-parity-review-cache-v1");
const cli = path.join(repoRoot, "scripts/run-package-assembly-parity-visual-review-v1.mjs");
const processTreeFixture = path.join(repoRoot, "scripts/fixtures/bounded-process-group-tree-v1.mjs");
const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const requireFromApp = createRequire(path.join(appRoot, "package.json"));
const sharp = requireFromApp("sharp");

function treeSnapshot(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name)).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    const relative = path.relative(root, absolute);
    return entry.isDirectory()
      ? [{relative, kind: "directory"}, ...treeSnapshot(absolute).map((item) => ({...item, relative: path.join(relative, item.relative)}))]
      : [{relative, kind: entry.isSymbolicLink() ? "symlink" : "file", bytes: entry.isSymbolicLink() ? null : fs.statSync(absolute).size}];
  });
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return predicate();
}

const h = (value) => String(value).repeat(64).slice(0, 64);
const valid = {
  plan: {
    contract: "A1PackageAssetKitPlan/v1",
    shotId: "ED-TEST",
    planSha256: h("1"),
    selectedLookMasterBinding: {artifactPublicUrl: "/generated/system-line/test/master.png", artifactSha256: h("3")},
  },
  recipe: {contract: "A1PackageAssemblyRecipe/v1", shotId: "ED-TEST", recipeSha256: h("2")},
  preliminaryAudit: {
    contract: "A1PackageAssemblyParityAudit/v1",
    shotId: "ED-TEST",
    planSha256: h("1"),
    recipeSha256: h("2"),
    assemblyPreview: {publicUrl: "/generated/system-line/test/assembly.png", sha256: h("4")},
  },
  now: "2026-08-12T23:00:00.000Z",
};

assert.equal(assertPackageAssemblyParityVisualReviewProcessInput(valid), valid);
assert.equal(JSON.parse(serializePackageAssemblyParityVisualReviewProcessInput(valid)).plan.shotId, "ED-TEST");
for (const [mutate, pattern] of [
  [(input) => { input.plan.contract = "Wrong/v1"; }, /contract-invalid/u],
  [(input) => { input.recipe.shotId = "ED-OTHER"; }, /shot-binding-invalid/u],
  [(input) => { input.preliminaryAudit.planSha256 = h("3"); }, /plan-binding-invalid/u],
  [(input) => { input.preliminaryAudit.recipeSha256 = h("4"); }, /recipe-binding-invalid/u],
  [(input) => { input.plan.selectedLookMasterBinding.artifactSha256 = "missing"; }, /artifact-sha-binding-invalid/u],
  [(input) => { input.plan.selectedLookMasterBinding.artifactPublicUrl = "/tmp/outside.png"; }, /public-url-binding-invalid/u],
  [(input) => { input.now = "not-a-time"; }, /now-invalid/u],
]) {
  const forged = structuredClone(valid);
  mutate(forged);
  assert.throws(() => assertPackageAssemblyParityVisualReviewProcessInput(forged), pattern);
}
assert.throws(() => serializePackageAssemblyParityVisualReviewProcessInput({...valid, padding: "x".repeat(A1_PACKAGE_VISUAL_REVIEW_PROCESS_MAX_INPUT_BYTES)}), /input-too-large/u);
await assert.rejects(() => readPackageVisualReviewProcessInput(Readable.from([Buffer.alloc(A1_PACKAGE_VISUAL_REVIEW_PROCESS_MAX_INPUT_BYTES), Buffer.from("x")])), /input-too-large/u);

const cacheBefore = treeSnapshot(cacheRoot);
const workspaceBefore = {sha256: sha256File(workspacePath), bytes: fs.statSync(workspacePath).size};
const runCliFailure = (input, pattern) => {
  const result = spawnSync(process.execPath, [cli], {cwd: repoRoot, input, encoding: Buffer.isBuffer(input) ? null : "utf8", timeout: 15_000, maxBuffer: 2 * 1024 * 1024});
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.notEqual(result.status, 0, `invalid-cli-input-unexpectedly-passed:${output}`);
  assert.match(Buffer.isBuffer(output) ? output.toString("utf8") : String(output), pattern);
};
runCliFailure("{", /cli-json-invalid/u);
runCliFailure(JSON.stringify({...valid, plan: {...valid.plan, contract: "Wrong/v1"}}), /cli-contract-invalid/u);
runCliFailure(JSON.stringify({...valid, plan: {...valid.plan, selectedLookMasterBinding: {...valid.plan.selectedLookMasterBinding, artifactPublicUrl: "/generated/system-line/../../../../package.json"}}}), /master-public-url-escape/u);
runCliFailure(Buffer.concat([Buffer.from("{"), Buffer.alloc(A1_PACKAGE_VISUAL_REVIEW_PROCESS_MAX_INPUT_BYTES, 120)]), /input-too-large/u);

const hashMismatchDir = path.join(publicRoot, "generated/system-line", `.process-boundary-hash-${process.pid}`);
fs.mkdirSync(hashMismatchDir, {recursive: true});
fs.writeFileSync(path.join(hashMismatchDir, "master.png"), "owned-but-hash-mismatched");
const hashMismatchAssembly = path.join(hashMismatchDir, "assembly.png");
fs.writeFileSync(hashMismatchAssembly, "owned-valid-assembly");
try {
  const hashMismatchInput = structuredClone(valid);
  hashMismatchInput.plan.selectedLookMasterBinding.artifactPublicUrl = `/generated/system-line/${path.basename(hashMismatchDir)}/master.png`;
  hashMismatchInput.preliminaryAudit.assemblyPreview.publicUrl = `/generated/system-line/${path.basename(hashMismatchDir)}/assembly.png`;
  hashMismatchInput.preliminaryAudit.assemblyPreview.sha256 = sha256File(hashMismatchAssembly);
  runCliFailure(JSON.stringify(hashMismatchInput), /master-sha-invalid/u);
} finally {
  fs.rmSync(hashMismatchDir, {recursive: true, force: true});
}

const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-package-review-outside-"));
const outsideFile = path.join(outsideRoot, "outside.png");
fs.writeFileSync(outsideFile, "not-an-owned-public-image");
const symlinkDir = path.join(publicRoot, "generated/system-line", `.process-boundary-${process.pid}`);
const symlinkFile = path.join(symlinkDir, "master.png");
fs.mkdirSync(symlinkDir, {recursive: true});
fs.symlinkSync(outsideFile, symlinkFile);
try {
  const symlinkInput = structuredClone(valid);
  symlinkInput.plan.selectedLookMasterBinding.artifactPublicUrl = `/generated/system-line/${path.basename(symlinkDir)}/master.png`;
  runCliFailure(JSON.stringify(symlinkInput), /master-realpath-escape/u);
} finally {
  fs.rmSync(symlinkFile, {force: true});
  fs.rmdirSync(symlinkDir);
  fs.rmSync(outsideRoot, {recursive: true, force: true});
}

const processFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-bounded-process-tree-"));
const pidFile = path.join(processFixtureRoot, "pids.json");
const successfulProcess = await runBoundedProcessGroup({
  executable: process.execPath,
  args: ["-e", "process.stdout.write('bounded-ok')"],
  cwd: repoRoot,
  timeoutMs: 2_000,
  maxStdoutBytes: 4_096,
  maxStderrBytes: 4_096,
  label: "process-group-success-fixture",
});
assert.equal(successfulProcess.stdout, "bounded-ok");
await assert.rejects(() => runBoundedProcessGroup({
  executable: process.execPath,
  args: [processTreeFixture, pidFile],
  cwd: repoRoot,
  timeoutMs: 250,
  maxStdoutBytes: 4_096,
  maxStderrBytes: 4_096,
  killGraceMs: 200,
  label: "process-group-fixture",
}), /process-group-fixture-timeout/u);
assert.equal(await waitFor(() => fs.existsSync(pidFile)), true, "process-group-fixture-pid-file-missing");
const pids = JSON.parse(fs.readFileSync(pidFile, "utf8"));
assert.equal(await waitFor(() => !processAlive(pids.parentPid) && !processAlive(pids.grandchildPid)), true, `process-group-descendant-survived:${JSON.stringify(pids)}`);
const floodPidFile = path.join(processFixtureRoot, "flood-pids.json");
await assert.rejects(() => runBoundedProcessGroup({
  executable: process.execPath,
  args: [processTreeFixture, floodPidFile, "stdout-flood"],
  cwd: repoRoot,
  timeoutMs: 2_000,
  maxStdoutBytes: 1_024,
  maxStderrBytes: 4_096,
  killGraceMs: 200,
  label: "process-group-flood-fixture",
}), /process-group-flood-fixture-stdout-too-large/u);
assert.equal(await waitFor(() => fs.existsSync(floodPidFile)), true, "process-group-flood-pid-file-missing");
const floodPids = JSON.parse(fs.readFileSync(floodPidFile, "utf8"));
assert.equal(await waitFor(() => !processAlive(floodPids.parentPid) && !processAlive(floodPids.grandchildPid)), true, `process-group-flood-descendant-survived:${JSON.stringify(floodPids)}`);
fs.rmSync(processFixtureRoot, {recursive: true, force: true});

const coldReviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-cold-overlay-review-"));
const coldPublicRoot = path.join(coldReviewRoot, "public");
const coldImageRoot = path.join(coldPublicRoot, "generated/system-line/test");
const coldCacheRoot = path.join(coldReviewRoot, "cache-does-not-exist-yet");
fs.mkdirSync(coldImageRoot, {recursive: true});
const coldMaster = path.join(coldImageRoot, "master.png");
const coldAssembly = path.join(coldImageRoot, "assembly.png");
const coldBase = path.join(coldImageRoot, "base.png");
await sharp({create: {width: 32, height: 32, channels: 4, background: {r: 255, g: 80, b: 160, alpha: 0.7}}}).png().toFile(coldMaster);
await sharp({create: {width: 32, height: 32, channels: 4, background: {r: 250, g: 76, b: 156, alpha: 0.7}}}).png().toFile(coldAssembly);
await sharp({create: {width: 32, height: 32, channels: 4, background: {r: 20, g: 30, b: 45, alpha: 1}}}).png().toFile(coldBase);
const coldPlan = {
  contract: "A1PackageAssetKitPlan/v1",
  shotId: "ED-COLD",
  planSha256: h("5"),
  semanticJob: "cold overlay parity fixture",
  copySpec: {exactPhrase: "冷启动"},
  assemblyMode: "OVERLAY",
  selectedLookMasterBinding: {artifactSha256: sha256File(coldMaster), directionId: "cold-overlay", deliveryExpectation: "ALPHA_OVERLAY", baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO"},
  videoContext: {baseFrame: {publicUrl: "/generated/system-line/test/base.png", sha256: sha256File(coldBase)}},
};
const coldRecipe = {contract: "A1PackageAssemblyRecipe/v1", shotId: "ED-COLD", recipeSha256: h("6"), layerCandidateIds: [], placement: {}, zOrder: [], geometry: {}, masks: {}};
const coldAudit = {contract: "A1PackageAssemblyParityAudit/v1", shotId: "ED-COLD", planSha256: h("5"), recipeSha256: h("6"), normalizedPixelDelta: 0.01, assemblyPreview: {sha256: sha256File(coldAssembly)}};
const {runPackageAssemblyParityVisualReview} = await import("../apps/studio-next/src/lib/a1-package-look-master-reviewer-v1.mjs");
assert.equal(fs.existsSync(coldCacheRoot), false);
const coldAssessment = await runPackageAssemblyParityVisualReview({
  plan: coldPlan,
  recipe: coldRecipe,
  preliminaryAudit: coldAudit,
  masterImage: coldMaster,
  assemblyImage: coldAssembly,
  cacheDir: coldCacheRoot,
  runner: async () => ({contract: "A1PackageAssemblyParityVisualReview/v1", verdict: "PASS", totalScore: 24, structuralParity: {status: "PASS", evidence: "fixture"}, materialParity: {status: "PASS", evidence: "fixture"}, semanticParity: {status: "PASS", evidence: "fixture"}, hardFailures: [], summary: "fixture"}),
  now: "2026-08-12T23:05:00.000Z",
});
assert.equal(coldAssessment.status, "PASS");
assert.equal(fs.existsSync(coldCacheRoot), true);
assert.ok(fs.readdirSync(coldCacheRoot).some((name) => name.endsWith(".json")));
fs.rmSync(coldReviewRoot, {recursive: true, force: true});

const cacheAfter = treeSnapshot(cacheRoot);
const workspaceAfter = {sha256: sha256File(workspacePath), bytes: fs.statSync(workspacePath).size};
assert.deepEqual(cacheAfter, cacheBefore, "invalid-review-input-created-cache-state");
assert.deepEqual(workspaceAfter, workspaceBefore, "invalid-review-input-mutated-workspace");

const routeSource = fs.readFileSync(path.join(appRoot, "src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8");
assert.match(routeSource, /runBoundedProcessGroup/u);
assert.match(routeSource, /await runPackageAssemblyParityVisualReviewCli/u);
assert.doesNotMatch(routeSource, /from ["']@\/lib\/a1-package-look-master-reviewer-v1\.mjs["']/u);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1PackageVisualReviewProcessBoundary/v1",
  sharedInputContract: true,
  inputBytesBoundBeforeReviewerLoad: true,
  invalidJsonRejected: true,
  contractMismatchRejected: true,
  contentHashMismatchRejectedBeforeReviewerLoad: true,
  relativePathEscapeRejected: true,
  realpathSymlinkEscapeRejected: true,
  oversizedInputRejected: true,
  successfulProcessOutputReturned: successfulProcess.stdout === "bounded-ok",
  timeoutKillsProcessGroup: true,
  outputFloodKillsProcessGroup: true,
  coldOverlayReviewCacheCreatedAfterSourceValidation: true,
  parentProcessTerminated: !processAlive(pids.parentPid),
  descendantProcessTerminated: !processAlive(pids.grandchildPid),
  floodParentProcessTerminated: !processAlive(floodPids.parentPid),
  floodDescendantProcessTerminated: !processAlive(floodPids.grandchildPid),
  invalidInputCacheWrites: 0,
  invalidInputWorkspaceMutation: false,
  heavyReviewerImportedByNextRoute: false,
}, null, 2));
