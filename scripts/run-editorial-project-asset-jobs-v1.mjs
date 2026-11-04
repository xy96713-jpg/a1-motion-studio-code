#!/usr/bin/env node
import crypto from "node:crypto";
import {dispatchProjectNodeTickV1} from "../apps/studio-next/src/lib/a1-project-node-dispatch-v1.mjs";
import {execFileSync, spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {bindProjectAssetOutput, assertProjectAssetWorkspace, recoverProjectAssetJobs, updateProjectAssetJob} from "../apps/studio-next/src/lib/a1-project-asset-workspace-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {commitContentAddressedMedia} from "../apps/studio-next/src/lib/a1-content-addressed-media-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedBlobRoot = path.join(publicRoot, "generated/system-line/immutable-media-blobs-v1");
const projectId = process.argv.find((value) => value.startsWith("--projectId="))?.slice("--projectId=".length) || "";
if (!/^[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff-]{0,119}$/iu.test(projectId)) throw new Error("project-asset-worker-project-id-invalid");
const nodeDispatch = await dispatchProjectNodeTickV1({repoRoot: root, projectId});
if (nodeDispatch) { console.log(JSON.stringify(nodeDispatch, null, 2)); process.exit(0); }
const {publicDir, artifactDir} = projectDirs(appRoot);
const publicProjectDir = path.join(publicDir, "projects", projectId);
const artifactProjectDir = path.join(artifactDir, "projects", projectId);
const workspacePath = path.join(artifactProjectDir, "project-asset-workspace.json");
if (!fs.existsSync(workspacePath)) throw new Error("project-asset-worker-workspace-missing");
fs.mkdirSync(publicProjectDir, {recursive: true});
const lockPath = path.join(artifactProjectDir, ".asset-generation-worker.lock");
let workerHandle;
try { workerHandle = fs.openSync(lockPath, "wx"); } catch { console.log(JSON.stringify({status: "SKIPPED", reason: "project-asset-worker-already-running", projectId})); process.exit(0); }

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pngDimensions = (bytes) => {
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") throw new Error("generated-asset-must-be-png");
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
};
const safeOutput = (relativePath) => {
  const output = path.resolve(publicRoot, relativePath);
  if (!output.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("project-asset-output-outside-public-root");
  return output;
};
const providerConfig = 'model_providers.chatgpt-http={name="ChatGPT HTTP",base_url="https://chatgpt.com/backend-api/codex",wire_api="responses",requires_openai_auth=true,supports_websockets=false,stream_max_retries=1,request_max_retries=1}';
const codexArgs = (prompt) => ["exec", "-c", 'model_provider="chatgpt-http"', "-c", providerConfig, "-c", 'model_reasoning_effort="low"', "--enable", "image_generation", "--ephemeral", "--ignore-rules", "--skip-git-repo-check", prompt];
const generationTimeoutMs = Math.max(60_000, Math.min(12 * 60 * 1000, Number(process.env.A1_PROJECT_ASSET_JOB_TIMEOUT_MS || 12 * 60 * 1000)));

async function lockedUpdate(action, assetId, mutate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return withProjectLock(appRoot, () => {
        const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
        const intake = current.production.projectIntakes?.find((item) => item.projectId === projectId);
        if (!intake?.assetWorkspaceSha256) throw new Error("project-asset-worker-intake-state-missing");
        const projectWorkspace = assertProjectAssetWorkspace(JSON.parse(fs.readFileSync(workspacePath, "utf8")));
        if (projectWorkspace.sha256 !== intake.assetWorkspaceSha256) throw new Error("project-asset-worker-workspace-version-changed");
        const updatedProject = assertProjectAssetWorkspace(mutate(projectWorkspace));
        const next = structuredClone(current);
        const nextIntake = next.production.projectIntakes.find((item) => item.projectId === projectId);
        nextIntake.status = `PROJECT_${updatedProject.status}`;
        nextIntake.assetWorkspaceStatus = updatedProject.status;
        nextIntake.assetWorkspaceSha256 = updatedProject.sha256;
        nextIntake.assetQueuedCount = updatedProject.summary.queued;
        nextIntake.assetApprovedCount = updatedProject.summary.outputApprovedCount;
        nextIntake.updatedAt = updatedProject.updatedAt;
        const event = createProductionEvent({workspace: current, action, targetId: assetId, payload: {projectId, worker: true}});
        next.production.eventLedger.eventCount += 1;
        next.production.eventLedger.lastEventId = event.eventId;
        next.production.eventLedger.lastEventAt = event.createdAt;
        const recalculated = recalculateEditorialAssetWorkbench(next);
        persistProjectState(appRoot, recalculated, {event, files: {[`projects/${projectId}/project-asset-workspace.json`]: updatedProject}});
        return updatedProject;
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "production-state-write-in-progress" || attempt === 29) throw error;
      await sleep(150);
    }
  }
  throw new Error("project-asset-worker-state-lock-timeout");
}

function reusable(job, outputPath) {
  const manifestPath = `${outputPath}.manifest.json`;
  if (!fs.existsSync(outputPath) || !fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const bytes = fs.readFileSync(outputPath);
    const dimensions = pngDimensions(bytes);
    if (manifest.contract !== "A1GeneratedEditorialAssetCache/v1" || manifest.cacheKey !== job.cacheKey || manifest.promptSha256 !== job.promptSha256 || manifest.sha256 !== sha256(bytes) || manifest.width !== dimensions.width || manifest.height !== dimensions.height) return null;
    return {...manifest, cacheHit: true};
  } catch { return null; }
}

async function executeJob(job) {
  const started = Date.now();
  const outputPath = safeOutput(job.outputRelativePath);
  const stagingPath = `${outputPath}.staging-${process.pid}-${Date.now()}.png`;
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  const cached = reusable(job, outputPath);
  if (cached) return {...cached, durationMs: Date.now() - started};
  let codexBin = process.env.A1_CODEX_BIN || "/Applications/ChatGPT.app/Contents/Resources/codex";
  if (!fs.existsSync(codexBin)) codexBin = execFileSync("/usr/bin/which", ["codex"], {encoding: "utf8"}).trim();
  if (!codexBin) throw new Error("codex-cli-unavailable");
  const finalPrompt = `Use the GPT image generation tool exactly once. Save the PNG to this exact path: ${stagingPath}\n${job.prompt}\nThe output is an article-level reusable visual asset, not a finished shot. Do not add factual text, UI, logos or people. Respond only with DONE after the PNG exists.`;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(codexBin, codexArgs(finalPrompt), {cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"], detached: true});
      let tail = "";
      const collect = (chunk) => { tail = `${tail}${chunk.toString()}`.slice(-4000); };
      child.stdout.on("data", collect); child.stderr.on("data", collect);
      const timer = setTimeout(() => {
        try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
        setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ } }, 2_000).unref();
        reject(new Error(`subscription-image-generation-timeout:${generationTimeoutMs}ms`));
      }, generationTimeoutMs);
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("close", (code) => { clearTimeout(timer); if (code === 0 && fs.existsSync(stagingPath)) resolve(); else reject(new Error(`subscription-image-generation-failed:${code}:${tail}`)); });
    });
  } catch (error) {
    fs.rmSync(stagingPath, {force: true});
    throw error;
  }
  const contentAddressedStorage = commitContentAddressedMedia({stagingPath, outputPath, blobRoot: generatedBlobRoot, publicRoot, extension: ".png"});
  const bytes = fs.readFileSync(outputPath);
  const dimensions = pngDimensions(bytes);
  const result = {contract: "A1GeneratedEditorialAssetCache/v1", projectId, assetId: job.assetId, provider: "codex-imagegen", model: "gpt-image-2", prompt: job.prompt, promptSha256: job.promptSha256, cacheKey: job.cacheKey, sha256: sha256(bytes), ...dimensions, cacheHit: false, durationMs: Date.now() - started, generatedAt: new Date().toISOString(), contentAddressedStorage};
  fs.writeFileSync(`${outputPath}.manifest.json`, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

async function runOne(job) {
  await lockedUpdate("project-asset-generation-started", job.assetId, (workspace) => updateProjectAssetJob(workspace, job.id, {status: "running", attempts: job.attempts + 1, startedAt: new Date().toISOString(), error: null}));
  try {
    const result = await executeJob(job);
    await lockedUpdate("project-asset-generation-completed", job.assetId, (workspace) => {
      let next = updateProjectAssetJob(workspace, job.id, {status: "complete", completedAt: new Date().toISOString(), durationMs: result.durationMs, cacheHit: result.cacheHit, output: result, error: null});
      next = bindProjectAssetOutput(next, job.assetId, {publicUrl: `/${job.outputRelativePath}`, sha256: result.sha256, width: result.width, height: result.height, manifestPublicUrl: `/${job.outputRelativePath}.manifest.json`, generatedAt: result.generatedAt, sourceType: "codex-subscription-generated", rights: "project-generated non-factual editorial asset"});
      return next;
    });
  } catch (error) {
    await lockedUpdate("project-asset-generation-failed", job.assetId, (workspace) => updateProjectAssetJob(workspace, job.id, {status: "failed", completedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error)}));
  }
}

try {
  let workspace = assertProjectAssetWorkspace(JSON.parse(fs.readFileSync(workspacePath, "utf8")));
  if (workspace.queue.jobs.some((job) => job.status === "running")) workspace = await lockedUpdate("project-asset-worker-recovered-stale-jobs", null, (current) => recoverProjectAssetJobs(current).workspace);
  const queued = workspace.queue.jobs.filter((job) => job.status === "queued");
  let cursor = 0;
  const worker = async () => { while (cursor < queued.length) await runOne(queued[cursor++]); };
  await Promise.all(Array.from({length: Math.min(2, queued.length)}, () => worker()));
  workspace = assertProjectAssetWorkspace(JSON.parse(fs.readFileSync(workspacePath, "utf8")));
  console.log(JSON.stringify({status: workspace.queue.summary.failed ? "COMPLETE_WITH_FAILURES" : "PASS", projectId, summary: workspace.queue.summary}, null, 2));
} finally {
  if (workerHandle != null) fs.closeSync(workerHandle);
  fs.rmSync(lockPath, {force: true});
}
