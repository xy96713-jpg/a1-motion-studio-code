#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertCanonicalWebQueueDispatchable, buildCanonicalWebImportRecord, buildCanonicalWebQueue, buildCanonicalWebStyleBundle, CANONICAL_GENERATION_PROVIDERS, styleCharterText, validateCanonicalWebBatchReturn, validateCanonicalWebCurrentBinding, validateCanonicalWebReturn, visibleCopyForShot} from "../apps/studio-next/src/lib/a1-canonical-web-generation-v1.mjs";

const shotIds = ["ED-07", "ED-08", "ED-13", "ED-19"];
const phraseByShot = {
  "ED-07": ["为什么不让它直接写完全文"],
  "ED-08": ["AI 常常不说人话"],
  "ED-13": ["国产模型写中文确实会顺一些", "问题也并没有彻底解决"],
  "ED-19": ["整理", "编排", "读取", "检查"],
};
const roleByShot = {"ED-07": "PRESENTER_HEADLINE", "ED-08": "PRESENTER_HEADLINE", "ED-13": "PRESENTER_HEADLINE", "ED-19": "HERO_TAKEOVER"};
const primitiveByShot = {"ED-07": "presenter-headline-negative-space-question", "ED-08": "presenter-headline-verdict-monument", "ED-13": "presenter-headline-two-part-contrast", "ED-19": "hero-takeover-verb-sequence"};
const planFor = (shotId, index) => ({
  shotId,
  planSha256: `${String(index + 1).repeat(64)}`,
  styleBriefSha256: `${String(index + 5).repeat(64)}`,
  typographyVisualRole: roleByShot[shotId],
  semanticJob: `为 ${shotId} 生成标题视觉 actor`,
  viewerTakeaway: `当前镜头 ${shotId} 的核心判断`,
  protectedPhrases: phraseByShot[shotId],
  assemblyMode: shotId === "ED-19" ? "FULLSCREEN" : "OVERLAY",
  exactCopy: {text: phraseByShot[shotId][0]},
  referenceInputs: [
    {id: "pinterest-retro-pixel-03", role: "grammar", publicUrl: "/generated/system-line/reference.png", sha256: `${String(index + 9).repeat(64)}`},
    {id: "pinterest-retro-pixel-04", role: "grammar", publicUrl: "/generated/system-line/reference-2.png", sha256: `${String(index + 10).repeat(64)}`},
  ],
  videoContext: {
    baseFrame: {sha256: `${String(index + 13).repeat(32)}`, publicUrl: `/generated/system-line/${shotId}.png`},
    subjectBounds: {x: 0.6, y: 0.15, width: 0.24, height: 0.7},
    faceBounds: {x: 0.64, y: 0.2, width: 0.12, height: 0.18},
    eyesBounds: {x: 0.66, y: 0.27, width: 0.08, height: 0.04},
    availableRegions: [{x: 0.04, y: 0.1, width: 0.48, height: 0.75}],
  },
});
const plans = shotIds.map(planFor);
const workspace = {
  visualBible: {sha256: "b".repeat(64), globalRules: ["复古像素与手工字体承担语义动作", "固定配色禁止，颜色随镜头语义变化", "保持至少35%连续留白", "CRT只作为局部因果材质"], visualGenerationPolicy: {reference: {observedGrammar: ["pixel-or-handmade-type-is-a-semantic-actor", "footage-and-physical-material-remain-the-primary-world"]}, visualReferencePack: {id: "pinterest-retro-pixel-v1", sources: ["01", "03", "04", "05", "06", "07", "10"].map((id, sourceIndex) => ({id: `pinterest-retro-pixel-${id}`, publicUrl: `/generated/system-line/reference-${id}.png`, sha256: `${String(sourceIndex + 1).repeat(64)}`, role: "retro-pixel-editorial-grammar"}))}}},
  production: {
    packagingStyleAuthority: {contract: "A1ActiveRetroPixelStyleAuthority/v1", referencePackId: "pinterest-retro-pixel-v1", styleProfileId: "minimal-retro-pixel-editorial-v2", referenceManifestContentSha256: "c".repeat(64)},
    generation: {summary: {queued: 0, running: 0}},
    shotIntelligence: {
      canonicalDirectorAuthority: {status: "PASS", authoritySha256: "a".repeat(64), sourceRevisionHash: "d".repeat(64)},
      canonicalDirectorTargetRepairManifest: {manifestSha256: "e".repeat(64), sourceRevisionHash: "d".repeat(64), boardRebuilt: false, generationEligibleShotIds: shotIds},
      currentAssembly: [],
      packageLookMasterPlans: plans,
    },
  },
};
const sidecar = {entries: shotIds.map((shotId, index) => ({shotId, status: "READY_FOR_GENERATION", attempt: 1, primitiveId: primitiveByShot[shotId], currentPlanSha256: plans[index].planSha256}))};
const styleBundle = buildCanonicalWebStyleBundle(workspace);
const conversation = {id: "conversation-fixture", url: "https://chatgpt.com/c/fixture-123", browser: "chrome", styleBundleSha256: styleBundle.sha256};
assert.equal(styleBundle.activeAesthetic, "pinterest-retro-pixel-v1");
assert.equal(styleBundle.composition.quietSpaceMinimumRatio, 0.35);
assert.equal(styleBundle.typography.visibleTextIsImagegenLookMasterActor, true);
assert.equal(styleBundle.palette.fixedPaletteForbidden, true);
assert.equal(styleBundle.visualAuthority.styleReferenceMode, "REFERENCE_PACK_GRAMMAR_NOT_SINGLE_ANCHOR");
assert.equal(styleBundle.visualAuthority.styleReference, undefined);
assert.equal(styleBundle.visualAuthority.styleReferences.length, 9);
assert.match(styleBundle.visualAuthority.motherStyle, /retro-pixel editorial grammar/u);
assert.doesNotMatch(styleCharterText(styleBundle), /cobalt/iu);
assert.doesNotMatch(styleCharterText(styleBundle), /electric cobalt/iu);
assert.match(styleCharterText(styleBundle), /CRT.*local semantic material/u);

const queue = buildCanonicalWebQueue({workspace, sidecar, targetShotIds: shotIds, conversation, mode: "DRY_RUN"});
assert.equal(queue.provider, "chatgpt-web-conversation");
assert.equal(queue.policy.maxConcurrentJobs, 1);
assert.equal(queue.policy.maxConcurrentBatches, 1);
assert.equal(queue.policy.maxConcurrentMessagesPerConversation, 1);
assert.equal(queue.policy.maxImagesPerMessage, 1);
assert.equal(queue.policy.returnedImageMustBeImportedBeforeNextJob, true);
assert.equal(queue.policy.batchMode, "ISOLATED_SHOT_MESSAGES");
assert.equal(queue.batch.imagesPerMessage, 1);
assert.equal(queue.batch.messageCount, 4);
assert.deepEqual(queue.batch.responseOrder, shotIds);
assert.equal(queue.batch.separateImagesRequired, true);
assert.equal(queue.batch.collageForbidden, true);
assert.equal(queue.summary.batchCount, 4);
assert.equal(queue.summary.messageCount, 4);
assert.equal(queue.jobs.length, 4);
assert.equal(queue.jobs.every((job) => job.preflight?.status === "PASS" && job.preflight?.preflightSha256), true);
assert.deepEqual(queue.jobs.find((job) => job.shotId === "ED-07").referenceInputs.map((item) => item.id), ["pinterest-retro-pixel-06", "pinterest-retro-pixel-01"]);
assert.equal(queue.jobs[0].authoritySha256, workspace.production.shotIntelligence.canonicalDirectorAuthority.authoritySha256);
assert.equal(queue.jobs[0].manifestSha256, workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest.manifestSha256);
assert.equal(queue.jobs[0].sourceRevisionHash, "d".repeat(64));
assert.throws(() => buildCanonicalWebQueue({workspace, sidecar, targetShotIds: shotIds, conversation: {...conversation, styleBundleSha256: "f".repeat(64)}, mode: "DRY_RUN"}), /canonical-web-conversation-style-bundle-drift/u);
assert.match(queue.batchPrompt, /one isolated message per shot/u);
assert.match(queue.batchPrompt, /Never send these shots as one multi-shot message/u);
for (const shotId of shotIds) assert.match(queue.batchPrompt, new RegExp(shotId, "u"));
assertCanonicalWebQueueDispatchable(queue);
assert.deepEqual(validateCanonicalWebCurrentBinding({workspace, job: queue.jobs[0]}), {status: "PASS", failures: [], shotId: "ED-07", planSha256: plans[0].planSha256, holdFrameSha256: plans[0].videoContext.baseFrame.sha256});
assert.equal(validateCanonicalWebCurrentBinding({workspace, job: {...queue.jobs[0], holdFrame: {...queue.jobs[0].holdFrame, sha256: "f".repeat(64)}}}).status, "BLOCKED");
assert.doesNotMatch(queue.batchPrompt, /cream-paper|warm cream|fixed cobalt|ED-10 single mother style/iu);
assert.equal(queue.jobs.every((job) => job.referenceInputs.length >= 2 && job.referenceInputs.length <= 4), true);
assert.equal(queue.jobs.every((job) => job.attachmentManifest.scope === "SHOT_LOCAL_ONLY" && job.attachmentManifest.fileCount >= 3 && job.attachmentManifest.fileCount <= 4), true);
assert.equal(queue.messages.length, 4);
assert.equal(queue.dispatchPlan.fixedConversationSerial, true);
assert.equal(queue.dispatchPlan.maxImagesPerMessage, 1);
assert.equal(queue.jobs.every((job) => !/semanticJob|viewerTakeaway|exactCopy|full spoken paragraph|source sentence/iu.test(job.prompt)), true);
assert.equal(new Set(queue.jobs.map((job) => job.primitiveId)).size, 4);
assert.match(queue.jobs.find((job) => job.shotId === "ED-07").prompt, /为什么不让它直接写完全文/u);
assert.match(queue.jobs.find((job) => job.shotId === "ED-08").prompt, /AI 常常不说人话/u);
assert.match(queue.jobs.find((job) => job.shotId === "ED-13").prompt, /更顺一些.*没解决/su);
assert.match(queue.jobs.find((job) => job.shotId === "ED-19").prompt, /整理.*编排.*读取.*检查/su);
assert.equal(visibleCopyForShot("ED-13", plans[2]).visibleCopy, "更顺一些  /  没解决");
assert.deepEqual(visibleCopyForShot("ED-13", plans[2]).protectedPhrases, phraseByShot["ED-13"]);
assert.match(queue.jobs.find((job) => job.shotId === "ED-19").prompt, /FULLSCREEN or HERO_TAKEOVER contains no person, presenter/u);
assert.match(queue.jobs.find((job) => job.shotId === "ED-08").prompt, /true transparent PNG overlay/u);
assert.match(queue.jobs.find((job) => job.shotId === "ED-08").prompt, /1672x941.*1536x1024 3:2/u);
assert.throws(() => assertCanonicalWebQueueDispatchable({...queue, styleSha256: "aae0e7fe498f" + "0".repeat(52)}), /legacy-style-queue-retired/u);
assert.throws(() => assertCanonicalWebQueueDispatchable({
  ...queue,
  policy: {...queue.policy, maxImagesPerMessage: 4, batchMode: "FOUR_SEPARATE_IMAGES_SINGLE_MESSAGE"},
  batch: {...queue.batch, imagesPerMessage: 4},
  messages: undefined,
  dispatchPlan: undefined,
}), /isolated-message-policy-invalid|isolated-batch-contract-invalid|isolated-message-list-invalid/u);
assert.throws(() => assertCanonicalWebQueueDispatchable({...queue, messages: queue.messages.map((message, index) => index === 0 ? {...message, prompt: `${message.prompt}\nsemanticJob=full spoken paragraph`} : message)}), /leaked-copy-field/u);
assert.throws(() => assertCanonicalWebQueueDispatchable({...queue, messages: queue.messages.map((message, index) => index === 0 ? {...message, attachmentManifest: {...message.attachmentManifest, shotId: "ED-08"}} : message)}), /attachment-shot-mismatch|isolated-message-binding-invalid/u);

const validReturn = {shotId: "ED-07", artifactSha256: "9".repeat(64), width: 1672, height: 941, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/canonical-web-generation-v1/ed-07/image.png"};
assert.equal(validateCanonicalWebReturn({queue, job: queue.jobs[0], ...validReturn}).status, "PASS");
assert.equal(validateCanonicalWebReturn({queue, job: queue.jobs[0], ...validReturn, artifactSha256: "9".repeat(63)}).status, "BLOCKED");
assert.equal(validateCanonicalWebBatchReturn({queue, artifacts: shotIds.map((shotId, index) => ({...validReturn, shotId, artifactSha256: String(index + 1).repeat(64), publicUrl: `/generated/system-line/editorial-asset-workbench-v1/canonical-web-generation-v1/${shotId.toLowerCase()}/image.png`}))}).status, "PASS");
const partialReturn = validateCanonicalWebBatchReturn({queue, artifacts: [{...validReturn, shotId: "ED-07"}]});
assert.equal(partialReturn.status, "PASS");
assert.equal(partialReturn.partial, true);
assert.deepEqual(partialReturn.missingShotIds, ["ED-08", "ED-13", "ED-19"]);
const imported = buildCanonicalWebImportRecord({queue, job: queue.jobs[0], artifactSha256: "9".repeat(64), width: 1672, height: 941, publicUrl: validReturn.publicUrl});
assert.equal(imported.provider, "chatgpt-web-conversation");
const fallbackImported = buildCanonicalWebImportRecord({queue, job: queue.jobs[0], artifactSha256: "8".repeat(64), width: 1672, height: 941, publicUrl: validReturn.publicUrl, provider: CANONICAL_GENERATION_PROVIDERS.BUILT_IN_IMAGEGEN});
assert.equal(fallbackImported.provider, "codex-built-in-imagegen");
assert.equal(fallbackImported.providerMode, "built-in-imagegen-tool");
assert.equal(fallbackImported.providerSelection, "EXPLICIT_FALLBACK_PROVIDER");
assert.equal(fallbackImported.conversationId, null);
assert.equal(imported.reviewStatus, "PENDING_ACTUAL_PIXEL_AUDIT");
assert.equal(imported.recommendationEligible, false);
assert.equal(imported.selectionEligible, false);
assert.equal(imported.assemblyEligible, false);
assert.equal(imported.holdFrameBinding.sha256, queue.jobs[0].holdFrame.sha256);
assert.throws(() => buildCanonicalWebQueue({workspace, sidecar: {entries: sidecar.entries.map((entry) => ({...entry, status: entry.shotId === "ED-07" ? "REPAIR_BLOCKED_AUDIT_FAILURE" : entry.status}))}, targetShotIds: shotIds, conversation, mode: "DRY_RUN"}), /canonical-web-shot-not-dispatchable/u);
assert.throws(() => buildCanonicalWebQueue({workspace, sidecar, targetShotIds: [...shotIds, "ED-20"], conversation, mode: "DRY_RUN"}), /canonical-web-batch-size-invalid/u);
const retrySidecar = {...sidecar, entries: sidecar.entries.map((entry) => entry.shotId === "ED-08" ? {...entry, status: "RETRY_SAME_PRIMITIVE_PENDING", attempt: 2, lastAuditFailures: ["overlay-alpha-contract-failed"]} : entry)};
const retryQueue = buildCanonicalWebQueue({workspace, sidecar: retrySidecar, targetShotIds: ["ED-08"], conversation, mode: "DRY_RUN"});
assert.equal(retryQueue.jobs[0].attempt, 2);
assert.notEqual(retryQueue.jobs[0].jobId, queue.jobs[1].jobId);
assert.match(retryQueue.jobs[0].prompt, /Dispatch attempt=2/u);
assert.match(retryQueue.jobs[0].prompt, /overlay-alpha-contract-failed/u);
assert.match(retryQueue.jobs[0].prompt, /truly contains an alpha channel/u);
const switchPrimitive = "icon-atlas-interface-language:presenter-safe-asymmetric-corner-stage";
const switchQueue = buildCanonicalWebQueue({workspace, sidecar: {entries: retrySidecar.entries.map((entry) => entry.shotId === "ED-08" ? {...entry, status: "SWITCH_PRIMITIVE_PENDING", primitiveId: switchPrimitive, attempt: 2} : entry)}, targetShotIds: ["ED-08"], conversation, mode: "DRY_RUN"});
assert.equal(switchQueue.jobs[0].primitiveId, switchPrimitive);
assert.match(switchQueue.jobs[0].prompt, new RegExp(switchPrimitive.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
assert.equal(validateCanonicalWebReturn({queue, job: queue.jobs[0], ...validReturn, width: 1536, height: 1024}).failures.includes("image-dimensions-invalid"), true);
console.log(JSON.stringify({status: "PASS", contract: "A1CanonicalWebGenerationTest/v2", queueSha256: queue.queueSha256, batchPromptSha256: queue.batchPromptSha256, styleSha256: styleBundle.sha256, provider: queue.provider, imagesPerMessage: queue.batch.imagesPerMessage, maxConcurrentBatches: queue.policy.maxConcurrentBatches, importedReviewGate: imported.reviewStatus, imageGenCalls: 0, boardRebuilt: false, assemblyStarted: false}, null, 2));
