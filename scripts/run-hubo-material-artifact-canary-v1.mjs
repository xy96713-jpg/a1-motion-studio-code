#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {fileURLToPath} from "node:url";
import {runNodeWorkflowTick} from "../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs";
import {readNodeWorkflowState} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {verifyNodeArtifactManifest} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const studyRoot = path.join(repoRoot, "work/bv1a63d6ceba-packaging-study-20260923");
const artifactRootRequested = path.join(studyRoot, "node-artifacts-material-v2");
const serverPath = path.join(repoRoot, "server.js");
const expectedKinds = new Set(["IMAGE", "JSON_PLAN"]);
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const clean = (value, max = 1000) => typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const within = (root, candidate) => candidate !== root && candidate.startsWith(root + path.sep);

async function choosePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const {port} = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function backendResponds(origin) {
  try {
    const response = await fetch(origin, {signal: AbortSignal.timeout(600)});
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

async function waitForBackend(child, origin, timeoutMs = 45_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("isolated-search-backend-exited-before-ready");
    if (await backendResponds(origin)) return;
    await delay(200);
  }
  throw new Error("isolated-search-backend-startup-timeout");
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([once(child, "exit").then(() => true), delay(5000).then(() => false)]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([once(child, "exit"), delay(3000)]);
  }
}

async function writeWorkspace(appRoot, workspace) {
  const publicPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
  const artifactPath = path.join(appRoot, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/workspace.json");
  for (const filename of [publicPath, artifactPath]) {
    await fs.mkdir(path.dirname(filename), {recursive: true});
    await fs.writeFile(filename, `${JSON.stringify(workspace, null, 2)}\n`, {flag: "wx", mode: 0o600});
  }
}

async function createRuntime(appRoot) {
  const projectId = "hubo-bv1a63d6ceba-material-file-backed-canary";
  const sourceText = "Kilauea volcano map";
  const searchQuery = "Kilauea volcano map";
  const workspaceSeed = {
    contract: "HuBoMaterialArtifactCanaryInput/v1",
    projectId,
    articleTitle: "胡泊全片包装系统素材来源 canary",
    articleSha256: "7075a888836df3024b7dc6a2ad8367839fc626ae0d8a4883d02c2830db1af625",
    sourceVideoSha256: "7075a888836df3024b7dc6a2ad8367839fc626ae0d8a4883d02c2830db1af625",
    shots: [{id: "kilauea-material", sourceText, semanticJob: "Kilauea volcano location map.",
      version: "hubo-material-canary-v1", sourceUrl: "", slotKind: "single-image", route: "RESEARCH_STUDY",
      nodeWorkflow: {modules: {material: true, recording: false, typography: false}, moduleDependencies: {material: []},
        moduleArtifactKinds: {material: {}}, moduleInputs: {material: {}}}}],
    researchPackets: [{contract: "A1ShotResearchPacket/v1", shotId: "kilauea-material", sourceText,
      networkDecision: "HELPFUL", claimType: "place", groundedClaim: "Kilauea volcano place image candidate requires source and rights review.",
      searchQueries: [searchQuery], sources: []}],
  };
  const workspaceSha256 = nodeInputHash(workspaceSeed);
  const workspace = {
    contract: "HuBoNodeWorkflowResearchWorkspace/v1",
    workspaceSha256,
    directorInput: {projectId},
    article: {title: workspaceSeed.articleTitle, sourceTextSha256: workspaceSeed.articleSha256},
    visualBible: {contract: "HuBoResearchVisualReference/v1", sourceVideoSha256: workspaceSeed.sourceVideoSha256},
    production: {
      generation: {workerStatus: "frozen", automaticDispatchAllowed: false, jobs: []},
      shotIntelligence: {
        currentStoryboardAuthority: {contract: "A1CurrentStoryboardAuthority/v1", current: true, lastRevisionSha256: workspaceSha256,
          shots: [{shotId: "kilauea-material", sourceText, semanticJob: "Kilauea volcano location map.",
            versionId: "hubo-material-canary-v1", sourceUrl: "", exactCopy: [], slotKind: "single-image", packageType: "RESEARCH_STUDY",
            route: "RESEARCH_STUDY", nodeWorkflow: structuredClone(workspaceSeed.shots[0].nodeWorkflow)}]},
        researchPackets: workspaceSeed.researchPackets,
      },
    },
  };
  await writeWorkspace(appRoot, workspace);
  return {projectId, workspaceSha256, input: workspaceSeed};
}

async function createOutputRoot() {
  const realStudyRoot = await fs.realpath(studyRoot);
  await fs.mkdir(artifactRootRequested, {recursive: true});
  const artifactRoot = await fs.realpath(artifactRootRequested);
  if (!within(realStudyRoot, artifactRoot)) throw new Error("material-artifact-root-outside-study");
  return {realStudyRoot, artifactRoot};
}

const startedAt = Date.now();
const port = await choosePort();
const backendOrigin = `http://127.0.0.1:${port}`;
const canaryId = `${new Date().toISOString().replace(/[:.]/gu, "-")}-${process.pid}`;
const {realStudyRoot, artifactRoot} = await createOutputRoot();
const backendRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hubo-material-backend-v2-"));
const backendCwd = path.join(backendRoot, "apps/studio-next");
const runtimeRoot = path.join(backendRoot, "runtime/apps/studio-next");
const appRoot = path.join(runtimeRoot, "project");
const childLog = {stdout: "", stderr: ""};
let backendChild = null;
let backendStopped = false;
let reportBody = null;
let thrown = null;

try {
  await fs.mkdir(backendCwd, {recursive: true});
  await fs.mkdir(appRoot, {recursive: true});
  const runtime = await createRuntime(appRoot);
  backendChild = spawn(process.execPath, [serverPath], {
    cwd: backendCwd,
    env: {...process.env, PORT: String(port)},
    stdio: ["ignore", "pipe", "pipe"],
  });
  backendChild.stdout.on("data", (chunk) => { childLog.stdout = `${childLog.stdout}${chunk}`.slice(-4000); });
  backendChild.stderr.on("data", (chunk) => { childLog.stderr = `${childLog.stderr}${chunk}`.slice(-4000); });
  await waitForBackend(backendChild, backendOrigin);

  const tick = await runNodeWorkflowTick(appRoot, {
    workerId: "hubo-material-file-backed-canary",
    origin: backendOrigin,
    artifactRoot,
    externalRunning: 0,
  });
  const saved = readNodeWorkflowState(appRoot);
  const node = saved.nodes.find((item) => item.id === "kilauea-material:material");
  assert.equal(tick.claimed, 1, "one material node should be claimed");
  assert.equal(tick.outcomes.length, 1);
  assert.equal(tick.outcomes[0].state, "needs-review", `unexpected node outcome: ${JSON.stringify({outcome: tick.outcomes[0], diagnostics: node?.result?.searchDiagnostics, searchPlan: node?.result?.materialJob?.searchPlan})}`);
  assert.ok(node, "material workflow node should exist");
  assert.equal(node.state, "needs-review");
  assert.equal(node.acceptance, null, "technical artifact acceptance must not be performed");
  assert.equal(node.result.productionAdmission, false);
  assert.equal(node.result.renderAllowed, false);
  assert.equal(node.result.visualApproval, "NOT_GRANTED");
  assert.equal(node.result.rightsReview, "PENDING");
  assert.equal(node.result.artifactKind, "FILE_BACKED_REVIEW_CANDIDATE");
  assert.ok(node.result.artifactManifest, "file-backed artifact manifest required");
  assert.deepEqual(new Set(node.result.artifactManifest.artifacts.map((item) => item.kind)), expectedKinds);

  const verified = await verifyNodeArtifactManifest(node.result.artifactManifest, {artifactRoot, node});
  const imageArtifact = verified.artifacts.find((item) => item.kind === "IMAGE");
  const planArtifact = verified.artifacts.find((item) => item.kind === "JSON_PLAN");
  assert.ok(imageArtifact && imageArtifact.bytes > 0 && imageArtifact.metadata.width > 0 && imageArtifact.metadata.height > 0);
  assert.ok(planArtifact && planArtifact.metadata.jsonContract === "A1MaterialCandidateProvenance/v1");
  const provenancePath = path.resolve(artifactRoot, planArtifact.path);
  assert.ok(within(artifactRoot, provenancePath), "provenance path must stay in artifactRoot");
  const provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
  assert.equal(provenance.reviewBoundary.rightsReview, "PENDING");
  assert.equal(provenance.reviewBoundary.visualApproval, "NOT_GRANTED");
  assert.equal(provenance.reviewBoundary.renderAllowed, false);
  assert.equal(provenance.reviewBoundary.productionAdmission, false);
  assert.equal(provenance.reviewBoundary.adoptionPerformed, false);
  assert.equal(provenance.candidate.localArtifact.sha256, imageArtifact.sha256);
  assert.equal(provenance.candidate.localArtifact.bytes, imageArtifact.bytes);

  reportBody = {
    contract: "HuBoMaterialFileBackedCanary/v1",
    status: "PASS_REVIEW_ONLY",
    canaryId,
    elapsedMs: Date.now() - startedAt,
    command: "node scripts/run-hubo-material-artifact-canary-v1.mjs",
    workflowPath: "runNodeWorkflowTick -> executeRegisteredNode -> executeMaterialNode",
    backend: {
      source: "server.js",
      origin: backendOrigin,
      isolatedWorkingDirectory: true,
      temporaryWorkingDirectory: path.relative(realStudyRoot, backendRoot),
      endpoint: `${backendOrigin}/api/a1-compiled-image-search`,
      stopped: false,
    },
    request: {query: node.result.materialJob.searchPlan.searchQueries[0], route: node.result.materialJob.searchPlan.route, candidateCount: node.result.materialJob.candidates.length},
    node: {id: node.id, state: node.state, inputSha256: node.inputSha256, accepted: false, acceptance: null},
    artifacts: {
      root: artifactRoot,
      manifestContract: node.result.artifactManifest.contract,
      manifestSha256: verified.manifestSha256,
      items: verified.artifacts,
      provenanceContract: provenance.contract,
      candidate: {
        id: provenance.candidate.candidateId,
        title: provenance.candidate.title,
        source: provenance.candidate.source,
        sourceUrl: provenance.candidate.sourceUrl,
        sourcePageUrl: provenance.candidate.sourcePageUrl,
        author: provenance.candidate.author,
        license: provenance.candidate.license,
      },
    },
    boundary: {
      rightsReview: "PENDING",
      visualApproval: "NOT_GRANTED",
      renderAllowed: false,
      productionAdmission: false,
      adoptionOrPromotionPerformed: false,
      acceptNodeWorkflowArtifactsCalled: false,
    },
  };
  // Keep input evidence available to readers without copying the image into a fake fixture.
  reportBody.input = {projectId: runtime.projectId, workspaceSha256: runtime.workspaceSha256, shotId: runtime.input.shots[0].id};
} catch (error) {
  thrown = error;
} finally {
  await stopBackend(backendChild);
  backendStopped = backendChild ? backendChild.exitCode !== null || backendChild.signalCode !== null : true;
  if (!backendStopped && !thrown) thrown = new Error("isolated-search-backend-did-not-stop");
  try { await fs.rm(backendRoot, {recursive: true, force: true}); }
  catch (error) { if (!thrown) thrown = new Error(`isolated-runtime-cleanup-failed:${error.message}`); }
}

const reportPath = path.join(artifactRoot, `M03-MATERIAL-FILE-BACKED-CANARY-${canaryId}.json`);
const finalReport = reportBody || {
  contract: "HuBoMaterialFileBackedCanary/v1",
  status: "BLOCKED",
  canaryId,
  elapsedMs: Date.now() - startedAt,
  command: "node scripts/run-hubo-material-artifact-canary-v1.mjs",
  backend: {origin: backendOrigin, isolatedWorkingDirectory: true, stopped: backendStopped},
  boundary: {productionAdmission: false, renderAllowed: false, adoptionOrPromotionPerformed: false, acceptNodeWorkflowArtifactsCalled: false},
  failure: clean(thrown?.message || "canary-failed", 800),
  backendLogTail: {stdout: childLog.stdout, stderr: childLog.stderr},
};
finalReport.backend = {...finalReport.backend, stopped: backendStopped};
const reportBytes = Buffer.from(`${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
const realArtifactRoot = await fs.realpath(artifactRoot);
const reportRealParent = await fs.realpath(path.dirname(reportPath));
if (!within(realStudyRoot, realArtifactRoot) || !within(realStudyRoot, reportRealParent)) throw new Error("canary-report-path-outside-study");
await fs.writeFile(reportPath, reportBytes, {flag: "wx", mode: 0o600});
console.log(JSON.stringify({status: finalReport.status, reportPath, reportSha256: sha256(reportBytes), elapsedMs: finalReport.elapsedMs,
  backendStopped, failure: finalReport.failure || null}, null, 2));
if (thrown) {
  console.error(JSON.stringify({error: clean(thrown.message, 800), stdoutTail: childLog.stdout, stderrTail: childLog.stderr}, null, 2));
  process.exitCode = 1;
}
