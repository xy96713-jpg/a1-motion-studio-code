#!/usr/bin/env node

import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

const root = process.cwd();
const checkpointId = valueFor("--checkpoint-id");
const outputRootArg = valueFor("--output-root");
const finalizeCommit = valueFor("--finalize-commit");

if (!checkpointId || !outputRootArg) {
  throw new Error("--checkpoint-id and --output-root are required");
}

const outputRoot = path.resolve(outputRootArg);
const checkpointDocRoot = path.join(root, "docs/checkpoints", checkpointId);
const artifactPathsFile = path.join(checkpointDocRoot, "artifact-paths.txt");
const manifestPath = path.join(outputRoot, "manifest.json");
const archivePath = path.join(outputRoot, "artifact-bundle.tar.gz");

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout || `exit-${result.status}`}`);
  }
  return result.stdout.trim();
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function relativeToRoot(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function walk(target, files, symlinks) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    const realTarget = fs.realpathSync(target);
    const rootPrefix = `${root}${path.sep}`;
    if (realTarget !== root && !realTarget.startsWith(rootPrefix)) {
      throw new Error(`cross-worktree symlink is not allowed in recovery bundle: ${relativeToRoot(target)} -> ${realTarget}`);
    }
    symlinks.push({path: relativeToRoot(target), target: path.relative(path.dirname(target), realTarget)});
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target).sort()) walk(path.join(target, entry), files, symlinks);
    return;
  }
  if (stat.isFile()) {
    files.push({path: relativeToRoot(target), bytes: stat.size, sha256: sha256(target)});
  }
}

fs.mkdirSync(outputRoot, {recursive: true});

if (finalizeCommit) {
  if (!fs.existsSync(manifestPath)) throw new Error(`checkpoint manifest missing: ${manifestPath}`);
  const manifest = readJson(manifestPath);
  const commit = run("git", ["rev-parse", "--verify", `${finalizeCommit}^{commit}`]);
  const tree = run("git", ["rev-parse", `${commit}^{tree}`]);
  manifest.git.checkpointCommit = commit;
  manifest.git.checkpointTree = tree;
  manifest.git.finalizedAt = new Date().toISOString();
  writeJson(manifestPath, manifest);
  console.log(JSON.stringify({status: "PASS", mode: "finalize", checkpointId, manifestPath, commit, tree}, null, 2));
  process.exit(0);
}

if (!fs.existsSync(artifactPathsFile)) throw new Error(`artifact path list missing: ${artifactPathsFile}`);

const artifactPaths = fs.readFileSync(artifactPathsFile, "utf8")
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

const files = [];
const symlinks = [];
for (const relativePath of artifactPaths) {
  const target = path.resolve(root, relativePath);
  const rootPrefix = `${root}${path.sep}`;
  if (!target.startsWith(rootPrefix)) throw new Error(`artifact path escapes project root: ${relativePath}`);
  if (!fs.existsSync(target)) throw new Error(`required recovery artifact missing: ${relativePath}`);
  walk(target, files, symlinks);
}

files.sort((left, right) => left.path.localeCompare(right.path));
symlinks.sort((left, right) => left.path.localeCompare(right.path));

const currentPhase = readJson(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"));
const candidateReport = readJson(path.join(root, ".codex-artifacts/system-progress-system-line/h-series-preproduction-motion-candidate-v1/report.json"));
const candidateReviewLedger = readJson(path.join(root, ".codex-artifacts/system-progress-system-line/h-series-preproduction-motion-candidate-v1/review-decisions.json"));
const generatedArtworkReviewLedger = readJson(path.join(root, ".codex-artifacts/system-progress-system-line/h-series-generated-editorial-artwork-result-manifest-v1/review-decisions.json"));
const directorReport = readJson(path.join(root, ".codex-artifacts/system-progress-system-line/h-series-preproduction-director-v1/report.json"));
const baseHead = run("git", ["rev-parse", "HEAD"]);
const branch = run("git", ["branch", "--show-current"]);

if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
run("tar", ["-czf", archivePath, "-C", root, ...artifactPaths]);

const manifest = {
  contract: "A1LocalRecoveryCheckpoint/v1",
  checkpointId,
  createdAt: new Date().toISOString(),
  projectRoot: root,
  git: {
    branch,
    baseHead,
    checkpointCommit: null,
    checkpointTree: null,
    finalizedAt: null,
  },
  authority: {
    phaseId: currentPhase.phaseId,
    authorityState: currentPhase.authority?.state,
    authorityVideoSha256: currentPhase.proof?.videoSha256,
    candidatePhaseId: currentPhase.preproductionMotionCandidate?.phaseId,
    candidateReportSha256: currentPhase.preproductionMotionCandidate?.reportSha256,
    candidatePropsSha256: currentPhase.preproductionMotionCandidate?.candidatePropsSha256,
    candidateSceneCount: candidateReport.summary?.candidateSceneCount,
    selectedMotionSceneCount: candidateReport.summary?.selectedSceneCount,
    directorSceneCount: directorReport.summary?.sceneCount,
    pendingVisualReviewCount: candidateReviewLedger?.summary?.pendingCount ?? candidateReport.summary?.pendingVisualReviewCount,
    candidateGeneratedArtworkPendingCount: candidateReport.summary?.generatedArtworkPendingVisualReviewCount,
    generatedArtworkReview: generatedArtworkReviewLedger ? {
      candidateCount: generatedArtworkReviewLedger.summary?.candidateCount,
      reviewedCount: generatedArtworkReviewLedger.summary?.reviewedCount,
      pendingCount: generatedArtworkReviewLedger.summary?.pendingCount,
      approvedCount: generatedArtworkReviewLedger.summary?.approvedCount,
      reviseCount: generatedArtworkReviewLedger.summary?.reviseCount,
      status: generatedArtworkReviewLedger.status,
    } : null,
    generatedArtworkPendingCount: generatedArtworkReviewLedger?.summary?.pendingCount ?? candidateReport.summary?.generatedArtworkPendingVisualReviewCount,
    userApprovalStatus: candidateReport.userApprovalStatus,
    rendererAdoptionAllowed: candidateReport.rendererAdoptionAllowed,
    finalRenderAllowed: candidateReport.finalRenderAllowed,
    resolveExportAllowed: candidateReport.resolveExportAllowed,
  },
  archive: {
    path: archivePath,
    bytes: fs.statSync(archivePath).size,
    sha256: sha256(archivePath),
  },
  artifactRoots: artifactPaths,
  fileCount: files.length,
  totalFileBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files,
  symlinks,
};

writeJson(manifestPath, manifest);
fs.copyFileSync(artifactPathsFile, path.join(outputRoot, "artifact-paths.txt"));
fs.copyFileSync(path.join(checkpointDocRoot, "README.md"), path.join(outputRoot, "README.md"));

console.log(JSON.stringify({
  status: "PASS",
  mode: "create",
  checkpointId,
  manifestPath,
  archivePath,
  archiveBytes: manifest.archive.bytes,
  archiveSha256: manifest.archive.sha256,
  fileCount: manifest.fileCount,
  totalFileBytes: manifest.totalFileBytes,
  symlinkCount: manifest.symlinks.length,
}, null, 2));
