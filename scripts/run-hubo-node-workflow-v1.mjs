#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  acceptNodeWorkflowArtifacts,
  readCurrentNodeWorkflow,
  runNodeWorkflowTick,
} from "../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs";
import {readNodeWorkflowState} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {nodeInputHash, summarizeNodeWorkflow} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {screenRecordingNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-screen-recording-adapter-v1.mjs";
import {typographyNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-typography-adapter-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const studyRoot = path.join(repoRoot, "work/bv1a63d6ceba-packaging-study-20260923");
const runtimeRoot = path.join(studyRoot, "runtime");
const appRoot = path.join(runtimeRoot, "apps/studio-next");
const artifactRoot = path.join(studyRoot, "node-artifacts-v1");
const manifestPath = path.join(studyRoot, "node-workflow-input-v1.json");
const adapters = {typography: typographyNodeAdapterV1, recording: screenRecordingNodeAdapterV1};
const sha256 = /^[a-f0-9]{64}$/u;

function assertInside(root, candidate, code) {
  const relative = path.relative(root, candidate);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(code);
}

function ensureDirectory(root, candidate) {
  assertInside(root, candidate, "study-path-outside-root");
  fs.mkdirSync(candidate, {recursive: true});
  const real = fs.realpathSync(candidate);
  assertInside(root, real, "study-symlink-outside-root");
  if (!fs.statSync(real).isDirectory()) throw new Error("study-directory-required");
  return real;
}

function writeJsonAtomically(filename, value) {
  const parent = path.dirname(filename);
  fs.mkdirSync(parent, {recursive: true});
  const temporary = path.join(parent, `.${path.basename(filename)}.${process.pid}.tmp`);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.writeFileSync(temporary, bytes, {flag: "wx", mode: 0o600});
  try {
    fs.renameSync(temporary, filename);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function validateManifest(manifest) {
  if (manifest?.contract !== "HuBoNodeWorkflowResearchInput/v1" || typeof manifest.projectId !== "string"
    || !manifest.projectId.startsWith("hubo-") || typeof manifest.articleTitle !== "string"
    || !manifest.articleTitle.trim() || !sha256.test(manifest.articleSha256 || "")
    || !sha256.test(manifest.sourceVideoSha256 || "") || !Array.isArray(manifest.shots) || !manifest.shots.length) {
    throw new Error("hubo-node-workflow-manifest-invalid");
  }
  if (new Set(manifest.shots.map((shot) => shot?.id)).size !== manifest.shots.length) throw new Error("hubo-node-workflow-duplicate-shot");
  for (const shot of manifest.shots) {
    if (!shot || typeof shot.id !== "string" || !shot.id.trim() || shot.id.includes(":")
      || typeof shot.sourceText !== "string" || !shot.sourceText.trim() || typeof shot.semanticJob !== "string"
      || !shot.nodeWorkflow || typeof shot.nodeWorkflow !== "object" || Array.isArray(shot.nodeWorkflow)) {
      throw new Error("hubo-node-workflow-shot-invalid");
    }
    const parameters = shot.nodeWorkflow.moduleInputs || {};
    const frame = parameters.typography?.sourceFrame;
    if (frame?.path) {
      if (typeof frame.path !== "string" || path.isAbsolute(frame.path) || frame.path.split(/[\\/]/u).includes("..")) {
        throw new Error("hubo-source-frame-path-invalid");
      }
      const absolute = path.resolve(repoRoot, frame.path);
      assertInside(studyRoot, absolute, "hubo-source-frame-outside-study");
      const real = fs.realpathSync(absolute);
      assertInside(studyRoot, real, "hubo-source-frame-symlink-outside-study");
      if (!fs.statSync(real).isFile()) throw new Error("hubo-source-frame-file-required");
    }
    const modules = shot.nodeWorkflow.modules || {};
    for (const module of ["material", "recording", "typography"]) {
      if (typeof modules[module] !== "boolean") throw new Error("hubo-study-module-routing-explicit-required:" + module);
    }
    if (modules.material === true) throw new Error("hubo-study-material-needs-file-backed-artifact-adapter");
    if (modules.typography === true) {
      const dependencies = shot.nodeWorkflow.moduleDependencies?.typography;
      if (!Array.isArray(dependencies)) throw new Error("hubo-study-typography-dependencies-explicit-required");
      if (dependencies.includes("material")) throw new Error("hubo-study-typography-cannot-depend-on-metadata-only-material");
    }
    if (modules.typography === true && (!shot.nodeWorkflow.moduleInputs?.typography?.sourceFrame
      || !shot.nodeWorkflow.moduleInputs?.typography?.exactCopy)) throw new Error("hubo-study-typography-source-and-copy-required");
    const typographyFrame = shot.nodeWorkflow.moduleInputs?.typography?.sourceFrame;
    if (typographyFrame && !sha256.test(typographyFrame.sha256 || "")) throw new Error("hubo-typography-frame-sha-invalid");
    if (modules.recording === true) {
      const source = shot.nodeWorkflow.moduleInputs?.recording?.source?.url;
      let url;
      try { url = new URL(source); } catch { throw new Error("hubo-study-recording-url-invalid"); }
      const allowedNvidiaPage = url.protocol === "https:" && url.hostname === "www.nvidia.com"
        && (url.pathname.startsWith("/en-us/data-center/a100")
          || url.pathname === "/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-nvidia-us-2188504-web.pdf");
      const allowedWorkbench = url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === "4311"
        && url.pathname === "/system-line-visual-workbench";
      if (url.username || url.password || (!allowedNvidiaPage && !allowedWorkbench)) throw new Error("hubo-study-recording-source-not-allowlisted");
      const policy = shot.nodeWorkflow.moduleInputs?.recording?.policy;
      if (policy?.blockMutations !== true || !Array.isArray(policy.allowedMethods)
        || policy.allowedMethods.length === 0
        || policy.allowedMethods.some((method) => !["GET", "HEAD", "OPTIONS"].includes(method))
        || !Number.isSafeInteger(policy.maxDurationMs) || policy.maxDurationMs < 1000 || policy.maxDurationMs > 30_000) {
        throw new Error("hubo-study-recording-policy-not-read-only");
      }
    }
  }
}

function isolatedWorkspace(manifest) {
  const workspaceSha256 = nodeInputHash(manifest);
  const shots = manifest.shots.map((shot) => {
    const nodeWorkflow = structuredClone(shot.nodeWorkflow);
    const frame = nodeWorkflow.moduleInputs?.typography?.sourceFrame;
    if (frame?.path) frame.path = path.resolve(repoRoot, frame.path);
    return {
      shotId: shot.id,
      sourceText: shot.sourceText,
      semanticJob: shot.semanticJob,
      exactCopy: shot.exactCopy || [],
      versionId: shot.version || "hubo-study-v1",
      sourceUrl: shot.sourceUrl || "",
      slotKind: shot.slotKind || "single-image",
      packageType: shot.packageType || "research-study",
      route: shot.route || "RESEARCH_STUDY",
      nodeWorkflow,
    };
  });
  return {
    contract: "HuBoNodeWorkflowResearchWorkspace/v1",
    workspaceSha256,
    directorInput: {projectId: manifest.projectId},
    article: {title: manifest.articleTitle, sourceTextSha256: manifest.articleSha256},
    visualBible: manifest.visualBible || {contract: "HuBoResearchVisualReference/v1", sourceVideoSha256: manifest.sourceVideoSha256},
    production: {
      generation: {workerStatus: "frozen", automaticDispatchAllowed: false, jobs: []},
      shotIntelligence: {
        currentStoryboardAuthority: {contract: "A1CurrentStoryboardAuthority/v1", current: true, shots},
        researchPackets: manifest.researchPackets || [],
      },
    },
  };
}

function prepareStudyRuntime() {
  const realStudyRoot = fs.realpathSync(studyRoot);
  assertInside(repoRoot, realStudyRoot, "study-root-outside-repository");
  const realRuntimeRoot = ensureDirectory(realStudyRoot, runtimeRoot);
  const realAppRoot = ensureDirectory(realStudyRoot, appRoot);
  const realArtifactRoot = ensureDirectory(realStudyRoot, artifactRoot);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  validateManifest(manifest);
  const workspace = isolatedWorkspace(manifest);
  const workspacePath = path.join(realAppRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
  assertInside(realStudyRoot, workspacePath, "study-workspace-outside-root");
  fs.mkdirSync(path.dirname(workspacePath), {recursive: true});

  const previous = readNodeWorkflowState(realAppRoot);
  if (previous?.nodes?.some((node) => node.state === "running") && previous.workspaceSha256 !== workspace.workspaceSha256) {
    throw new Error("hubo-study-workflow-has-running-claims");
  }
  const existing = fs.existsSync(workspacePath) ? JSON.parse(fs.readFileSync(workspacePath, "utf8")) : null;
  if (existing?.workspaceSha256 !== workspace.workspaceSha256) writeJsonAtomically(workspacePath, workspace);
  return {manifest, workspace, runtimeRoot: realRuntimeRoot, appRoot: realAppRoot, artifactRoot: realArtifactRoot};
}

function usage() {
  console.log("Usage: node scripts/run-hubo-node-workflow-v1.mjs <status|tick|retry NODE_ID|accept NODE_ID REVIEWER_ID>");
  console.log("All workspace state and artifacts are pinned under work/bv1a63d6ceba-packaging-study-20260923/.");
}

const [command = "status", ...args] = process.argv.slice(2);
if (command === "help" || command === "--help") {
  usage();
} else {
  const study = prepareStudyRuntime();
  if (command === "status") {
    console.log(JSON.stringify({task: study.manifest.projectId, workspaceSha256: study.workspace.workspaceSha256,
      artifactRoot: study.artifactRoot, workflow: summarizeNodeWorkflow(readCurrentNodeWorkflow(study.appRoot, {adapters}))}, null, 2));
  } else if (command === "tick" || command === "retry") {
    const retryId = command === "retry" ? args[0] : null;
    if (command === "retry" && !retryId) throw new Error("hubo-retry-node-id-required");
    const result = await runNodeWorkflowTick(study.appRoot, {
      workerId: `hubo-study-${process.pid}`,
      retryId,
      origin: process.env.A1_NODE_MATERIAL_SEARCH_ORIGIN,
      artifactRoot: study.artifactRoot,
      ffprobePath: process.env.A1_NODE_FFPROBE_PATH || "ffprobe",
      adapters,
      externalRunning: 0,
    });
    console.log(JSON.stringify({task: study.manifest.projectId, claimed: result.claimed, outcomes: result.outcomes,
      artifactRoot: study.artifactRoot, workflow: summarizeNodeWorkflow(result.workflow)}, null, 2));
    if (result.outcomes.some((outcome) => ["failed", "commit-rejected"].includes(outcome.state))) process.exitCode = 1;
  } else if (command === "accept") {
    const [nodeId, reviewerId] = args;
    if (!nodeId || !reviewerId) throw new Error("hubo-accept-node-and-reviewer-required");
    const workflow = await acceptNodeWorkflowArtifacts(study.appRoot, nodeId, {
      adapters, artifactRoot: study.artifactRoot, reviewerId, ffprobePath: process.env.A1_NODE_FFPROBE_PATH || "ffprobe",
    });
    console.log(JSON.stringify({task: study.manifest.projectId, nodeId, acceptance: "TECHNICAL_BYTES_AND_FORMAT_ONLY",
      visualApproval: "NOT_GRANTED", productionAdmission: false, workflow: summarizeNodeWorkflow(workflow)}, null, 2));
  } else {
    usage();
    throw new Error("hubo-node-workflow-command-invalid");
  }
}
