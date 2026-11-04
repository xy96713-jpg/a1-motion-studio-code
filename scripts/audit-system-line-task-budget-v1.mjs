#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const queuePath = path.join(root, "work/system-line-task-orchestration-v1/queue.json");
const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));

const failures = [];
if (queue.contract !== "A1SystemLineTaskBatchQueue/v1") failures.push("QUEUE_CONTRACT_INVALID");
if (queue.policies?.maxConcurrentTasks !== 2) failures.push("CONCURRENCY_MUST_EQUAL_TWO");
if (queue.policies?.oneProductionWriter !== true) failures.push("ONE_PRODUCTION_WRITER_REQUIRED");
if (queue.policies?.checkpointMaxBytes > 2048) failures.push("CHECKPOINT_BYTE_BUDGET_EXCEEDED");

const tasks = queue.batches.flatMap((batch) => batch.tasks.map((task) => ({...task, batchId: batch.id})));
const activeStatuses = new Set(["RUNNING", "DISPATCHED", "DISPATCHED_UNVERIFIED"]);
const activeTasks = tasks.filter((task) => activeStatuses.has(task.status));
if (activeTasks.length > queue.policies.maxConcurrentTasks) failures.push("ACTIVE_TASK_LIMIT_EXCEEDED");
if (activeTasks.filter((task) => task.weight === "heavy").length > queue.policies.maxConcurrentHeavyTasks) failures.push("ACTIVE_HEAVY_TASK_LIMIT_EXCEEDED");

const checkpointPath = path.join(root, "work/reference-study-BV11Ren6REA4/CHECKPOINT.md");
const checkpointBytes = fs.statSync(checkpointPath).size;
const checkpointBullets = fs.readFileSync(checkpointPath, "utf8").split("\n").filter((line) => line.startsWith("- ")).length;
if (checkpointBytes > queue.policies.checkpointMaxBytes) failures.push("CHECKPOINT_TOO_LARGE");
if (checkpointBullets > queue.policies.checkpointMaxBullets) failures.push("CHECKPOINT_TOO_MANY_BULLETS");

const processes = execFileSync("ps", ["-axo", "rss=,command="], {encoding: "utf8"}).trim().split("\n").map((line) => {
  const match = line.trim().match(/^(\d+)\s+(.+)$/u);
  return match ? {rssKb: Number(match[1]), command: match[2]} : null;
}).filter(Boolean);
const sumMb = (predicate) => Number((processes.filter(predicate).reduce((sum, row) => sum + row.rssKb, 0) / 1024).toFixed(1));
const codexRssMb = sumMb((row) => /\/Applications\/(?:ChatGPT|Codex)\.app|Codex Framework|\/Resources\/codex\b/u.test(row.command));
const hermesCryptoRssMb = sumMb((row) => /\.hermes|crypto-operator|global-order-flow|bybit/iu.test(row.command));
const physicalMb = Math.round(Number(execFileSync("sysctl", ["-n", "hw.memsize"], {encoding: "utf8"}).trim()) / 1024 / 1024);
const top = execFileSync("top", ["-l", "1", "-s", "0"], {encoding: "utf8"});
const unusedMatch = top.match(/PhysMem:.*?,\s*([\d.]+)([MG])\s+unused/iu);
const unusedMb = unusedMatch ? Math.round(Number(unusedMatch[1]) * (unusedMatch[2].toUpperCase() === "G" ? 1024 : 1)) : null;
const swap = execFileSync("sysctl", ["vm.swapusage"], {encoding: "utf8"});
const swapMatch = swap.match(/total = ([\d.]+)M\s+used = ([\d.]+)M/iu);
const swapTotalMb = swapMatch ? Number(swapMatch[1]) : null;
const swapUsedMb = swapMatch ? Number(swapMatch[2]) : null;

const pressureReasons = [];
if (unusedMb !== null && unusedMb < Math.max(1024, physicalMb * 0.06)) pressureReasons.push("LOW_UNUSED_MEMORY");
if (swapUsedMb !== null && swapUsedMb > 3072) pressureReasons.push("HIGH_SWAP_USAGE");
if (codexRssMb > 4096) pressureReasons.push("HIGH_CODEX_APP_RSS");
const memoryGate = pressureReasons.length ? "PAUSE_NEW_HEAVY_TASKS" : "PASS";
const batch1Accepted = queue.batches[0]?.status === "ACCEPTED";
const availableTaskSlots = memoryGate === "PASS" && batch1Accepted
  ? Math.max(0, queue.policies.maxConcurrentTasks - activeTasks.length)
  : 0;

const result = {
  contract: "A1SystemLineTaskBudgetAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  queueStatus: queue.status,
  activeTasks: activeTasks.map(({id, batchId, weight, status}) => ({id, batchId, weight, status})),
  memory: {physicalMb, unusedMb, swapTotalMb, swapUsedMb, codexRssMb, hermesCryptoRssMb},
  memoryGate,
  pressureReasons,
  availableTaskSlots,
  nextBatch: availableTaskSlots > 0 ? "batch-2-execution-and-diagrams" : null,
  checkpoint: {bytes: checkpointBytes, bullets: checkpointBullets},
  recursiveScanPerformed: false,
  mediaReadPerformed: false,
  failures,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
