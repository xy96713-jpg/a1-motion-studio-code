#!/usr/bin/env node

import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES,
  approveGoldenLookAnchors,
  buildGoldenLookAnchorRegistry,
  compileAnchorBoundGeneration,
  preflightAnchoredGeneration,
  rebaseEd20RepairEntry,
  retrieveApprovedGoldenAnchor,
} from "../apps/studio-next/src/lib/a1-golden-look-anchor-registry-v1.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-golden-anchor-"));
try {
  const anchorBytes = Buffer.from("fixture-anchor-pixels");
  const holdBytes = Buffer.from("fixture-hold-frame");
  fs.writeFileSync(path.join(temporaryRoot, "anchor.png"), anchorBytes);
  fs.writeFileSync(path.join(temporaryRoot, "hold.jpg"), holdBytes);
  const hash = sha256(Buffer.from("audit"));
  const registry = buildGoldenLookAnchorRegistry({
    sourceWorkspaceSha256: hash,
    sourceBoardSha256: hash,
    contactSheet: {publicUrl: "/contact.png", sha256: hash, width: 1920, height: 1260},
    entries: [{
      anchorId: "anchor-ed-07",
      shotId: "ED-07",
      candidateId: "candidate-ed-07",
      projectLocalUrl: "/anchor.png",
      path: "anchor.png",
      contentSha256: sha256(anchorBytes),
      packageType: "OVERLAY_PACKAGE",
      primaryPrimitive: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY,
      semanticRole: "question",
      dominantActor: "pixel-window",
      composition: "unequal-window-in-negative-space",
      surfaceLogic: "local-pixel-grid",
      paletteRoles: ["cool-neutral", "charcoal", "one-accent"],
      windowCount: 2,
      typographyBehavior: "short-integrated-phrase",
      holdFrameCompatibility: "ACTUAL_BASE_FRAME_COMPOSITE_PASS",
      allowedUses: [A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY],
      forbiddenUses: [A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.FULLSCREEN_EXCEPTION],
      sourceAudit: {status: "PASS", duplicateStatus: "PASS", exception: false, historyReadOnly: false, pixelAuditSha256: hash, semanticAuditSha256: hash, candidateAuthoritySha256: hash},
    }],
  });

  assert.equal(retrieveApprovedGoldenAnchor(registry, {anchorId: "anchor-ed-07", allowedUse: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY, publicRoot: temporaryRoot}).status, "NEEDS_ANCHOR_REVIEW", "candidate anchor must never enter production retrieval");
  const approved = approveGoldenLookAnchors(registry, ["anchor-ed-07"]);
  assert.equal(retrieveApprovedGoldenAnchor(approved, {anchorId: "anchor-ed-07", allowedUse: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY, publicRoot: temporaryRoot}).status, "PASS", "approved exact file/SHA must be retrievable");

  const completeContext = {
    baseFrame: {publicUrl: "/hold.jpg", sha256: sha256(holdBytes)},
    subjectBounds: {x: 0.4, y: 0.2, width: 0.4, height: 0.75},
    exclusions: {
      face: [{x: 0.5, y: 0.25, width: 0.2, height: 0.2}],
      eyes: [{x: 0.52, y: 0.31, width: 0.16, height: 0.05}],
      mouth: [{x: 0.54, y: 0.4, width: 0.12, height: 0.05}],
      gesture: [{x: 0.43, y: 0.58, width: 0.3, height: 0.3}],
    },
    safeZones: [{x: 0.05, y: 0.82, width: 0.9, height: 0.12}],
    availableRegions: [{x: 0.05, y: 0.12, width: 0.3, height: 0.55}],
  };
  const pass = preflightAnchoredGeneration({registry: approved, publicRoot: temporaryRoot, anchorId: "anchor-ed-07", assemblyMode: "OVERLAY", primitiveId: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY, videoContext: completeContext});
  assert.equal(pass.status, "PASS");
  for (const [field, expectedFailure] of [
    ["baseFrame", "OVERLAY_HOLD_FRAME_URL_REQUIRED"],
    ["subjectBounds", "OVERLAY_SUBJECT_BOUNDS_REQUIRED"],
    ["safeZones", "OVERLAY_SAFE_ZONE_REQUIRED"],
    ["availableRegions", "OVERLAY_AVAILABLE_REGION_REQUIRED"],
  ]) {
    const context = structuredClone(completeContext);
    if (field === "baseFrame") context.baseFrame = {};
    else context[field] = field === "subjectBounds" ? null : [];
    const blocked = preflightAnchoredGeneration({registry: approved, publicRoot: temporaryRoot, anchorId: "anchor-ed-07", assemblyMode: "OVERLAY", primitiveId: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY, videoContext: context});
    assert.equal(blocked.status, "BLOCKED");
    assert(blocked.failures.includes(expectedFailure));
  }
  for (const exclusion of ["face", "eyes", "mouth", "gesture"]) {
    const context = structuredClone(completeContext);
    context.exclusions[exclusion] = [];
    const blocked = preflightAnchoredGeneration({registry: approved, publicRoot: temporaryRoot, anchorId: "anchor-ed-07", assemblyMode: "OVERLAY", primitiveId: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY, videoContext: context});
    assert(blocked.failures.includes(`OVERLAY_${exclusion.toUpperCase()}_EXCLUSION_REQUIRED`));
  }
  const fullscreen = preflightAnchoredGeneration({registry: approved, publicRoot: temporaryRoot, anchorId: "anchor-ed-07", assemblyMode: "FULLSCREEN", primitiveId: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.FULLSCREEN_EXCEPTION});
  assert.equal(fullscreen.status, "BLOCKED");
  assert(fullscreen.failures.includes("FULLSCREEN_CRT_STORY_EXPLICIT_EXCEPTION_REQUIRED"), "fullscreen CRT must not be a normal fallback");

  const compiled = compileAnchorBoundGeneration({registry: approved, publicRoot: temporaryRoot, anchorId: "anchor-ed-07", assemblyMode: "OVERLAY", primitiveId: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY, videoContext: completeContext, semanticPrompt: "整理材料，明确约束，继续编辑，最后收稿。"});
  assert.equal(compiled.status, "PASS");
  assert(compiled.prompt.includes(approved.entries[0].contentSha256));
  assert(compiled.prompt.includes(approved.entries[0].projectLocalUrl));
  assert(compiled.prompt.includes("Do not default to yellow paper, cream paper, or sepia"));

  const rebased = rebaseEd20RepairEntry({shotId: "ED-20", status: "RETRY_SAME_PRIMITIVE_PENDING", primitiveId: "human-editorial-manuscript-table:one-continuous-paper-story", attempt: 1, generationAllowed: true, candidateSha: hash, canary: {artifactSha: hash, status: "AUDIT_FAIL"}, canaryHistory: []}, {registrySha256: approved.registrySha256});
  assert.equal(rebased.status, "ANCHOR_REBASE_REQUIRED");
  assert.equal(rebased.generationAllowed, false);
  assert.equal(rebased.primitiveId, A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY);
  assert.equal(rebased.candidateSha, null);
  assert.equal(rebased.canary, null);
  assert.equal(rebased.canaryHistory.at(-1).status, "HISTORY_READ_ONLY");
  assert.equal(rebased.ed20OverlayPolicy.fullscreenFallbackAllowed, false);

  console.log(JSON.stringify({contract: "A1GoldenLookAnchorRegistryFixtureTest/v1", status: "PASS", checks: 18}, null, 2));
} finally {
  fs.rmSync(temporaryRoot, {recursive: true, force: true});
}
