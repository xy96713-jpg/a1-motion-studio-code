#!/usr/bin/env node
/**
 * run-system-line-dev-v1.mjs — single entry for the system-line dev environment.
 *
 * Starts BOTH services the line needs:
 *   4311  apps/studio-next (the workbench UI)
 *   4288  server.js        (the capability gateway: compiled image search, web asset
 *                          discover/promote, page capture, director, render, export proof)
 *
 * Why both: the node workflow's `material` module calls the search service through
 * A1_NODE_MATERIAL_SEARCH_ORIGIN. With only 4311 running, every material node returns
 * `SEARCH_SERVICE_NOT_CONFIGURED` and the whole line stalls with no visible error.
 *
 * Writer lease is still enforced: the UI dev server only starts when the lease is ACTIVE
 * and delegates to system-line-workbench.
 */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import {spawn, spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const leaseDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1");
const searchPort = Number(process.env.A1_SEARCH_SERVICE_PORT || 4288);
const searchOrigin = `http://127.0.0.1:${searchPort}`;

const lease = JSON.parse(fs.readFileSync(path.join(leaseDir, "writer-lease.json"), "utf8"));
const token = fs.readFileSync(path.join(leaseDir, ".writer-lease.token"), "utf8").trim();
if (lease.status !== "ACTIVE" || !lease.delegates?.includes("system-line-workbench")) {
  throw new Error("system-line-dev-writer-lease-unavailable");
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({host: "127.0.0.1", port});
    socket.setTimeout(400);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

let searchChild = null;
if (await portInUse(searchPort)) {
  console.log(`[system-line] capability gateway already listening on ${searchOrigin}`);
} else {
  console.log(`[system-line] starting capability gateway (server.js) on ${searchOrigin}`);
  searchChild = spawn("node", ["server.js"], {
    cwd: root,
    stdio: "inherit",
    env: {...process.env, PORT: String(searchPort)},
  });
  searchChild.once("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`[system-line] capability gateway exited with code ${code}`);
  });
  // Wait for readiness so the workbench never starts against a dead search origin.
  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline) {
    if (await portInUse(searchPort)) { ready = true; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) {
    if (searchChild) searchChild.kill();
    throw new Error(`system-line-search-service-unavailable:${searchOrigin}`);
  }
  console.log(`[system-line] capability gateway ready on ${searchOrigin}`);
}

const stopSearchChild = () => { if (searchChild && !searchChild.killed) searchChild.kill(); };
process.on("SIGINT", () => { stopSearchChild(); process.exit(130); });
process.on("SIGTERM", () => { stopSearchChild(); process.exit(143); });
process.on("exit", stopSearchChild);

const result = spawnSync("npm", ["--prefix", "apps/studio-next", "run", "dev:system-line"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    A1_SYSTEM_LINE_WRITER_ID: "system-line-workbench",
    A1_SYSTEM_LINE_WRITER_LEASE_TOKEN: token,
    // Without this the node workflow cannot reach the capability gateway and every
    // material node blocks with SEARCH_SERVICE_NOT_CONFIGURED.
    A1_NODE_MATERIAL_SEARCH_ORIGIN: process.env.A1_NODE_MATERIAL_SEARCH_ORIGIN || searchOrigin,
  },
});
stopSearchChild();
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
