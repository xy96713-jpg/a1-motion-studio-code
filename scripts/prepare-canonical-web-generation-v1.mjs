#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertCanonicalWebQueueDispatchable, buildCanonicalWebQueue, CANONICAL_WEB_FORBIDDEN_PROMPT_TOKENS, CANONICAL_WEB_LEGACY_STYLE_SHA_PREFIXES} from "../apps/studio-next/src/lib/a1-canonical-web-generation-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const defaultConversationPath = path.join(artifactDir, "canonical-web-generation-v1", "conversation.json");
const defaultManifestPath = path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json");
const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const inline = args.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function retireLegacyQueues(currentQueue) {
  const dirs = [path.join(artifactDir, "canonical-web-generation-v1"), path.join(publicDir, "canonical-web-generation-v1")];
  const queues = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((item) => /^queue-.*\.json$/u.test(item))) {
      const filePath = path.join(dir, name);
      let queue = null;
      try { queue = readJson(filePath); } catch { continue; }
      const promptText = [queue.batchPrompt, ...(queue.jobs || []).map((job) => job.prompt), ...(queue.messages || []).map((message) => message.prompt)].join("\n");
      const forbiddenTokens = CANONICAL_WEB_FORBIDDEN_PROMPT_TOKENS.filter((token) => promptText.includes(token));
      const legacyStyle = CANONICAL_WEB_LEGACY_STYLE_SHA_PREFIXES.has(String(queue.styleSha256 || "").slice(0, 12));
      const legacyReferences = (queue.jobs || []).flatMap((job) => job.referenceInputs || []).filter((item) => /cobalt|legacy/iu.test(String(item.id || "")));
      const sameCurrentBinding = queue.styleSha256 === currentQueue.styleSha256
        && queue.conversation?.id === currentQueue.conversation?.id
        && queue.authoritySha256 === currentQueue.authoritySha256
        && queue.manifestSha256 === currentQueue.manifestSha256;
      const supersededCurrent = sameCurrentBinding && queue.queueSha256 !== currentQueue.queueSha256;
      const supersededCanonicalQueue = queue.contract === "A1CanonicalWebGenerationQueue/v1"
        && queue.queueSha256 !== currentQueue.queueSha256;
      if (legacyStyle || forbiddenTokens.length || legacyReferences.length || supersededCurrent || supersededCanonicalQueue) {
        const reasonCodes = [
          ...(legacyStyle ? ["LEGACY_STYLE_SHA"] : []),
          ...(forbiddenTokens.length ? ["FORBIDDEN_LEGACY_PROMPT"] : []),
          ...(legacyReferences.length ? ["LEGACY_REFERENCE_INPUT"] : []),
          ...(supersededCurrent ? ["SUPERSEDED_BY_NEW_CURRENT_BINDING_QUEUE"] : []),
          ...(supersededCanonicalQueue && !supersededCurrent ? ["SUPERSEDED_BY_NEW_CANONICAL_QUEUE"] : []),
        ];
        const retired = {...queue, status: "SUPERSEDED_DO_NOT_DISPATCH", supersededByQueueSha256: currentQueue.queueSha256, supersessionReasonCodes: reasonCodes};
        fs.writeFileSync(filePath, `${JSON.stringify(retired, null, 2)}\n`, "utf8");
        queues.push({path: filePath, queueSha256: queue.queueSha256 || null, styleSha256: queue.styleSha256 || null, status: "SUPERSEDED_DO_NOT_DISPATCH", reasonCodes, forbiddenTokens, legacyReferenceIds: [...new Set(legacyReferences.map((item) => item.id))]});
      }
    }
  }
  return {contract: "A1CanonicalWebQueueRetirementReport/v1", status: "PASS", retiredQueueCount: queues.length, queues, rule: "only the newly compiled queue passes assertCanonicalWebQueueDispatchable; all superseded queues are history read-only and must never be sent"};
}

function parseShotIds() {
  const raw = argValue("--shotIds", "");
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

const conversationPath = path.resolve(root, argValue("--conversation", defaultConversationPath));
const manifestPath = path.resolve(root, argValue("--manifest", defaultManifestPath));
const targetShotIds = parseShotIds();
const mode = hasFlag("--dry-run") || !hasFlag("--write-queue") ? "DRY_RUN" : "LIVE";

function blocked(reason, details = {}) {
  const report = {
    contract: "A1CanonicalWebGenerationPrepareReport/v1",
    status: "BLOCKED",
    mode,
    reason,
    conversationPath,
    manifestPath,
    targetShotIds,
    imageGenCalled: false,
    boardRebuilt: false,
    assemblyStarted: false,
    ...details,
  };
  console.log(JSON.stringify(report, null, 2));
  if (mode === "LIVE") process.exitCode = 2;
  return report;
}

if (!fs.existsSync(conversationPath)) blocked("fixed-conversation-config-missing", {nextAction: "register-canonical-web-conversation-v1"});
else if (!fs.existsSync(manifestPath)) blocked("repair-manifest-missing", {nextAction: "run-incremental-repair-dry-run-v1-or-production-dispatch"});
else {
  try {
    const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (workspace.production.generation.providerRouting?.webConversation?.dispatchAllowed === false) {
      throw new Error("canonical-web-generation-retired-history-only");
    }
    const sidecar = readJson(manifestPath);
    const conversation = readJson(conversationPath);
    const queue = buildCanonicalWebQueue({workspace, sidecar, targetShotIds, conversation, mode});
    const report = {
      contract: "A1CanonicalWebGenerationPrepareReport/v1",
      status: "PASS",
      mode,
      queueSha256: queue.queueSha256,
      queuePath: null,
      conversation: queue.conversation,
      bindings: {authoritySha256: queue.authoritySha256, manifestSha256: queue.manifestSha256, sourceRevisionHash: queue.sourceRevisionHash, styleSha256: queue.styleBundle.sha256, batchPromptSha256: queue.batchPromptSha256},
      batch: {contract: queue.batch.contract, batchId: queue.batch.batchId, shotIds: queue.batch.shotIds, messageCount: queue.batch.messageCount, imagesPerMessage: queue.batch.imagesPerMessage, responseOrder: queue.batch.responseOrder, separateImagesRequired: queue.batch.separateImagesRequired, collageForbidden: queue.batch.collageForbidden},
      dispatchPlan: queue.dispatchPlan,
      messages: queue.messages.map((message) => ({shotId: message.shotId, promptSha256: message.promptSha256, attachmentManifestSha256: message.attachmentManifest.manifestSha256, fileCount: message.attachmentManifest.fileCount})),
      jobs: queue.jobs.map((job) => ({jobId: job.jobId, shotId: job.shotId, primitiveId: job.primitiveId, attempt: job.attempt, planSha256: job.planSha256, promptSha256: job.promptSha256, expectedFileName: job.expectedFileName})),
      policy: queue.policy,
      imageGenCalled: false,
      boardRebuilt: false,
      assemblyStarted: false,
      nextAction: mode === "DRY_RUN" ? "inspect-isolated-shot-messages; no-imagegen" : "operator-runs-isolated-shot-messages-serially-through-fixed-conversation",
    };
    if (mode === "LIVE") {
      const artifactQueueDir = path.join(artifactDir, "canonical-web-generation-v1");
      const publicQueueDir = path.join(publicDir, "canonical-web-generation-v1");
      fs.mkdirSync(artifactQueueDir, {recursive: true});
      fs.mkdirSync(publicQueueDir, {recursive: true});
      const queueFileName = `queue-${queue.queueSha256.slice(0, 16)}.json`;
      fs.writeFileSync(path.join(artifactQueueDir, queueFileName), `${JSON.stringify(queue, null, 2)}\n`, "utf8");
      fs.writeFileSync(path.join(publicQueueDir, queueFileName), `${JSON.stringify(queue, null, 2)}\n`, "utf8");
      report.queuePath = path.join(artifactQueueDir, queueFileName);
      report.queueRetirement = retireLegacyQueues(queue);
      fs.writeFileSync(path.join(artifactQueueDir, "queue-retirement-report.json"), `${JSON.stringify(report.queueRetirement, null, 2)}\n`, "utf8");
      fs.writeFileSync(path.join(publicQueueDir, "queue-retirement-report.json"), `${JSON.stringify(report.queueRetirement, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    blocked(error.message, {errorName: error.name, nextAction: "resolve-canonical-web-binding-before-dispatch"});
  }
}
