#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  A1_WEB_LOOK_MASTER_MESSAGE_CONTRACT,
  assertIsolatedWebShotMessage,
  buildIsolatedWebDispatchPlan,
  buildIsolatedWebShotPrompt,
  buildWebShotAttachmentManifest,
} from "../apps/studio-next/src/lib/a1-web-look-master-provider-v1.mjs";

const hash = (digit) => String(Number(digit) % 10).repeat(64);
const shots = [
  ["ED-07", "PRESENTER_HEADLINE", "question-actor"],
  ["ED-08", "PRESENTER_HEADLINE", "verdict-actor"],
  ["ED-13", "PRESENTER_HEADLINE", "contrast-actor"],
  ["ED-19", "HERO_TAKEOVER", "verb-sequence-actor"],
  ["ED-20", "HERO_TAKEOVER", "material-workbench-handoff-actor"],
];

function inputs(shotId, index) {
  return {
    holdFrame: {publicUrl: `/generated/system-line/${shotId}.png`, sha256: hash(index + 1)},
    referenceInputs: [
      {id: `ref-${shotId}-a`, publicUrl: `/generated/system-line/ref-${index + 1}-a.png`, sha256: hash(index + 5), role: "A1-editorial-grammar"},
      {id: `ref-${shotId}-b`, publicUrl: `/generated/system-line/ref-${index + 1}-b.png`, sha256: hash(index + 9), role: "A1-material-grammar"},
    ],
  };
}

const messages = shots.map(([shotId, visualRole, primitiveId], index) => buildIsolatedWebShotPrompt({
  shotId,
  authoritySha256: hash(2),
  manifestSha256: hash(3),
  sourceRevisionHash: hash(4),
  planSha256: hash(index + 10),
  styleSha256: hash(20),
  styleProfileId: "minimal-retro-pixel-editorial-v1",
  visualRole,
  primitiveId,
  assemblyMode: ["ED-19", "ED-20"].includes(shotId) ? "FULLSCREEN" : "OVERLAY",
  ...inputs(shotId, index),
}));

for (const message of messages) {
  assert.equal(message.contract, A1_WEB_LOOK_MASTER_MESSAGE_CONTRACT);
  assert.equal(assertIsolatedWebShotMessage(message).status, "PASS");
  assert.equal(message.attachmentManifest.scope, "SHOT_LOCAL_ONLY");
  assert.equal(message.attachmentManifest.fileCount, 3);
  assert.equal(message.attachmentManifest.files.every((file) => file.shotId === message.shotId), true);
  assert.doesNotMatch(message.prompt, /semanticJob|viewerTakeaway|exactCopy|full spoken paragraph|source sentence/iu);
  assert.doesNotMatch(message.prompt, /cream-paper|warm cream|fixed cobalt|single mother style|electric cobalt/iu);
  assert.match(message.prompt, /exactly one clean 16:9 PNG/u);
  assert.match(message.prompt, /shot-local files/u);
}

const plan = buildIsolatedWebDispatchPlan({messages});
assert.equal(plan.mode, "ISOLATED_SHOT_MESSAGES");
assert.equal(plan.fixedConversationSerial, true);
assert.equal(plan.maxConcurrentMessagesPerConversation, 1);
assert.equal(plan.maxImagesPerMessage, 1);
assert.deepEqual(plan.messages.map((message) => message.shotId), shots.map(([shotId]) => shotId));

const ed07Takeover = buildIsolatedWebShotPrompt({
  shotId: "ED-07",
  authoritySha256: hash(2),
  manifestSha256: hash(3),
  sourceRevisionHash: hash(4),
  planSha256: hash(10),
  styleSha256: hash(20),
  styleProfileId: "minimal-retro-pixel-editorial-v1",
  visualRole: "HERO_TAKEOVER",
  primitiveId: "presenter-headline-negative-space-question-v2",
  assemblyMode: "FULLSCREEN",
  ...inputs("ED-07", 0),
});
assert.match(ed07Takeover.prompt, /FULLSCREEN or HERO_TAKEOVER contains no person, presenter, or hold-frame portrait/u);
assert.match(ed07Takeover.prompt, /hold frame is timing\/geometry provenance only/u);
assert.doesNotMatch(ed07Takeover.prompt, /preserve the real face\/eyes\/body/u);

assert.throws(() => buildWebShotAttachmentManifest({
  shotId: "ED-07",
  ...inputs("ED-07", 0),
  referenceInputs: [{...inputs("ED-07", 0).referenceInputs[0], shotId: "ED-08"}, inputs("ED-07", 0).referenceInputs[1]],
}), /cross-shot-reference/u);
assert.throws(() => buildWebShotAttachmentManifest({
  shotId: "ED-07",
  ...inputs("ED-07", 0),
  referenceInputs: [
    {...inputs("ED-07", 0).referenceInputs[0], id: "pinterest-retro-pixel-light-one-bit-08-v1", group: "light-one-bit-story-screen"},
    {...inputs("ED-07", 0).referenceInputs[1], id: "pinterest-retro-pixel-light-one-bit-09-v1", group: "light-one-bit-story-screen"},
  ],
}), /reference-group-duplicate/u);
assert.throws(() => assertIsolatedWebShotMessage({...messages[0], prompt: `${messages[0].prompt}\nsemanticJob=full spoken paragraph`}), /leaked-copy-field/u);
assert.throws(() => assertIsolatedWebShotMessage({...messages[0], attachmentManifest: {...messages[0].attachmentManifest, shotId: "ED-08"}}), /attachment-shot-mismatch/u);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1WebLookMasterProviderTest/v1",
  shotCount: messages.length,
  oneImagePerMessage: plan.maxImagesPerMessage,
  serialConversation: plan.fixedConversationSerial,
  crossShotAttachmentRejected: true,
  duplicateReferenceGroupRejected: true,
  leakedPromptFieldRejected: true,
  imageGenCalls: 0,
}, null, 2));
