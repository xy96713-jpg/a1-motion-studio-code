import crypto from "node:crypto";
import {execFileSync, spawn} from "node:child_process";
import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  createProductionEvent,
  recoverStaleGenerationJobs,
  updateGenerationJob,
} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  projectDirs,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createGlyphCutout} from "./lib/a1-glyph-cutout-v1.mjs";
import {buildVisualGenerationFreeze, recordGenerationConcurrencyBenchmark, registerGeneratedVisualCandidate} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";
import {writeGenerationRuntimeSidecar} from "../apps/studio-next/src/lib/a1-generation-runtime-sidecar-v1.mjs";
import {buildDirtySet, dirtySetSnapshotEntries} from "../apps/studio-next/src/lib/a1-dirty-set-v1.mjs";
import {assertGenerationWorkerCompletionBoundary} from "../apps/studio-next/src/lib/a1-packaging-orchestration-boundary-v1.mjs";
import {applyGenerationEventToManifest, auditRecordFromRawReference, buildRepairManifest, compileGenerationDispatch, compileGenerationDispatchWithAuthoritativeBuilder, updateRepairManifestSidecar, writeRepairManifestSidecarAtomic} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {assertUniversalReferenceAttachmentManifest, buildCodexImageAttachmentArgs, buildUniversalReferenceAttachmentManifest, normalizeUniversalReferenceInputs, UNIVERSAL_REFERENCE_PRODUCTION_METHOD, A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";
import {commitContentAddressedMedia} from "../apps/studio-next/src/lib/a1-content-addressed-media-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const sharp = createRequire(path.join(appRoot, "package.json"))("sharp");
const publicRoot = path.join(appRoot, "public");
const generatedBlobRoot = path.join(publicRoot, "generated/system-line/immutable-media-blobs-v1");
const {artifactDir} = projectDirs(appRoot);
fs.mkdirSync(artifactDir, {recursive: true});
const workerLock = path.join(artifactDir, ".generation-worker.lock");
const compositeWorkerScript = path.join(root, "scripts/render-generated-visual-composite-v2.mjs");
const compositeWorkerLock = path.join(artifactDir, ".generated-visual-composite-worker.lock");
const incrementalRepairDir = path.join(artifactDir, "incremental-repair-executor-v1");
const incrementalRepairManifestPath = path.join(incrementalRepairDir, "repair-manifest.json");
const generationDirtySetPath = path.join(incrementalRepairDir, "generation-dirty-set-v1.json");
const canonicalWebConversationConfigPath = path.join(artifactDir, "canonical-web-generation-v1", "conversation.json");
const GOLDEN_FILM_MATURITY_WAVE_CONTRACT = "A1GoldenFilmVisualSystemMaturityGenerationWave/v1";

let workerHandle;
try {
  workerHandle = fs.openSync(workerLock, "wx");
} catch {
  console.log(JSON.stringify({status: "SKIPPED", reason: "generation-worker-already-running"}));
  process.exit(0);
}

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeOutput = (relativePath) => {
  const output = path.resolve(publicRoot, relativePath);
  if (!output.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("generation-output-outside-public-root");
  return output;
};
const pngDimensions = (bytes) => {
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") throw new Error("generated-asset-must-be-png");
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
};

function writeGenerationDirtySet(workspace, queued) {
  const previous = fs.existsSync(generationDirtySetPath)
    ? (() => { try { return JSON.parse(fs.readFileSync(generationDirtySetPath, "utf8")); } catch { return null; } })()
    : null;
  const currentEntries = (workspace.production?.generation?.jobs || []).map((job) => ({
    key: job.id,
    shotId: job.shotId || null,
    fingerprint: job.generationInputHash || job.cacheKey || job.promptSha256 || job.id,
    outputExists: job.status !== "complete" || Boolean(job.output?.sha256 || job.output?.publicUrl),
    outputValid: !["failed", "stale"].includes(job.status),
  }));
  const dirtySet = buildDirtySet({
    currentEntries,
    previousEntries: previous?.entries || [],
  });
  const snapshot = {
    ...dirtySet,
    generatedAt: new Date().toISOString(),
    dispatch: {
      queuedJobIds: queued.map((job) => job.id),
      queuedCount: queued.length,
      policy: "cache-miss-only-atomic-admission",
    },
    entries: dirtySetSnapshotEntries(currentEntries).map((entry) => ({
      ...entry,
      dirty: dirtySet.dirtyIds.includes(entry.key),
      reasons: dirtySet.entries.find((item) => item.key === entry.key)?.reasons || [],
    })),
  };
  fs.mkdirSync(path.dirname(generationDirtySetPath), {recursive: true});
  const temporary = `${generationDirtySetPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, generationDirtySetPath);
  return snapshot;
}

function canonicalTitleRepairActive(workspace) {
  const runtime = workspace.production?.shotIntelligence || {};
  const authority = runtime.canonicalDirectorAuthority || null;
  const manifest = runtime.canonicalDirectorTargetRepairManifest || null;
  const targetIds = manifest?.generationEligibleShotIds || [];
  return authority?.status === "PASS"
    && manifest?.authoritySha256 === authority.authoritySha256
    && manifest?.sourceRevisionHash === authority.sourceRevisionHash
    && manifest?.boardRebuilt === false
    && targetIds.length > 0
    && targetIds.every((shotId) => ["ED-07", "ED-08", "ED-13", "ED-19"].includes(shotId));
}

function canonicalTitleRepairCanaryActive(workspace) {
  return workspace.production?.shotIntelligence?.canonicalDirectorTargetRepairManifest?.canaryOnly === true;
}

function canaryRepairControllerState() {
  return {dispatch: {jobs: [], pendingCount: 0, dispatchBlocked: true, continuation: false}};
}

function canonicalWebPrimaryActive(workspace) {
  if (process.env.A1_ALLOW_LOCAL_GENERATION_FALLBACK === "1"
    || !canonicalTitleRepairActive(workspace)
    || workspace.production?.generation?.providerRouting?.webConversation?.dispatchAllowed === false
    || !fs.existsSync(canonicalWebConversationConfigPath)) return false;
  try {
    const config = JSON.parse(fs.readFileSync(canonicalWebConversationConfigPath, "utf8"));
    return config.status === "READY"
      && config.providerPolicy?.primaryProvider === "chatgpt-web-conversation"
      && config.policy?.fallbackRequiresExplicitFlag === true;
  } catch {
    return false;
  }
}

function goldenFilmMaturityWaveActive(workspace) {
  const maturity = workspace.production?.goldenFilmVisualSystemMaturity;
  return maturity?.current === true
    && ["GENERATION_QUEUED", "GENERATION_RUNNING"].includes(maturity.status);
}

function approvedMasterLayerPilotActive(workspace) {
  const pilot = workspace.production?.shotIntelligence?.approvedMasterLayerPilot;
  return pilot?.status === "DISPATCH_ALLOWED"
    && Array.isArray(pilot.dispatchJobIds)
    && pilot.dispatchJobIds.length > 0;
}

function dedupeGenerationJobsById(workspace) {
  const jobs = workspace.production?.generation?.jobs || [];
  const groups = new Map();
  for (const job of jobs) {
    if (!groups.has(job.id)) groups.set(job.id, []);
    groups.get(job.id).push(job);
  }
  const duplicates = [...groups.entries()].filter(([, items]) => items.length > 1);
  if (!duplicates.length) return workspace;
  const next = structuredClone(workspace);
  const priority = {complete: 5, running: 4, queued: 3, failed: 2, stale: 1, cancelled: 0};
  for (const [jobId, items] of duplicates) {
    const keeper = [...items].sort((left, right) => (priority[right.status] || 0) - (priority[left.status] || 0))[0];
    let kept = false;
    for (const job of next.production.generation.jobs) {
      if (job.id !== jobId) continue;
      if (!kept && job.status === keeper.status && job.generationInputHash === keeper.generationInputHash) {
        kept = true;
        continue;
      }
      if (["queued", "running"].includes(job.status)) {
        Object.assign(job, {status: "cancelled", error: "duplicate-generation-job-id-superseded", cancelledAt: new Date().toISOString()});
      }
    }
  }
  const summary = {queued: 0, running: 0, complete: 0, failed: 0, stale: 0, cancelled: 0, total: 0};
  for (const job of next.production.generation.jobs) {
    const key = ["queued", "running", "complete", "failed", "stale", "cancelled"].includes(job.status) ? job.status : "cancelled";
    summary[key] += 1;
    summary.total += 1;
  }
  next.production.generation.summary = summary;
  next.production.generation.workerStatus = summary.running || summary.queued ? "active" : "idle";
  next.production.generation.updatedAt = new Date().toISOString();
  return next;
}

function buildIncrementalRepairControllerState(workspace, {persistSidecar = true} = {}) {
  const runtime = workspace.production?.shotIntelligence || {};
  const canonicalRepair = runtime.canonicalDirectorTargetRepairManifest || null;
  const canonicalScope = new Set(canonicalRepair?.generationEligibleShotIds || []);
  const candidateRecords = [
    ...(workspace.production?.generation?.jobs || []).map((job) => ({
      shotId: job.shotId || null,
      lookMasterPlanSha256: job.lookMasterPlanSha256 || null,
      prompt: job.prompt || null,
      promptSha256: job.promptSha256 || null,
      directionFingerprint: job.candidateDirection?.fingerprint || null,
      attempts: job.attempts || 0,
      output: job.output || null,
    })),
    ...(runtime.lookMasterRawReferences || []).filter((raw) => raw.current !== false).map((raw) => ({
      ...raw,
      isRawReference: true,
      artifact: raw.artifact || null,
      // Raw references are immutable generation results as well as audit
      // inputs. Keep them in the candidate index so a later worker compile
      // can bind the current-plan artifact instead of resetting a completed
      // repair to NO_CANDIDATE_BOUND.
      output: raw.output || raw.artifact || null,
      lookMasterPlanSha256: raw.lookMasterPlanSha256 || raw.planSha256 || raw.artifact?.planSha256 || null,
      prompt: raw.prompt || raw.artifact?.prompt || null,
      promptSha256: raw.promptSha256 || raw.artifact?.promptSha256 || null,
      attempts: raw.artifact?.attempts || 1,
    })),
  ];
  const auditRecords = (runtime.lookMasterRawReferences || []).map(auditRecordFromRawReference).filter(Boolean);
  const previousManifest = fs.existsSync(incrementalRepairManifestPath) ? (() => { try { return JSON.parse(fs.readFileSync(incrementalRepairManifestPath, "utf8")); } catch { return null; } })() : null;
  const rawManifest = buildRepairManifest({workspace, candidateRecords, auditRecords, previousManifest, mode: "production-controller"});
  const manifest = canonicalScope.size
    ? {
        ...rawManifest,
        canonicalRepairBinding: {
          ...(rawManifest.canonicalRepairBinding || {}),
          authoritySha256: runtime.canonicalDirectorAuthority?.authoritySha256 || null,
          manifestSha256: canonicalRepair?.manifestSha256 || null,
          sourceRevisionHash: canonicalRepair?.sourceRevisionHash || runtime.canonicalDirectorAuthority?.sourceRevisionHash || null,
          targetShotIds: [...canonicalScope],
        },
        entries: (rawManifest.entries || []).map((entry) => {
          if (!entry.reasonCodes?.includes("PACKAGE_ROUTE") || canonicalScope.has(entry.shotId)) return entry;
          return {...entry, status: "OUTSIDE_CANONICAL_REPAIR_SCOPE", generationState: "BLOCKED", nextAction: {action: "NONE"}};
        }),
      }
    : rawManifest;
  const dispatch = compileGenerationDispatch(manifest, {
    automaticDispatchAllowed: workspace.production.generation.automaticDispatchAllowed === true || canonicalTitleRepairActive(workspace),
    workerStatus: workspace.production.generation.workerStatus,
    runningCount: workspace.production.generation.summary?.running || 0,
    existingJobs: workspace.production.generation.jobs || [],
    maxConcurrency: 2,
  });
  if (persistSidecar) {
    fs.mkdirSync(incrementalRepairDir, {recursive: true});
    writeRepairManifestSidecarAtomic({
      manifestPath: incrementalRepairManifestPath,
      manifest: dispatch.manifest || manifest,
      expectedManifestSha256: previousManifest?.manifestSha256 || null,
      allowCurrentAuthorityMutation: true,
    });
  }
  return {manifest: dispatch.manifest || manifest, dispatch};
}

async function persistIncrementalRepairEvent({shotId, event, candidateSha = null, audit = null, enabled = true} = {}) {
  if (!enabled || !shotId || !fs.existsSync(incrementalRepairManifestPath)) return;
  try {
    await updateRepairManifestSidecar({
      manifestPath: incrementalRepairManifestPath,
      update: (manifest) => applyGenerationEventToManifest(manifest, {shotId, event, candidateSha, audit, now: new Date().toISOString()}),
      allowCurrentAuthorityMutation: true,
    });
  } catch {
    // The workspace queue remains authoritative if an old sidecar is absent or malformed.
  }
}

function compileMissingIncrementalGenerationJobs(workspace) {
  const state = buildIncrementalRepairControllerState(workspace);
  if (state.dispatch.dispatchBlocked || !state.dispatch.jobs.some((job) => !job.existingJobId)) return {workspace, state, createdJobs: []};
  const dispatchOptions = {
    automaticDispatchAllowed: workspace.production.generation.automaticDispatchAllowed === true || canonicalTitleRepairActive(workspace),
    workerStatus: workspace.production.generation.workerStatus,
    runningCount: workspace.production.generation.summary?.running || 0,
    maxConcurrency: 2,
  };
  const compiled = compileGenerationDispatchWithAuthoritativeBuilder(state.manifest, {
    workspace,
    ...dispatchOptions,
    queueBuilder: (currentWorkspace, dispatchJob) => queuePackageLookMasterGenerationJobs(currentWorkspace, dispatchJob.shotId, {
      candidateIndices: [dispatchJob.candidateIndex || dispatchJob.entry?.candidateIndex || 1],
      generationMode: dispatchJob.entry?.nextAction?.action === "SWITCH_PRIMITIVE" ? "PRIMITIVE_SWITCH" : "LOOK_MASTER_REPAIR",
      canonicalRepairBinding: state.manifest.canonicalRepairBinding || null,
      primitiveId: dispatchJob.primitiveId || dispatchJob.entry?.primitiveId || null,
      repairAttempt: dispatchJob.attempt || dispatchJob.entry?.attempt || 0,
    }),
  });
  return {...compiled, state};
}

const provider = {
  id: "chatgpt-http",
  config: 'model_providers.chatgpt-http={name="ChatGPT HTTP",base_url="https://chatgpt.com/backend-api/codex",wire_api="responses",requires_openai_auth=true,supports_websockets=false,stream_max_retries=1,request_max_retries=1}',
};

export function buildCodexArgs(prompt, imagePaths = []) {
  return [
    "exec",
    "-c", `model_provider="${provider.id}"`,
    "-c", provider.config,
    // The desktop account cannot use the machine's DeepSeek default model.
    // Pin the child image-generation worker to the account's current
    // ChatGPT model slug; the machine default is a DeepSeek-only model.
    "-m", "gpt-5.6-sol",
    "-c", 'model_reasoning_effort="low"',
    "--enable", "image_generation",
    "--ephemeral",
    "--ignore-rules",
    "--skip-git-repo-check",
    prompt,
    // The current Codex CLI treats --image <FILE>... as a variadic option.
    // Put the positional prompt first; otherwise the image paths consume the
    // prompt and the child falls back to stdin (which the worker intentionally
    // closes), yielding "No prompt provided via stdin".
    ...buildCodexImageAttachmentArgs(imagePaths),
  ];
}

async function lockedUpdate(action, targetId, mutate, files = {}) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return withProjectLock(appRoot, () => {
        const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
        const event = createProductionEvent({workspace: current, action, targetId, payload: {worker: true}});
        let next = mutate(current);
        assertGenerationWorkerCompletionBoundary(current, next);
        next.production.eventLedger.eventCount += 1;
        next.production.eventLedger.lastEventId = event.eventId;
        next.production.eventLedger.lastEventAt = event.createdAt;
        next = recalculateEditorialAssetWorkbench(next);
        persistProjectState(appRoot, next, {event, files});
        return next;
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "production-state-write-in-progress" || attempt === 19) throw error;
      await sleep(150);
    }
  }
  throw new Error("production-state-write-lock-timeout");
}

function reusable(job, outputPath) {
  const manifestPath = `${outputPath}.manifest.json`;
  if (!fs.existsSync(outputPath) || !fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const bytes = fs.readFileSync(outputPath);
    const dimensions = pngDimensions(bytes);
    if (manifest.contract !== "A1GeneratedEditorialAssetCache/v1" || manifest.cacheKey !== job.cacheKey || manifest.promptSha256 !== job.promptSha256 || manifest.sha256 !== sha256(bytes) || manifest.width !== dimensions.width || manifest.height !== dimensions.height) return null;
    if (["package-look-master", "package-layer"].includes(job.targetKind)
      && (manifest.productionMethod !== UNIVERSAL_REFERENCE_PRODUCTION_METHOD
        || manifest.referenceAttachmentManifestSha256 !== job.referenceAttachmentManifest?.manifestSha256
        || manifest.imagegenAttachmentCount !== job.referenceAttachmentManifest?.fileCount)) return null;
    return {...manifest, cacheHit: true};
  } catch {
    return null;
  }
}

function compactUniversalProviderPrompt(prompt) {
  const source = String(prompt || "");
  const slice = (start, end = null) => {
    const startIndex = source.indexOf(start);
    if (startIndex < 0) return "";
    const endIndex = end ? source.indexOf(end, startIndex + start.length) : source.length;
    return source.slice(startIndex, endIndex < 0 ? source.length : endIndex).trim();
  };
  const prefixEnd = source.indexOf("PRESENTATION:");
  const prefix = prefixEnd > 0 ? source.slice(0, prefixEnd).trim() : source.trim();
  const presentation = slice("PRESENTATION:", "The language itself must perform").split("\n")[0];
  const language = slice("The language itself must perform", "HERO TITLE SYSTEM:");
  const hero = slice("HERO TITLE SYSTEM:", "CANONICAL CREATOR PACKAGING AXES:");
  const canonical = slice("CANONICAL CREATOR PACKAGING AXES:", "CANONICAL VISUAL BINDING:").split(". ").slice(0, 3).join(". ");
  const video = slice("Video context:", "CURRENT COLOR CONTRACT:");
  const color = slice("CURRENT COLOR CONTRACT:", "Direction ");
  const direction = slice("Direction ", "PLACEMENT CONTRACT:");
  const placement = slice("PLACEMENT CONTRACT:", "HARD RETRY CONTRACT:");
  const hardRetry = slice("HARD RETRY CONTRACT:");
  const compacted = [
    prefix,
    presentation,
    language,
    hero,
    canonical,
    "REFERENCE CONTRACT: the attached images are mandatory multimodal inputs. Produce one complete integrated 16:9 Look Master around the actual hold-frame geometry. Preserve presenter position and negative space; keep face, hair and body readable. The hold frame is reference-only for a transparent overlay: do not bake the camera plate, emit a sticker, corner card, HUD, fake UI, logo, citation, or invented evidence.",
    video,
    color,
    direction,
    placement,
    hardRetry,
  ].filter(Boolean).join("\n\n").replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
  return compacted.length < source.length ? compacted : source;
}

async function executeJob(job) {
  const started = Date.now();
  const outputPath = safeOutput(job.outputRelativePath);
  const stagingPath = `${outputPath}.staging-${process.pid}-${Date.now()}.png`;
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  const cached = reusable(job, outputPath);
  if (cached) return {...cached, durationMs: Date.now() - started};
  let codexBin = process.env.A1_CODEX_BIN || "/Applications/ChatGPT.app/Contents/Resources/codex";
  if (!fs.existsSync(codexBin)) {
    const discovered = execFileSync("/usr/bin/which", ["codex"], {encoding: "utf8"}).trim();
    if (!discovered) throw new Error("codex-cli-unavailable");
    codexBin = discovered;
  }
  const declaredReferences = job.referenceInputs || [];
  if (["package-look-master", "package-layer"].includes(job.targetKind) && declaredReferences.length === 0) throw new Error("generation-reference-inputs-required");
  const universalPackagingJob = ["package-look-master", "package-layer"].includes(job.targetKind);
  if (universalPackagingJob && (job.productionMethod !== UNIVERSAL_REFERENCE_PRODUCTION_METHOD || job.referencePackagingContract !== A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT || !job.referenceAttachmentManifest)) throw new Error("universal-reference-packaging-contract-required");
  const normalizedReferences = universalPackagingJob
    ? normalizeUniversalReferenceInputs(declaredReferences, {publicRoot})
    : declaredReferences.map((item, index) => {
      if (!String(item.publicUrl || "").startsWith("/generated/system-line/")) throw new Error(`generation-reference-public-url-required:${item.id || item.kind || "unknown"}`);
      const localPath = safeOutput(String(item.publicUrl).replace(/^\//u, ""));
      if (!fs.existsSync(localPath)) throw new Error(`generation-reference-file-missing:${item.id || item.kind || "unknown"}`);
      const expectedSha = String(item.sha256 || item.sourceSha256 || item.artifactSha256 || "");
      if (!expectedSha || sha256(fs.readFileSync(localPath)) !== expectedSha) throw new Error(`generation-reference-sha-mismatch:${item.id || item.kind || "unknown"}`);
      if (!item.role && !item.kind) throw new Error(`generation-reference-role-required:${item.id || "unknown"}`);
      return {...item, sourcePath: localPath, sourceSha256: expectedSha, generationAttachmentIndex: index};
    });
  const attachmentPaths = normalizedReferences.map((item) => item.sourcePath);
  const actualAttachmentManifest = universalPackagingJob
    ? buildUniversalReferenceAttachmentManifest({jobId: job.id, referenceInputs: normalizedReferences, attachedImagePaths: attachmentPaths, publicRoot, stage: "ATTACHED_TO_CODEX_INITIAL_PROMPT"})
    : null;
  if (universalPackagingJob) {
    assertUniversalReferenceAttachmentManifest(actualAttachmentManifest, {requireAttached: true});
    if (job.referenceAttachmentManifest.fileCount !== actualAttachmentManifest.fileCount
      || JSON.stringify(job.referenceAttachmentManifest.sourceSha256s) !== JSON.stringify(actualAttachmentManifest.sourceSha256s)) throw new Error("universal-reference-declared-attachment-manifest-mismatch");
  }
  const localReferences = normalizedReferences.map((item) => `${item.semanticRole || item.role}: ${item.sourcePath} (${item.sourceSha256})`);
  const referenceClause = universalPackagingJob && normalizedReferences.length
    ? `\nATTACHED REFERENCE ORDER (authoritative; use the actual attached images, not filenames as prose):\n${normalizedReferences.map((item, index) => `${index + 1}. ${item.semanticRole || item.role}`).join("\n")}`
    : localReferences.length
      ? `\nUse these local reference images according to their declared roles; do not copy embedded text or fabricate source facts:\n${localReferences.join("\n")}`
    : "";
  const universalOutputContract = job.targetKind === "package-layer"
    ? `ATTACHMENT CONTRACT: ${actualAttachmentManifest.manifestSha256}; attach exactly ${actualAttachmentManifest.fileCount} image files from the declared order before generation. Text-only reference declarations do not satisfy this contract. This is post-approval pixel extraction, not Look Master design. Output exactly one ${job.packageLayerKind} layer on the approved master's full canvas. Preserve approved pixels and geometry; do not redesign. ${job.packageLayerKind === "BACKGROUND" ? "Return the approved text-free background pixels at full canvas." : "Return a real RGBA PNG with alpha zero everywhere outside the isolated layer."}`
    : universalPackagingJob
      ? `ATTACHMENT CONTRACT: ${actualAttachmentManifest.manifestSha256}; attach exactly ${actualAttachmentManifest.fileCount} image files from the declared order before generation. Text-only reference declarations do not satisfy this contract. The output must be a complete integrated 16:9 Look Master, never a standalone layer.`
      : "";
  const providerPrompt = universalPackagingJob ? compactUniversalProviderPrompt(job.prompt) : job.prompt;
  const finalPrompt = `Use the GPT image generation tool exactly once. Save the PNG to this exact path: ${stagingPath}\nPROMPT AUTHORITY SHA256: ${job.promptSha256}\n${providerPrompt}${referenceClause}\n${universalOutputContract}\nRespond only with DONE after the file exists.`;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(codexBin, buildCodexArgs(finalPrompt, universalPackagingJob ? attachmentPaths : []), {cwd: root, env: process.env, detached: true, stdio: ["ignore", "pipe", "pipe"]});
      let tail = "";
      const collect = (chunk) => { tail = `${tail}${chunk.toString()}`.slice(-4000); };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      const timeoutMs = Math.max(60_000, Number(process.env.A1_IMAGE_GENERATION_TIMEOUT_MS || 6 * 60 * 1000));
      const timer = setTimeout(() => {
        try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
        reject(new Error(`subscription-image-generation-timeout:${timeoutMs}ms`));
      }, timeoutMs);
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && fs.existsSync(stagingPath)) resolve();
        else reject(new Error(`subscription-image-generation-failed:${code}:${tail}`));
      });
    });
  } catch (error) {
    fs.rmSync(stagingPath, {force: true});
    throw error;
  }
  const foundationAsset = ["background-foundry", "element-atlas", "key-backgrounds"].includes(job.assetStageId);
  if (foundationAsset) {
    const normalizedPath = `${stagingPath}.normalized.png`;
    try {
      await sharp(stagingPath).resize(1920, 1080, {fit: "cover", position: "centre"}).png().toFile(normalizedPath);
      fs.renameSync(normalizedPath, stagingPath);
    } finally {
      fs.rmSync(normalizedPath, {force: true});
    }
  }
  const contentAddressedStorage = commitContentAddressedMedia({stagingPath, outputPath, blobRoot: generatedBlobRoot, publicRoot, extension: ".png"});
  const normalizedBytes = fs.readFileSync(outputPath);
  const dimensions = pngDimensions(normalizedBytes);
  const result = {
    contract: "A1GeneratedEditorialAssetCache/v1",
    assetId: job.assetId,
    targetKind: job.targetKind || "asset",
    briefId: job.briefId || null,
    briefHash: job.briefHash || null,
    treatmentHash: job.treatmentHash || null,
    shotId: job.shotId || null,
    layerId: job.layerId || null,
    provider: "codex-imagegen",
    model: "gpt-image-2",
    prompt: job.prompt,
    promptSha256: job.promptSha256,
    providerPromptSha256: sha256(finalPrompt),
    providerPromptCharacterCount: finalPrompt.length,
    generationInputHash: job.generationInputHash || job.cacheKey || null,
    cacheKey: job.cacheKey,
    sha256: sha256(normalizedBytes),
    publicUrl: `/${job.outputRelativePath}`,
    mimeType: "image/png",
    generationId: `codex-imagegen:${job.cacheKey}`,
    ...dimensions,
    cacheHit: false,
    durationMs: Date.now() - started,
    generatedAt: new Date().toISOString(),
    contentAddressedStorage,
    ...(universalPackagingJob ? {
      productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
      referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
      referenceAttachmentManifestSha256: actualAttachmentManifest.manifestSha256,
      imagegenAttachmentCount: actualAttachmentManifest.fileCount,
      imagegenAttachmentSourceShas: actualAttachmentManifest.sourceSha256s,
      imagegenAttachmentPaths: actualAttachmentManifest.attachments.map((item) => item.attachedPath),
      imagegenAttachmentsAttachedToInitialPrompt: true,
      generationOperation: job.operation || (job.targetKind === "package-look-master" ? "GENERATE_FULL_LOOK_MASTER" : null),
      outputContract: job.outputContract || null,
    } : {}),
  };
  fs.writeFileSync(`${outputPath}.manifest.json`, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

async function perceptualHashForImage(filePath) {
  const {data} = await sharp(filePath).resize(16, 16, {fit: "fill"}).grayscale().raw().toBuffer({resolveWithObject: true});
  const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
  let bits = "";
  for (const value of data) bits += value >= average ? "1" : "0";
  return bits.match(/.{1,4}/gu).map((nibble) => Number.parseInt(nibble.padEnd(4, "0"), 2).toString(16)).join("");
}

async function finalizeGeneratedGlyph(assetId) {
  const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const asset = workspace.library.assets.find((item) => item.id === assetId && item.route === "generated-glyph");
  if (!asset?.typographySpec || asset.assetUri) return;
  const jobs = workspace.production.generation.jobs
    .filter((item) => item.assetId === assetId && item.candidateId)
    .sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId)));
  if (jobs.length < asset.typographySpec.candidateMinimum || jobs.some((item) => item.status !== "complete" || !item.outputRelativePath)) return;
  const candidatePaths = jobs.map((item) => safeOutput(item.outputRelativePath));
  if (candidatePaths.some((item) => !fs.existsSync(item))) return;

  const contactRelativePath = `${path.posix.dirname(jobs[0].outputRelativePath)}/contact-sheet.png`;
  const contactPath = safeOutput(contactRelativePath);
  const tiles = await Promise.all(candidatePaths.map((item) => sharp(item).resize(960, 540, {fit: "cover"}).png().toBuffer()));
  await sharp({create: {width: 1920, height: 1080, channels: 4, background: "#090b0c"}})
    .composite(tiles.map((input, index) => ({input, left: (index % 2) * 960, top: Math.floor(index / 2) * 540})))
    .png()
    .toFile(contactPath);
  const contactBytes = fs.readFileSync(contactPath);
  const contactSha256 = sha256(contactBytes);
  const manifest = {
    contract: "A1GeneratedEditorialAssetContactSheet/v1",
    assetId,
    candidateIds: jobs.map((item) => item.candidateId),
    candidateSha256s: jobs.map((item) => item.output?.sha256),
    sha256: contactSha256,
    width: 1920,
    height: 1080,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(`${contactPath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  await lockedUpdate("generation-glyph-contact-sheet-ready", assetId, (current) => {
    const next = structuredClone(current);
    const target = next.library.assets.find((item) => item.id === assetId && item.route === "generated-glyph");
    if (!target || target.assetUri) return next;
    target.assetUri = `/${contactRelativePath}`;
    target.sha256 = contactSha256;
    target.status = "ready-for-review";
    target.preview = {kind: "source-image", publicUrl: target.assetUri};
    target.provenance = {
      sourceType: "codex-subscription-generated",
      sourceUri: `${contactRelativePath}.manifest.json`,
      license: "project-generated non-evidentiary editorial asset",
      reviewed: false,
    };
    target.review = {
      status: "pending",
      note: "4 个独立方向已完成；系统仍需逐字核验和一次明确采用。",
      reviewedAt: new Date().toISOString(),
      reviewedBy: "system",
      approvedContentSha256: null,
    };
    return next;
  });
}

/**
 * Dispatch the composite review as soon as this generation batch has been
 * persisted. The renderer owns its own lock, so a second generation worker
 * completion must not create another detached process (or leave a needless
 * child behind just to print SKIPPED). This is deliberately a filesystem
 * handoff: the generation worker never mutates review state itself.
 */
function dispatchCompositeReviewWorker(pendingCompositeCount) {
  if (pendingCompositeCount <= 0) return {status: "NOT_NEEDED", pendingCompositeCount: 0, pid: null};
  if (fs.existsSync(compositeWorkerLock)) {
    return {status: "ALREADY_RUNNING", pendingCompositeCount, pid: null};
  }
  const child = spawn(process.execPath, [compositeWorkerScript], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return {status: "DISPATCHED", trigger: "generation-batch-completed", pendingCompositeCount, pid: child.pid || null};
}

async function runOne(job) {
  const targetId = job.assetId || job.briefId || job.id;
  const maturityWaveJob = job.goldenFilmMaturityWave === GOLDEN_FILM_MATURITY_WAVE_CONTRACT;
  const incrementalRepairEventEnabled = !maturityWaveJob && job.targetKind !== "package-layer";
  await persistIncrementalRepairEvent({shotId: job.shotId, event: "STARTED", enabled: incrementalRepairEventEnabled});
  await lockedUpdate("generation-job-started", targetId, (current) => updateGenerationJob(current, job.id, {status: "running", attempts: job.attempts + 1, startedAt: new Date().toISOString(), error: null, telemetry: {...job.telemetry, startedAt: new Date().toISOString()}}));
  try {
    const result = await executeJob(job);
    const visualLayer = job.targetKind === "visual-layer";
    const packageLayer = job.targetKind === "package-layer";
    const packageLookMaster = job.targetKind === "package-look-master";
    const perceptualHash = visualLayer || packageLayer || packageLookMaster ? await perceptualHashForImage(safeOutput(job.outputRelativePath)) : null;
    const glyphCutoutRelativePath = !visualLayer && !packageLayer && !packageLookMaster && job.candidateId
      ? `${job.outputRelativePath.replace(/\.png$/u, "")}.cutout.png`
      : null;
    const glyphCutout = glyphCutoutRelativePath
      ? await createGlyphCutout({inputPath: safeOutput(job.outputRelativePath), outputPath: safeOutput(glyphCutoutRelativePath)})
      : null;
    const fastCandidateDiscovery = packageLookMaster && job.generationMode === "FAST_CANDIDATE_DISCOVERY";
    const semanticPilotDiscovery = packageLookMaster && job.generationMode === "SEMANTIC_PILOT_SINGLE";
    const lightweightDiscovery = fastCandidateDiscovery || semanticPilotDiscovery;
    await lockedUpdate("generation-job-completed", targetId, (current) => {
      const completedAt = new Date().toISOString();
      let next = updateGenerationJob(current, job.id, {status: "complete", completedAt, durationMs: result.durationMs, cacheHit: result.cacheHit, output: result, error: null, telemetry: {...job.telemetry, firstPreviewAt: completedAt, completedAt}});
      if (visualLayer) {
        const duplicate = next.production.visualDirector.generatedCandidates.find((candidate) => candidate.automaticChecks?.duplicate?.perceptualHash === perceptualHash && candidate.raw?.sha256 !== result.sha256);
        return registerGeneratedVisualCandidate(next, job.id, {
          ...result,
          perceptualHash,
          duplicateOfCandidateId: duplicate?.id || null,
          cropSafe: true,
          edgeIntegrity: "pending-composite",
          contrastStatus: "pending-composite",
        }, completedAt);
      }
      if (packageLayer) {
        const plan = next.production.shotIntelligence?.packageAssetKitPlans?.find((item) => item.shotId === job.shotId && item.planSha256 === job.planSha256);
        const layer = plan?.layers?.find((item) => item.layerId === job.layerId && item.kind === job.packageLayerKind);
        if (!plan || !layer || layer.route !== "GENERATE") throw new Error("package-layer-generation-plan-stale");
        const reference = {
          contract: "A1PackageLayerRawReference/v1",
          referenceId: `raw-${job.id}`,
          shotId: job.shotId,
          layerId: job.layerId,
          layerKind: job.packageLayerKind,
          planSha256: job.planSha256,
          styleBriefSha256: job.styleBriefSha256,
          candidateDirectionId: job.candidateDirection?.directionId || null,
          directionFingerprint: job.candidateDirection?.fingerprint || null,
          status: "RAW_REFERENCE",
          artifact: {...result, perceptualHash, workspaceImported: true},
          provenance: {generationJobContract: job.contract, generationJobId: job.id, generationInputHash: job.generationInputHash || job.cacheKey || null, provider: job.provider, model: job.model, cacheKey: job.cacheKey, sourceMasterSha256: job.referenceInputs?.[0]?.artifactSha256 || job.referenceInputs?.[0]?.sha256 || null},
          candidateAdmissionRequired: true,
          note: "原始生成不等于四层候选；需完成单层隔离、alpha/OCR/editable shadow、provenance 和视觉审计。",
          createdAt: completedAt,
        };
        const references = next.production.shotIntelligence.rawLayerReferences || [];
        const existingIndex = references.findIndex((item) => item.referenceId === reference.referenceId || item.artifact?.sha256 === result.sha256);
        if (existingIndex >= 0) references[existingIndex] = reference;
        else references.push(reference);
        next.production.shotIntelligence.rawLayerReferences = references;
        const runtimeHashInput = structuredClone(next.production.shotIntelligence);
        delete runtimeHashInput.sha256;
        next.production.shotIntelligence.sha256 = sha256(JSON.stringify(runtimeHashInput));
        return next;
      }
      if (packageLookMaster) {
        const plan = next.production.shotIntelligence?.packageLookMasterPlans?.find((item) => item.shotId === job.shotId && item.planSha256 === job.lookMasterPlanSha256);
        if (!plan) throw new Error("package-look-master-generation-plan-stale");
        const reference = {
          contract: "A1PackageLookMasterRaw/v1",
          referenceId: `look-master-raw-${job.id}`,
          shotId: job.shotId,
          eventId: job.eventId,
          planSha256: job.lookMasterPlanSha256,
          styleBriefSha256: job.styleBriefSha256,
          candidateDirectionId: job.candidateDirection?.directionId || null,
          directionFingerprint: job.candidateDirection?.fingerprint || null,
          classification: job.productionMethod === UNIVERSAL_REFERENCE_PRODUCTION_METHOD ? "FULL_LOOK_MASTER_REFERENCE_ATTACHED" : "LEGACY_PACKAGE_ONLY",
          status: "LOOK_MASTER_RAW",
          artifact: {...result, perceptualHash, workspaceImported: true},
          productionMethod: job.productionMethod || null,
          referencePackagingContract: job.referencePackagingContract || null,
          referenceAttachmentManifest: job.referenceAttachmentManifest || null,
          imagegenAttachmentManifestSha256: result.referenceAttachmentManifestSha256 || null,
          imagegenAttachmentCount: result.imagegenAttachmentCount || 0,
          fullLookMasterStatus: job.productionMethod === UNIVERSAL_REFERENCE_PRODUCTION_METHOD ? "PENDING_ACTUAL_PIXEL_GATE" : "LEGACY_PACKAGE_ONLY",
          userVisualApproval: "NOT_APPROVED",
          provenance: {generationJobContract: job.contract, generationJobId: job.id, generationInputHash: job.generationInputHash, provider: job.provider, model: job.model, productionMethod: job.productionMethod || null, referenceAttachmentManifestSha256: result.referenceAttachmentManifestSha256 || null, imagegenAttachmentSourceShas: result.imagegenAttachmentSourceShas || [], sourceEvidenceInputs: job.sourceEvidenceInputs || [], researchReferenceUseProof: job.researchReferenceUseProof || null},
          sourceEvidenceInputs: job.sourceEvidenceInputs || [],
          researchReferenceUseProof: job.researchReferenceUseProof || null,
          pixelAudit: null,
          pixelAuditPublicUrl: null,
          serverVisualAssessment: null,
          serverVisualAssessmentPublicUrl: null,
          serverVisualReviewError: null,
          reviewDeferredTo: "director-finalizer",
          candidateAdmissionRequired: !lightweightDiscovery,
          // Decode/dimensions/composite are discovery checks only. Every raw
          // candidate, including FAST discovery output, stays ineligible until
          // the actual-pixel semantic gate records a PASS.
          selectionEligible: false,
          status: semanticPilotDiscovery ? "SEMANTIC_PILOT_CANDIDATE" : fastCandidateDiscovery ? "EXPLORATION_CANDIDATE" : "LOOK_MASTER_RAW",
          fastCandidateDiscovery,
          semanticPilotDiscovery,
          lightChecks: {
            decode: "PASS",
            dimensions: Number.isInteger(result.width) && Number.isInteger(result.height) ? "PASS" : "FAIL",
            baseFrameComposite: "DEFERRED_TO_DIRECTOR_FINALIZER",
            subjectOcclusion: "DEFERRED_TO_DIRECTOR_FINALIZER",
            ocrExact: "UNVERIFIED_LOOK_MASTER_CONCEPT",
            remoteCritic: "DEFERRED_TO_DIRECTOR_FINALIZER",
          },
          note: semanticPilotDiscovery
            ? "单张语义链路试验；仅验证真实输入、实际像素和文章语义，不参与全片推荐，不运行 critic，不触发拆层或动效。"
            : fastCandidateDiscovery
            ? "四方向 Look Master 探索候选；仅完成解码、尺寸、SHA、正片 hold-frame composite 和轻量遮挡检查，未运行远程 critic，等待整组排序和用户审阅。它不是四层资产。"
            : "完整正片视觉包装母版原图；必须经过实际像素、语义、正片构图/色彩/节奏兼容性与风格审查后，才可成为推荐候选。它不是四层资产。",
          createdAt: completedAt,
        };
        const references = next.production.shotIntelligence.lookMasterRawReferences || [];
        const existingIndex = references.findIndex((item) => item.referenceId === reference.referenceId || item.artifact?.sha256 === result.sha256);
        if (existingIndex >= 0) references[existingIndex] = reference;
        else references.push(reference);
        next.production.shotIntelligence.lookMasterRawReferences = references;
        const runtimeHashInput = structuredClone(next.production.shotIntelligence);
        delete runtimeHashInput.sha256;
        next.production.shotIntelligence.sha256 = sha256(JSON.stringify(runtimeHashInput));
        return next;
      }
      const asset = next.library.assets.find((item) => item.id === job.assetId);
      if (!asset) throw new Error("generation-target-asset-missing");
      if (asset.route === "generated-glyph") {
        const candidates = asset.typographySpec?.generatedCandidates || [];
        const candidate = {
          id: job.candidateId,
          direction: job.direction,
          publicUrl: `/${job.outputRelativePath}`,
          sha256: result.sha256,
          width: result.width,
          height: result.height,
          promptSha256: result.promptSha256,
          ...(glyphCutout ? {
            cutoutContract: glyphCutout.contract,
            cutoutPublicUrl: `/${glyphCutoutRelativePath}`,
            cutoutSha256: glyphCutout.sha256,
            cutoutSourceSha256: glyphCutout.sourceSha256,
            cutoutWidth: glyphCutout.width,
            cutoutHeight: glyphCutout.height,
          } : {}),
          textVerification: {
            status: "pending",
            expectedText: job.expectedText,
            observedText: null,
            reviewedBy: null,
          },
        };
        const existingIndex = candidates.findIndex((item) => item.id === job.candidateId);
        if (existingIndex >= 0) candidates[existingIndex] = candidate;
        else candidates.push(candidate);
        asset.typographySpec.generatedCandidates = candidates.sort((left, right) => left.id.localeCompare(right.id));
        asset.status = "generation-ready";
        asset.review = {status: "pending", note: `${candidates.length}/${asset.typographySpec.candidateMinimum} 个独立方向已生成；等待整组完成。`, reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
        return next;
      }
      asset.assetUri = `/${job.outputRelativePath}`;
      asset.sha256 = result.sha256;
      asset.status = "ready-for-review";
      asset.preview = {kind: "source-image", publicUrl: asset.assetUri};
      asset.provenance = {sourceType: "codex-subscription-generated", sourceUri: `${job.outputRelativePath}.manifest.json`, license: "project-generated non-evidentiary editorial asset", reviewed: false};
      asset.review = {status: "pending", note: asset.route === "generated-glyph" ? "生成完成；必须逐字核对后才能批准。" : "生成完成；等待视觉审核与可裁切性检查。", reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
      return next;
    }, {});
    await persistIncrementalRepairEvent({shotId: job.shotId, event: "COMPLETED", candidateSha: result.sha256, enabled: incrementalRepairEventEnabled});
    if (!visualLayer && !packageLayer && job.candidateId) await finalizeGeneratedGlyph(job.assetId);
  } catch (error) {
    await persistIncrementalRepairEvent({shotId: job.shotId, event: "FAILED", enabled: incrementalRepairEventEnabled});
    await lockedUpdate("generation-job-failed", targetId, (current) => updateGenerationJob(current, job.id, {status: "failed", completedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error), telemetry: {...job.telemetry, completedAt: new Date().toISOString(), retryCount: Number(job.telemetry?.retryCount || 0) + 1}}));
  }
}

/**
 * Reconcile the persisted queue before selecting work.  Briefs are mutable
 * contracts: a reference/grammar/composition migration changes their hash.
 * A completed image from an older hash is still useful history, but it is
 * not a candidate for the current director.  Previously those jobs stayed
 * "complete" forever while the director had zero candidates, so the UI kept
 * asking for the same treatment anchors and the worker had no truthful state
 * to advance from.  Current-hash completed jobs are recovered into the
 * director when a worker had crashed between writing the output and the
 * candidate registration.
 */
function reconcilePersistedVisualJobs(workspace) {
  let next = workspace;
  const director = next.production.visualDirector;
  const briefs = new Map([
    ...(director.shotBriefs || []),
    ...(director.treatmentDirections || []).flatMap((direction) => direction.anchorBriefs || []),
  ].map((brief) => [brief.id, brief]));
  const candidateJobIds = new Set((director.generatedCandidates || []).map((candidate) => candidate.jobId).filter(Boolean));
  let recovered = 0;
  let stale = 0;
  let recoverySkipped = 0;
  for (const job of [...(next.production.generation.jobs || [])]) {
    if (job.targetKind !== "visual-layer" || !["queued", "running", "complete"].includes(job.status)) continue;
    const brief = briefs.get(job.briefId);
    const currentHash = Boolean(brief && brief.briefHash === job.briefHash && brief.treatmentHash === job.treatmentHash);
    if (!currentHash) {
      next = updateGenerationJob(next, job.id, {
        status: "stale",
        error: "stale-visual-generation-brief",
        staleAt: new Date().toISOString(),
        staleReason: brief ? "brief-or-treatment-hash-changed" : "brief-removed-from-current-director",
        telemetry: {...(job.telemetry || {}), staleAt: new Date().toISOString(), staleReason: brief ? "brief-or-treatment-hash-changed" : "brief-removed-from-current-director"},
      });
      stale += 1;
      continue;
    }
    if (job.status !== "complete" || candidateJobIds.has(job.id)) continue;
    const output = job.output;
    if (!output?.publicUrl || !output.sha256 || !Number(output.width) || !Number(output.height)) {
      recoverySkipped += 1;
      continue;
    }
    try {
      const outputPath = safeOutput(String(output.publicUrl).replace(/^\//u, ""));
      if (!fs.existsSync(outputPath)) {
        recoverySkipped += 1;
        continue;
      }
      next = registerGeneratedVisualCandidate(next, job.id, {
        ...output,
        cacheHit: job.cacheHit === true,
        cropSafe: true,
        edgeIntegrity: output.edgeIntegrity || "pending-composite",
        contrastStatus: output.contrastStatus || "pending-composite",
      }, new Date().toISOString());
      candidateJobIds.add(job.id);
      recovered += 1;
    } catch {
      recoverySkipped += 1;
    }
  }
  next.production.generation.reconciliation = {
    contract: "A1GenerationQueueReconciliation/v1",
    recoveredCandidateCount: recovered,
    recoveredCandidateTotal: next.production.visualDirector.generatedCandidates.filter((candidate) => candidate.jobId).length,
    staleVisualJobCount: stale,
    staleVisualJobTotal: next.production.generation.jobs.filter((job) => job.targetKind === "visual-layer" && job.status === "stale").length,
    recoverySkippedCount: recoverySkipped,
    lastRunAt: new Date().toISOString(),
    policy: "current-brief-and-treatment-hash-required",
  };
  return {workspace: next, recovered, stale, recoverySkipped};
}

try {
  generationRun: {
  const workerStartedAt = Date.now();
  writeGenerationRuntimeSidecar(artifactDir, {phase: "batch-start", status: "running", batchId: `generation-${workerStartedAt}`, startedAt: new Date(workerStartedAt).toISOString(), source: "editorial-asset-generation-worker"});
  let workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (canonicalWebPrimaryActive(workspace)) {
    writeGenerationRuntimeSidecar(artifactDir, {
      phase: "canonical-web-primary-waiting",
      status: "blocked-for-web-provider",
      batchId: `generation-${workerStartedAt}`,
      targetShotIds: workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest.generationEligibleShotIds,
      provider: "chatgpt-web-conversation",
      localFallback: "disabled-unless-A1_ALLOW_LOCAL_GENERATION_FALLBACK=1",
      nextAction: "prepare-canonical-web-generation-v1-and-send-isolated-shot-messages-serially-through-fixed-conversation",
      startedAt: new Date(workerStartedAt).toISOString(),
      completedAt: new Date().toISOString(),
      wallClockMs: Date.now() - workerStartedAt,
      source: "canonical-web-primary-provider-policy",
    });
    console.log(JSON.stringify({status: "CANONICAL_WEB_PRIMARY_WAITING", provider: "chatgpt-web-conversation", localGenerationStarted: false, targetShotIds: workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest.generationEligibleShotIds, nextAction: "prepare-canonical-web-generation-v1 --shotIds=ED-07,ED-08,ED-13,ED-19 --write-queue; dispatch queue.messages[] one at a time", explicitLocalFallback: "A1_ALLOW_LOCAL_GENERATION_FALLBACK=1"}, null, 2));
    break generationRun;
  }
  const maturityWaveActive = goldenFilmMaturityWaveActive(workspace);
  const approvedLayerPilotActive = approvedMasterLayerPilotActive(workspace);
  const isolatedGenerationWaveActive = maturityWaveActive || approvedLayerPilotActive;
  let incrementalRepair = canonicalTitleRepairCanaryActive(workspace)
    ? canaryRepairControllerState()
    : buildIncrementalRepairControllerState(workspace, {persistSidecar: !isolatedGenerationWaveActive});
  const generationFreeze = buildVisualGenerationFreeze(workspace.production.visualDirector);
  if (generationFreeze.frozen && !canonicalTitleRepairActive(workspace) && !goldenFilmMaturityWaveActive(workspace) && !approvedMasterLayerPilotActive(workspace)) {
    const packageLaneQueued = workspace.production.generation.jobs.some((job) => ["package-layer", "package-look-master"].includes(job.targetKind) && job.status === "queued");
    const frozen = await lockedUpdate("generation-dispatch-frozen-by-visual-treatment", generationFreeze.reason, (current) => {
      let next = structuredClone(current);
      for (const job of next.production.generation.jobs) {
        if (job.targetKind !== "visual-layer" || job.status !== "queued") continue;
        next = updateGenerationJob(next, job.id, {
          status: "stale",
          error: "visual-generation-frozen-compositor-rewrite-required",
          staleAt: new Date().toISOString(),
          staleReason: generationFreeze.reason,
        });
      }
      next.production.generation.automaticDispatchAllowed = canonicalTitleRepairActive(next);
      next.production.generation.workerStatus = packageLaneQueued ? "starting" : "frozen";
      next.production.visualDirector.generationFreeze = generationFreeze;
      return next;
    });
    if (!packageLaneQueued) {
      console.log(JSON.stringify({status: "GENERATION_FROZEN", generationFreeze, summary: frozen.production.generation.summary}, null, 2));
      process.exitCode = 0;
      break generationRun;
    }
    workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  }
  if (workspace.production.generation.jobs.some((job) => job.status === "running")) {
    await lockedUpdate("generation-worker-recovered-stale-jobs", null, (current) => recoverStaleGenerationJobs(current).workspace);
    workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  }
  await lockedUpdate("generation-worker-deduped-job-ids", null, (current) => dedupeGenerationJobsById(current));
  workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const reconciliation = await lockedUpdate("generation-worker-reconciled-visual-jobs", null, (current) => reconcilePersistedVisualJobs(current).workspace);
  writeGenerationRuntimeSidecar(artifactDir, {phase: "reconciled", status: "running", batchId: `generation-${workerStartedAt}`, startedAt: new Date(workerStartedAt).toISOString(), wallClockMs: Date.now() - workerStartedAt, source: "editorial-asset-generation-worker"});
  workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (!isolatedGenerationWaveActive && !canonicalTitleRepairCanaryActive(workspace)) {
    const repairQueueState = compileMissingIncrementalGenerationJobs(workspace);
    if (repairQueueState.createdJobs.length) {
      workspace = await lockedUpdate("incremental-repair-generation-jobs-compiled", repairQueueState.createdJobs.map((job) => job.id).join(","), (current) => {
        const compiled = compileMissingIncrementalGenerationJobs(current);
        if (!compiled.createdJobs.length) return current;
        return compiled.workspace;
      });
      workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    }
  }
  incrementalRepair = canonicalTitleRepairCanaryActive(workspace)
    ? canaryRepairControllerState()
    : buildIncrementalRepairControllerState(workspace, {persistSidecar: !isolatedGenerationWaveActive});
  const canonicalRepairAuthoritySha256 = workspace.production.shotIntelligence?.canonicalDirectorAuthority?.authoritySha256 || null;
  const canonicalRepairTargetIds = new Set(workspace.production.shotIntelligence?.canonicalDirectorTargetRepairManifest?.generationEligibleShotIds || []);
  const maturityWaveSha256 = workspace.production.goldenFilmVisualSystemMaturity?.current === true
    ? workspace.production.goldenFilmVisualSystemMaturity.maturityRunSha256
    : null;
  const incrementalQueuedJobIds = new Set([
    ...incrementalRepair.dispatch.jobs.map((job) => job.existingJobId).filter(Boolean),
    ...workspace.production.generation.jobs
      .filter((job) => job.status === "queued"
        && job.targetKind === "package-look-master"
        && canonicalRepairTargetIds.has(job.shotId)
        && job.canonicalRepairBinding?.authoritySha256 === canonicalRepairAuthoritySha256)
      .map((job) => job.id),
    ...workspace.production.generation.jobs
      .filter((job) => job.status === "queued"
        && job.targetKind === "package-look-master"
        && job.goldenFilmMaturityRunSha256 === maturityWaveSha256
        && goldenFilmMaturityWaveActive(workspace))
      .map((job) => job.id),
    ...workspace.production.generation.jobs
      .filter((job) => job.status === "queued"
        && job.targetKind === "package-look-master"
        && job.referencePackagingContract === A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT
        && job.productionMethod === UNIVERSAL_REFERENCE_PRODUCTION_METHOD
        && job.referenceAttachmentManifest?.requireAttached === true
        && (workspace.production.goldenFilmVisualSystemMaturity?.targetShotIds || []).includes(job.shotId)
        && goldenFilmMaturityWaveActive(workspace))
      .map((job) => job.id),
  ]);
  const approvedMasterLayerPilot = workspace.production.shotIntelligence?.approvedMasterLayerPilot || null;
  const approvedMasterImagegenExtractionRetired = workspace.production.shotIntelligence?.approvedMasterLayerCanaryAudit?.status === "FAIL_METHOD_INVALID";
  const approvedMasterLayerPilotJobIds = new Set(approvedMasterLayerPilot?.dispatchJobIds || approvedMasterLayerPilot?.allowedJobIds || []);
  const queued = workspace.production.generation.jobs.filter((job) => {
    if (job.status !== "queued") return false;
    if (job.targetKind === "package-look-master") return incrementalQueuedJobIds.has(job.id);
    if (job.targetKind === "package-layer") return !approvedMasterImagegenExtractionRetired
      && !generationFreeze.frozen
      && workspace.production.generation.automaticDispatchAllowed === true
      && approvedMasterLayerPilot?.status === "DISPATCH_ALLOWED"
      && approvedMasterLayerPilotJobIds.has(job.id);
    return !generationFreeze.frozen;
  });
  const dirtySetSnapshot = writeGenerationDirtySet(workspace, queued);
  writeGenerationRuntimeSidecar(artifactDir, {
    phase: "dirty-set-compiled",
    status: "running",
    batchId: `generation-${workerStartedAt}`,
    dirtySetContract: dirtySetSnapshot.contract,
    dirtyCount: dirtySetSnapshot.summary.dirty,
    cacheEligibleCount: dirtySetSnapshot.summary.cacheEligible,
    queuedCount: queued.length,
    startedAt: new Date(workerStartedAt).toISOString(),
    wallClockMs: Date.now() - workerStartedAt,
    source: "editorial-asset-generation-worker",
  });
  let cursor = 0;
  const worker = async () => {
    while (cursor < queued.length) {
      const job = queued[cursor++];
      await runOne(job);
    }
  };
  const queuePolicy = workspace.production.visualDirector?.queuePolicy || {};
  const benchmarkSamples = Array.isArray(queuePolicy.benchmark?.samples) ? queuePolicy.benchmark.samples : [];
  const providerBackoff = benchmarkSamples.some((sample) => Number(sample.concurrency) >= 2
    && Number(sample.completedCount || 0) === 0
    && Number(sample.failedCount || 0) > 0);
  const activeConcurrency = providerBackoff
    ? 1
    : Math.max(1, Math.min(2, Number(queuePolicy.activeConcurrency || workspace.production.generation.concurrency || 2)));
  await Promise.all(Array.from({length: Math.min(activeConcurrency, queued.length)}, () => worker()));
  if (queued.length) {
    await lockedUpdate("generation-worker-finished", null, (current) => {
      const queuedIds = new Set(queued.map((job) => job.id));
      const completedBatchJobs = current.production.generation.jobs.filter((job) => queuedIds.has(job.id) && job.status === "complete");
      const failedBatchJobs = current.production.generation.jobs.filter((job) => queuedIds.has(job.id) && job.status === "failed");
      const durations = completedBatchJobs.map((job) => Number(job.durationMs || 0)).filter((duration) => duration > 0).sort((left, right) => left - right);
      const p90DurationMs = durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * .9) - 1)] : 0;
      let next = recordGenerationConcurrencyBenchmark(current, {
        concurrency: activeConcurrency,
        jobCount: queued.length,
        completedCount: completedBatchJobs.length,
        failedCount: failedBatchJobs.length,
        p90DurationMs,
        wallTimeMs: Date.now() - workerStartedAt,
      });
      const approvedLayerPilotBatch = queued.every((job) => job.targetKind === "package-layer")
        && queued.every((job) => next.production.shotIntelligence?.approvedMasterLayerPilot?.allowedJobIds?.includes(job.id));
      next.production.generation.automaticDispatchAllowed = approvedLayerPilotBatch
        ? false
        : (failedBatchJobs.length > 0 && completedBatchJobs.length === 0
          ? false
          : canonicalTitleRepairActive(next));
      if (approvedLayerPilotBatch) {
        const completedJobIds = queued.filter((job) => next.production.generation.jobs.find((item) => item.id === job.id)?.status === "complete").map((job) => job.id);
        const failedJobIds = queued.filter((job) => next.production.generation.jobs.find((item) => item.id === job.id)?.status === "failed").map((job) => job.id);
        next.production.generation.workerStatus = "frozen";
        next.production.shotIntelligence.approvedMasterLayerPilot = {
          ...next.production.shotIntelligence.approvedMasterLayerPilot,
          status: failedJobIds.length ? "COMPLETE_WITH_FAILURES_PENDING_AUDIT" : "COMPLETE_PENDING_ACTUAL_PIXEL_AUDIT",
          completedJobIds,
          failedJobIds,
          completedAt: new Date().toISOString(),
        };
      }
      if (next.production.autopilot?.status === "generating-next-anchors") {
        const planned = next.production.autopilot.generationPlan.nextAnchorAssetIds;
        const completed = planned.every((assetId) => next.library.assets.some((asset) => asset.id === assetId && Boolean(asset.assetUri)));
        next.production.autopilot.status = completed ? "anchor-review-required" : "generation-attention-required";
        next.production.autopilot.gates.generationDispatchAllowed = false;
        next.production.autopilot.updatedAt = new Date().toISOString();
      }
      // Generation completion only records the immutable job result. The
      // director/finalizer later consumes this result and is the only role
      // allowed to run actual-pixel gates or unlock any downstream stage.
      const canonicalManifest = next.production.shotIntelligence?.canonicalDirectorTargetRepairManifest;
      const canonicalRepairJobs = queued.filter((job) => job.canonicalRepairBinding?.authoritySha256 === canonicalManifest?.authoritySha256);
      if (canonicalManifest && canonicalRepairJobs.length) {
        const failedShotIds = [...new Set(canonicalRepairJobs
          .filter((job) => next.production.generation.jobs.find((item) => item.id === job.id)?.status === "failed")
          .map((job) => job.shotId)
          .filter(Boolean))];
        canonicalManifest.retryRequiredShotIds = failedShotIds;
        canonicalManifest.generationDispatched = failedShotIds.length === 0;
        canonicalManifest.checkpoint = failedShotIds.length ? "CANONICAL_TITLE_REPAIR_PENDING" : "CANONICAL_TITLE_REPAIR_GENERATING";
        canonicalManifest.updatedAt = new Date().toISOString();
        const manifestHashInput = structuredClone(canonicalManifest);
        delete manifestHashInput.manifestSha256;
        canonicalManifest.manifestSha256 = sha256(JSON.stringify(manifestHashInput));
      }
      return next;
    });
    const continuationWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const continuation = canonicalTitleRepairCanaryActive(continuationWorkspace)
      ? {dispatch: {pendingCount: 0, dispatchBlocked: true, continuation: false}}
      : buildIncrementalRepairControllerState(continuationWorkspace, {persistSidecar: !isolatedGenerationWaveActive});
    writeGenerationRuntimeSidecar(artifactDir, {
      phase: "incremental-repair-batch-complete",
      status: "complete",
      batchId: `generation-${workerStartedAt}`,
      completedJobIds: queued.map((job) => job.id),
      nextBatchPendingCount: continuation.dispatch.pendingCount,
      nextBatchDispatchBlocked: continuation.dispatch.dispatchBlocked,
      continuation: continuation.dispatch.continuation,
      startedAt: new Date(workerStartedAt).toISOString(),
      completedAt: new Date().toISOString(),
      wallClockMs: Date.now() - workerStartedAt,
      source: "incremental-repair-executor",
    });
  }
  workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentVisualBriefs = [
    ...(workspace.production.visualDirector.shotBriefs || []),
    ...(workspace.production.visualDirector.treatmentDirections || []).flatMap((direction) => direction.anchorBriefs || []),
  ];
  const pendingCompositeCount = workspace.production.visualDirector.generatedCandidates.filter((candidate) => {
    const brief = currentVisualBriefs.find((item) => item.id === candidate.briefId);
    // Treatment anchors are intentionally not production-bindable yet. They
    // still need the real Remotion composite so the treatment gate can judge
    // the generated layer in context before any material is adopted.
    return brief && (brief.productionBindingAllowed || brief.generationRole === "treatment-anchor") && candidate.status === "raw-ready-composite-pending";
  }).length;
  const compositeDispatch = dispatchCompositeReviewWorker(pendingCompositeCount);
  const batchFailed = queued.some((job) => workspace.production.generation.jobs.find((item) => item.id === job.id)?.status === "failed");
  const historicalFailureCount = workspace.production.generation.jobs.filter((job) => job.status === "failed" && !queued.some((queuedJob) => queuedJob.id === job.id)).length;
  console.log(JSON.stringify({status: batchFailed ? "COMPLETE_WITH_FAILURES" : "PASS", summary: workspace.production.generation.summary, reconciliation: workspace.production.generation.reconciliation || reconciliation, historicalFailureCount, pendingCompositeCount, compositeDispatch}, null, 2));
  writeGenerationRuntimeSidecar(artifactDir, {phase: "batch-complete", status: batchFailed ? "failed" : "complete", batchId: `generation-${workerStartedAt}`, queued: workspace.production.generation.summary.queued, running: workspace.production.generation.summary.running, completed: workspace.production.generation.summary.complete, failed: workspace.production.generation.summary.failed, cacheHits: workspace.production.generation.jobs.filter((job) => job.cacheHit === true).length, startedAt: new Date(workerStartedAt).toISOString(), completedAt: new Date().toISOString(), wallClockMs: Date.now() - workerStartedAt, durationMs: Date.now() - workerStartedAt, source: "editorial-asset-generation-worker"});
  }
} finally {
  if (workerHandle != null) fs.closeSync(workerHandle);
  fs.rmSync(workerLock, {force: true});
}
