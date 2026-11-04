#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const worker = fs.readFileSync(path.join(root, "scripts/run-editorial-project-asset-jobs-v1.mjs"), "utf8");
const executor = fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-visual-asset-executor.ts"), "utf8");
const failures = [];
if (!worker.includes("A1_PROJECT_ASSET_JOB_TIMEOUT_MS")) failures.push("worker-timeout-env");
if (!worker.includes("detached: true") || !worker.includes("process.kill(-child.pid, \"SIGTERM\")") || !worker.includes("process.kill(-child.pid, \"SIGKILL\")")) failures.push("worker-process-group-cancel");
if (!executor.includes("detached: true") || !executor.includes("process.kill(-childPid, \"SIGTERM\")") || !executor.includes("process.kill(-childPid, \"SIGKILL\")")) failures.push("executor-process-group-cancel");
if (failures.length) throw new Error(`asset-generation-timeout-test-failed:${failures.join(",")}`);
console.log(JSON.stringify({status: "PASS", workerTimeout: "A1_PROJECT_ASSET_JOB_TIMEOUT_MS", processGroupCancellation: true}, null, 2));
