#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import http from "node:http";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const workspacePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const expectedUrl = "http://127.0.0.1:4311/system-line-visual-workbench";
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sh = (command, args) => execFileSync(command, args, {encoding: "utf8"}).trim();
const git = (...args) => sh("git", ["-C", root, ...args]);
const fail = (message) => { throw new Error(message); };

function listeningPids() {
  const output = sh("lsof", ["-nP", "-tiTCP:4311", "-sTCP:LISTEN"]);
  return output ? output.split(/\s+/u).filter(Boolean).map(Number) : [];
}

function processCwd(pid) {
  const output = sh("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  return output.split("\n").find((line) => line.startsWith("n"))?.slice(1) || null;
}

function getHttpStatus(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, {timeout: 5000}, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    request.once("timeout", () => request.destroy(new Error("http-timeout")));
    request.once("error", reject);
  });
}

const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const phase = JSON.parse(fs.readFileSync(phasePath, "utf8"));
const pids = listeningPids();
if (pids.length !== 1) fail(`unique-4311-listener-required:${pids.join(",") || "none"}`);
const pid = pids[0];
const cwd = processCwd(pid);
const repoRoot = git("rev-parse", "--show-toplevel");
const branch = git("branch", "--show-current");
const headSha = git("rev-parse", "HEAD");
const workspaceFileSha = sha256File(workspacePath);
const workspaceSha = workspace.workspaceSha256;
const phaseSha = sha256File(phasePath);
const report = {
  contract: "A1UniqueSystemLineRuntimeManifest/v1",
  status: "PASS",
  generatedAt: new Date().toISOString(),
  repoRoot,
  branch,
  headSha,
  active4311: {url: expectedUrl, pid, cwd, command: sh("ps", ["-p", String(pid), "-o", "command="])},
  authorityPath: workspacePath,
  authoritySha256: workspaceSha,
  authorityFileSha256: workspaceFileSha,
  phasePath,
  phaseSha256: phaseSha,
  phaseWorkspaceSha256: phase.authority?.workspaceSha256 || null,
  stage: workspace.production?.authority?.currentStage || null,
  nextAction: workspace.production?.authority?.nextAction?.id || null,
  artifactRoots: [path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1")],
};
if (path.resolve(cwd || "") !== path.resolve(appRoot)) fail(`unique-4311-cwd-mismatch:${cwd}`);
if (repoRoot !== root) fail(`unique-repo-root-mismatch:${repoRoot}`);
if (phase.authority?.workspaceSha256 !== workspaceSha) fail(`unique-authority-phase-sha-mismatch:${phase.authority?.workspaceSha256}:${workspaceSha}`);
const allowedStages = new Set(["whole-film-static-board-review", "motion-ready", "review-whole-film-540p", "whole-film-540p-review"]);
if (!allowedStages.has(workspace.production?.authority?.currentStage)) fail(`unexpected-current-stage:${workspace.production?.authority?.currentStage}`);
if (workspace.production?.generation?.workerStatus !== "frozen") fail("generation-worker-must-remain-frozen");
if (Number(workspace.production?.generation?.summary?.queued || 0) !== 0 || Number(workspace.production?.generation?.summary?.running || 0) !== 0) fail("generation-queue-must-remain-idle");
const status = await getHttpStatus(expectedUrl);
report.active4311.httpStatus = status;
if (status !== 200) fail(`unique-4311-http-status:${status}`);
console.log(JSON.stringify(report, null, 2));
