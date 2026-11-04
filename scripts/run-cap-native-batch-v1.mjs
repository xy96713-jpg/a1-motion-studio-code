#!/usr/bin/env node
// Serial batch runner: capture -> cap-cli export -> finalize for the current
// cap-native plan. Concurrency stays at 1 because capture relies on a focus-
// locked dedicated window; parallel runs would fight over focus and corrupt
// product identity proofs.
//
// Purity gate (fail-closed): preflight + per-shot pre-record check with
// auto-heal (SIGKILL re-popped TCC dialog), then post-export frame sampling
// of every mp4. Polluted exports are discarded and the shot re-recorded once.
//
// Interrupter freeze: ChatGPT re-summons its Codex companion overlay and the
// TCC dialog can re-pop WHILE a take is running (baked into tail frames).
// Cap records with --detach and only stops at export, so the freeze window
// spans capture + export + purity check; SIGCONT restores only after the
// take is provably clean. SIGSTOP/SIGCONT preserves app state (no kill).
import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const runTag = process.env.A1_CAP_NATIVE_RUN_TAG || "engine-v1";
const only = (process.env.A1_CAP_NATIVE_SHOTS || "").split(",").map(s => s.trim()).filter(Boolean);
const skipExport = process.env.A1_CAP_NATIVE_SKIP_EXISTING_EXPORT === "1";

const plan = JSON.parse(fs.readFileSync(path.join(root, "work/cap-native-production-v2/plan.json"), "utf8"));
if (plan.status !== "READY") throw new Error(`batch-plan-not-ready:${plan.status}`);
const shots = plan.shots.map(s => s.shotId).filter(id => only.length ? only.includes(id) : true);
const cap = process.env.CAP_BIN || "/Applications/Cap.app/Contents/MacOS/cap-cli";

const purityGate = path.join(root, "scripts/a1-cap-purity-gate.py");
function runPurity(args) {
  try {
    return {code: 0, out: execFileSync("python3", [purityGate, ...args], {timeout: 120000, encoding: "utf8"})};
  } catch (err) {
    return {code: err.status ?? 1, out: String(err.stdout || err.message || "")};
  }
}
function purityPrecheck(shotId) {
  let r = runPurity(["shot"]);
  if (r.code !== 0) {
    const heal = runPurity(["heal"]);
    console.error(`PURITY GATE (pre-record) ${shotId}: pollution detected, heal -> ${heal.out.trim()}`);
    r = runPurity(["shot"]);
  }
  if (r.code === 0) return true;
  console.error(`PURITY GATE (pre-record) ${shotId}: display still polluted after heal`);
  console.error(r.out.trim());
  return false;
}
function purityVideoCheck(mp4) {
  if (!fs.existsSync(mp4)) return true; // export step reports its own failure
  const r = runPurity(["video", mp4, "6"]);
  if (r.code === 0) return true;
  console.error(`PURITY GATE (post-export): pollution baked into export`);
  console.error(r.out.trim());
  return false;
}

const FREEZE_PATTERNS = ["ChatGPT", "universalAccessAuthWarn", "UserNotificationCenter", "SkyComputerUseService", "Codex Computer Use"];
let frozenPidsNow = [];
let dialogWatchdog = null;
function freezeInterrupters() {
  runPurity(["heal"]); // purge dialogs while processes can still die (pre-STOP)
  try {
    const out = execFileSync("pgrep", ["-f", FREEZE_PATTERNS.join("|")], {encoding: "utf8"});
    frozenPidsNow = out.split("\n").map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
  } catch {
    frozenPidsNow = []; // pgrep exit 1 = nothing matched
  }
  for (const pid of frozenPidsNow) {
    try { process.kill(pid, "SIGSTOP"); } catch {}
  }
  // SIGSTOP cannot stop macOS from SPAWNING a fresh TCC dialog process
  // mid-take. The runner's own event loop is BLOCKED by execFileSync(capture),
  // so an in-process setInterval never fires during the take (root cause of
  // the ED-22 full-take dialog pollution). Spawn a detached watchdog process
  // instead: it keeps killing dialog instances for the whole freeze window.
  try { dialogWatchdog && dialogWatchdog.kill(); } catch {}
  dialogWatchdog = spawn("bash", [
    "-c",
    `while true; do pkill -9 -f 'universalAccessAuthWarn|UserNotificationCenter' 2>/dev/null; sleep 0.4; done`,
  ], {detached: true, stdio: "ignore"});
  if (frozenPidsNow.length) console.log(`PURITY FREEZE: stopped ${frozenPidsNow.length} interrupter pids for the take`);
}
function thawInterrupters() {
  if (dialogWatchdog) {
    try { process.kill(-dialogWatchdog.pid, "SIGKILL"); } catch {}
    try { dialogWatchdog.kill("SIGKILL"); } catch {}
    dialogWatchdog = null;
  }
  for (const pid of frozenPidsNow) {
    try { process.kill(pid, "SIGCONT"); } catch {}
  }
  if (frozenPidsNow.length) console.log(`PURITY THAW: resumed ${frozenPidsNow.length} interrupter pids`);
  frozenPidsNow = [];
}
process.on("exit", thawInterrupters);
process.on("SIGINT", () => { thawInterrupters(); process.exit(130); });
process.on("SIGTERM", () => { thawInterrupters(); process.exit(143); });

{
  let pre = runPurity(["shot"]);
  if (pre.code !== 0) {
    const heal = runPurity(["heal"]);
    console.log(`PURITY GATE preflight heal: ${heal.out.trim()}`);
    pre = runPurity(["shot"]);
  }
  if (pre.code !== 0) {
    console.error("PURITY GATE (batch preflight): A1 Capture display polluted after heal, refusing to start");
    console.error(pre.out.trim());
    process.exit(7);
  }
  console.log("PURITY GATE preflight: display clean, starting batch");
}

const results = [];
const MAX_SHOT_ATTEMPTS = 2; // one heal + re-record retry when pollution hits mid-take
for (const shotId of shots) {
  const slug = shotId.toLowerCase();
  const outRoot = path.join(root, `work/cap-native-${slug.replace("-", "")}-${runTag}`);
  const capProject = path.join(outRoot, `${slug}-preference.cap`);
  const mp4 = path.join(outRoot, `${slug}-current-storyboard-960x540.mp4`);
  const row = {shotId, ok: false};
  const t0 = Date.now();
  for (let attempt = 1; attempt <= MAX_SHOT_ATTEMPTS && !row.ok; attempt++) {
    row.attempt = attempt;
    if (!purityPrecheck(shotId)) {
      row.purity = "pre-record-polluted";
      break;
    }
    freezeInterrupters();
    try {
      execFileSync("node", [path.join(root, "scripts/capture-cap-native-writing-workbench-preference-v1.mjs")], {
        cwd: root, timeout: 420000, stdio: ["ignore", "ignore", "pipe"],
        env: {...process.env, A1_CAP_NATIVE_SHOT_ID: shotId, A1_CAP_NATIVE_RUN_TAG: runTag, A1_CAP_NATIVE_OVERWRITE: "1"},
      });
      row.capture = "ok";
    } catch (err) {
      row.capture = "fail";
      row.error = String(err.stderr || err.message || err).slice(-500);
      thawInterrupters();
      continue; // transient (e.g. waitForFunction timeout) — spend attempt 2
    }
    try {
      if (skipExport && fs.existsSync(mp4)) {
        row.export = "reused";
      } else {
        execFileSync(cap, ["export", capProject, mp4], {cwd: outRoot, timeout: 300000, stdio: ["ignore", "ignore", "pipe"]});
        row.export = "ok";
      }
    } catch (err) {
      row.export = "fail";
      row.error = String(err.stderr || err.message || err).slice(-500);
      thawInterrupters();
      break;
    }
    if (!purityVideoCheck(mp4)) {
      row.purity = "export-polluted";
      thawInterrupters();
      if (attempt < MAX_SHOT_ATTEMPTS) {
        console.error(`PURITY GATE: re-recording ${shotId} (attempt ${attempt + 1}/${MAX_SHOT_ATTEMPTS})`);
        continue;
      }
      break;
    }
    row.purity = "pure";
    try {
      const receipt = JSON.parse(execFileSync("node", [path.join(root, "scripts/finalize-cap-native-storyboard-candidate-v1.mjs")], {
        cwd: root, timeout: 120000, encoding: "utf8",
        env: {...process.env, A1_CAP_NATIVE_SHOT_ID: shotId, A1_CAP_NATIVE_RUN_TAG: runTag},
      }));
      row.receipt = receipt.status;
      row.video = receipt.video?.path;
      row.failures = receipt.failures;
      row.ok = receipt.status === "READY_FOR_USER_SHOT_REVIEW";
    } catch (err) {
      row.receipt = "fail";
      row.error = String(err.stderr || err.message || err).slice(-500);
    }
    thawInterrupters();
  }
  row.seconds = Math.round((Date.now() - t0) / 1000);
  results.push(row);
  console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(root, `work/cap-native-batch-${runTag}.json`), JSON.stringify({runTag, results}, null, 2));
const okCount = results.filter(r => r.ok).length;
console.log(`BATCH DONE: ${okCount}/${results.length} ready | tag=${runTag}`);
if (okCount !== results.length) process.exitCode = 1;
