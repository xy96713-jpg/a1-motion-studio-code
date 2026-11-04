#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const expectedBasename = "a1-motion-studio-system-line";
const expectedBranch = "codex/system-maturity-line-20260722";
const expectedPort = "4311";
const forbiddenPort = "4310";
const envPath = path.join(root, "apps/studio-next/.env.local");
const canonicalMainPhase = path.join(root, ".codex-artifacts/system-progress/current-phase.json");
const systemLinePhaseDir = path.join(root, ".codex-artifacts/system-progress-system-line");
const reportPath = path.join(root, ".codex-artifacts/system-line/isolation-report.json");
const isolatedAssetRoots = [
  path.join(root, "remotion-renderer/public"),
  path.join(root, "apps/studio-next/public/generated/system-line"),
];
const isolatedSourceRoots = [
  path.join(root, "apps/studio-next/src"),
  path.join(root, "apps/studio-next/scripts"),
  path.join(root, "apps/studio-next/public/style-guides"),
  path.join(root, "remotion-renderer/src"),
  path.join(root, "remotion-renderer/scripts"),
  path.join(root, "scripts"),
  path.join(root, "lib"),
];
const dependencyDirs = [
  path.join(root, "node_modules"),
  path.join(root, "apps/studio-next/node_modules"),
  path.join(root, "remotion-renderer/node_modules"),
];

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options}).trim();
  } catch (error) {
    return "";
  }
}

function portCwd(port) {
  const output = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
  const pid = output.split(/\n/u).slice(1).map((line) => line.trim().split(/\s+/u)[1]).find(Boolean);
  if (!pid) return null;
  const cwd = run("lsof", ["-p", pid]);
  const cwdPath = cwd.split(/\n/u).map((line) => line.trim().split(/\s+/u)).find((parts) => parts[3] === "cwd")?.at(-1) || "";
  return {pid, cwd: cwdPath};
}

function externalSymlinks(startDir) {
  const findings = [];
  if (!fs.existsSync(startDir)) return findings;
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(root, fullPath);
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        const rawTarget = fs.readlinkSync(fullPath);
        let realTarget = "";
        try {
          realTarget = fs.realpathSync(fullPath);
        } catch {
          realTarget = path.resolve(path.dirname(fullPath), rawTarget);
        }
        if (!realTarget.startsWith(`${root}${path.sep}`) && realTarget !== root) {
          findings.push({path: relativePath, target: rawTarget, realTarget});
        }
        continue;
      }
      if (entry.isDirectory()) stack.push(fullPath);
    }
  }
  return findings;
}

const checks = [];
function check(id, pass, detail) {
  checks.push({id, status: pass ? "PASS" : "FAIL", detail});
}

const branch = run("git", ["branch", "--show-current"]);
const topLevel = run("git", ["rev-parse", "--show-toplevel"]);
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const port4310 = portCwd(forbiddenPort);
const port4311 = portCwd(expectedPort);
fs.mkdirSync(systemLinePhaseDir, {recursive: true});

check("worktree-basename", path.basename(root) === expectedBasename, `cwd=${root}`);
check("git-top-level", topLevel === root, `topLevel=${topLevel || "unknown"}`);
check("branch", branch === expectedBranch, `branch=${branch || "unknown"}`);
check("frontend-port-env", new RegExp(`^PORT=${expectedPort}$`, "mu").test(envText), `${envPath} must set PORT=${expectedPort}`);
check("workspace-line-env", /^A1_WORKSPACE_LINE=system-maturity$/mu.test(envText), `${envPath} must set A1_WORKSPACE_LINE=system-maturity`);
const canonicalMainPhaseAliasesSystemLine = fs.existsSync(canonicalMainPhase)
  && fs.lstatSync(canonicalMainPhase).isSymbolicLink()
  && fs.realpathSync(canonicalMainPhase).startsWith(`${fs.realpathSync(systemLinePhaseDir)}${path.sep}`);
check(
  "main-phase-isolated-from-system-line",
  !canonicalMainPhaseAliasesSystemLine,
  fs.existsSync(canonicalMainPhase)
    ? `${path.relative(root, canonicalMainPhase)} may remain as history but must not alias ${path.relative(root, systemLinePhaseDir)}`
    : `${path.relative(root, canonicalMainPhase)} absent`,
);
check("system-line-phase-root", fs.existsSync(systemLinePhaseDir), `${path.relative(root, systemLinePhaseDir)} is the required phase root when phases start`);
check("forbidden-4310-not-this-line", !port4310 || !String(port4310.cwd).startsWith(root), port4310 ? `4310 pid=${port4310.pid} cwd=${port4310.cwd}` : "4310 not listening");
check("4311-not-owned-by-other-line", !port4311 || String(port4311.cwd).startsWith(root), port4311 ? `4311 pid=${port4311.pid} cwd=${port4311.cwd}` : "4311 not listening");
const externalAssetSymlinks = isolatedAssetRoots.flatMap((assetRoot) => externalSymlinks(assetRoot));
check("public-assets-no-cross-worktree-symlinks", externalAssetSymlinks.length === 0, externalAssetSymlinks.length ? externalAssetSymlinks : "no external public asset symlinks");
const externalSourceSymlinks = isolatedSourceRoots.flatMap((sourceRoot) => externalSymlinks(sourceRoot));
check("source-and-style-no-cross-worktree-symlinks", externalSourceSymlinks.length === 0, externalSourceSymlinks.length ? externalSourceSymlinks : "no external source/style symlinks");
const dependencySymlinks = dependencyDirs
  .filter((dependencyDir) => fs.existsSync(dependencyDir) && fs.lstatSync(dependencyDir).isSymbolicLink())
  .map((dependencyDir) => {
    const rawTarget = fs.readlinkSync(dependencyDir);
    let realTarget = "";
    try {
      realTarget = fs.realpathSync(dependencyDir);
    } catch {
      realTarget = path.resolve(path.dirname(dependencyDir), rawTarget);
    }
    return {path: path.relative(root, dependencyDir), target: rawTarget, realTarget};
  });
check("dependency-dirs-not-symlinked", dependencySymlinks.length === 0, dependencySymlinks.length ? dependencySymlinks : "dependency dirs are local directories or absent");

const failures = checks.filter((item) => item.status === "FAIL");
const report = {
  contract: "A1WorkspaceLineIsolationAudit/v1",
  generatedAt: new Date().toISOString(),
  status: failures.length ? "FAIL" : "PASS",
  expected: {
    basename: expectedBasename,
    branch: expectedBranch,
    frontendPort: Number(expectedPort),
    forbiddenPort: Number(forbiddenPort),
    phaseRoot: ".codex-artifacts/system-progress-system-line",
    isolatedAssetRoots: isolatedAssetRoots.map((assetRoot) => path.relative(root, assetRoot)),
    isolatedSourceRoots: isolatedSourceRoots.map((sourceRoot) => path.relative(root, sourceRoot)),
    dependencyDirs: dependencyDirs.map((dependencyDir) => path.relative(root, dependencyDir)),
  },
  observed: {
    root,
    branch,
    topLevel,
    port4310,
    port4311,
  },
  checks,
  failures,
};

fs.mkdirSync(path.dirname(reportPath), {recursive: true});
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, reportPath, failures}, null, 2));
if (failures.length) process.exit(1);
