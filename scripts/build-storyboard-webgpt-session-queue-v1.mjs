#!/usr/bin/env node
/**
 * Build the resumable queue consumed by the Codex Chrome browser operator.
 *
 * This is intentionally a queue contract, not a standalone browser driver.
 * The supported browser automation surface is Codex's Chrome extension;
 * AppleScript and private ChatGPT endpoints are not part of this workflow.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const bridgePhaseId = "storyboard-webgpt-artwork-bridge-v1";
const queuePhaseId = "storyboard-webgpt-session-queue-v1";
const bridgeManifestPath = path.join(root, `apps/studio-next/public/generated/system-line/${bridgePhaseId}/manifest.json`);
const privateRoot = path.join(root, `.codex-artifacts/system-progress-system-line/${queuePhaseId}`);
const publicRoot = path.join(root, `apps/studio-next/public/generated/system-line/${queuePhaseId}`);

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

if (!fs.existsSync(bridgeManifestPath)) throw new Error(`bridge manifest not found: ${rel(bridgeManifestPath)}`);
const bridge = JSON.parse(fs.readFileSync(bridgeManifestPath, "utf8"));
if (!bridge.browserAutomationRequired || !bridge.browserAutomation?.conversationId) {
  throw new Error("bridge manifest is missing persistent browser conversation configuration");
}

const jobs = (bridge.jobs || []).map((job, index) => ({
  index: index + 1,
  beatId: job.beatId,
  expectedFileName: job.expectedFileName,
  promptPath: job.promptPublicPath || `apps/studio-next/public/generated/system-line/${bridgePhaseId}/prompts/${job.index}-${job.beatId}.txt`,
  promptSha256: job.promptSha256,
  status: "pending",
  attempts: 0,
  completion: {
    messageSubmitted: false,
    newImageAssetObserved: false,
    sendButtonRestored: false,
    downloaded: false,
  },
}));

const queue = {
  contract: "A1StoryboardWebGPTSessionQueue/v1",
  generatedAt: new Date().toISOString(),
  provider: bridge.provider,
  providerMode: bridge.providerMode,
  conversation: {
    id: bridge.browserAutomation.conversationId,
    url: `https://chatgpt.com/c/${bridge.browserAutomation.conversationId}`,
    browser: bridge.browserAutomation.browser,
  },
  policy: {
    messageMode: "one-job-per-message",
    batchKeywordMode: "disabled-independent-output-not-guaranteed",
    maxConcurrentJobs: 1,
    sendNextOnlyAfter: ["new-image-asset-observed", "send-button-restored"],
    retryOnlyWhen: "message-not-present-in-conversation",
    duplicateSendGuard: "verify-message-submitted-before-retry",
    assetCollection: "page-assets-backend-image-delta",
    noAppleScriptBrowserControl: true,
    noPrivateChatGptEndpoint: true,
  },
  source: {
    bridgeManifestPath: rel(bridgeManifestPath),
    bridgeManifestSha256: sha256File(bridgeManifestPath),
  },
  summary: {
    jobCount: jobs.length,
    pendingCount: jobs.length,
    independentImagesExpected: jobs.length,
  },
  jobs,
  nextAction: "run-through-codex-chrome-session-and-resume-from-first-pending-job",
};

fs.mkdirSync(privateRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
fs.writeFileSync(path.join(privateRoot, "queue.json"), stableJson(queue));
fs.writeFileSync(path.join(publicRoot, "queue.json"), stableJson(queue));
console.log(JSON.stringify({
  status: "READY_FOR_CODEX_CHROME_SESSION",
  contract: queue.contract,
  conversation: queue.conversation,
  policy: queue.policy,
  summary: queue.summary,
  privateQueuePath: rel(path.join(privateRoot, "queue.json")),
  publicQueuePath: rel(path.join(publicRoot, "queue.json")),
}, null, 2));
