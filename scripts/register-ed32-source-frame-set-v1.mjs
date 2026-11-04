#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const now = new Date().toISOString();
const frameSpecs = [
  {atMs: 198300, file: "ED-32/ED-32-198300.jpg"},
  {atMs: 201480, file: "ED-32/ED-32-201480.jpg"},
  {atMs: 204000, file: "ED-32/ED-32-204000.jpg"},
];
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const alias = next.library.assets.find((asset) => asset.id === "presenter-ch09-limitations-take");
  if (!alias) throw new Error("ed32-segment-alias-missing");
  const existing = alias.presenterEvidence?.shotFrames?.filter((frame) => frame.shotId === "ED-32") || [];
  const frames = [...existing];
  for (const spec of frameSpecs) {
    const publicUrl = `/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/${spec.file}`;
    const file = path.join(publicRoot, publicUrl.replace(/^\/+/, ""));
    if (!fs.existsSync(file)) throw new Error(`ed32-source-frame-missing:${file}`);
    const nextFrame = {shotId: "ED-32", atMs: spec.atMs, publicUrl, sha256: sha256File(file)};
    const index = frames.findIndex((frame) => frame.atMs === spec.atMs);
    if (index >= 0) frames[index] = nextFrame;
    else frames.push(nextFrame);
  }
  frames.sort((left, right) => Number(left.atMs) - Number(right.atMs));
  alias.presenterEvidence.shotFrames = frames;
  alias.segmentEvidence = {
    ...alias.segmentEvidence,
    frameSet: frames.map((frame) => ({atMs: frame.atMs, publicUrl: frame.publicUrl, sha256: frame.sha256})),
    frameSelectionPolicy: "candidate-variant-samples-real-source-frame-within-exact-srt-window",
  };
  alias.contentSha256 = editorialAssetContentSha256(alias);
  alias.review = {
    status: "approved",
    note: "ED-32 使用同一连续真人源片段内的三帧真实时刻做静态候选审片；未生成替身。",
    reviewedAt: now,
    reviewedBy: "system-source-audit",
    approvedContentSha256: alias.contentSha256,
  };
  const shot = next.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-32");
  if (!shot) throw new Error("ed32-shot-composition-missing");
  shot.shotDemand.sourceSegmentEvidence = structuredClone(alias.segmentEvidence);
  shot.shotDemand.sourceFrameSet = structuredClone(alias.segmentEvidence.frameSet);
  shot.candidates = [];
  shot.selectedCandidateId = null;
  shot.candidateRender = null;
  shot.visualCritic = null;
  shot.status = "brief-ready";
  shot.review = {status: "pending", note: "同一连续真人片段的真实多时刻帧已绑定，等待候选重建。", reviewedAt: now, reviewedBy: "system-source-audit", approvedContentSha256: null};
  shot.candidateSetAudit = {
    ...(shot.candidateSetAudit || {contract: "A1ShotCandidateSetAudit/v1"}),
    status: "READY_FOR_CANDIDATE_GENERATION",
    candidateCount: 0,
    distinctSilhouetteCount: 0,
    preflightAt: now,
    blockingReason: null,
  };
  const event = createProductionEvent({
    workspace: current,
    action: "ed32-real-presenter-source-frame-set-registered",
    targetId: "ED-32",
    payload: {segmentAssetId: alias.id, frameSet: alias.segmentEvidence.frameSet},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  assertEditorialAssetWorkbench(recalculated);
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      "anchor-source-evidence-v1/ed32-source-frame-set.json": {
        contract: "A1PresenterSourceFrameSet/v1",
        shotId: "ED-32",
        segmentAssetId: alias.id,
        frameSet: alias.segmentEvidence.frameSet,
        workspaceSha256: recalculated.workspaceSha256,
      },
    },
  });
  return {workspaceSha256: recalculated.workspaceSha256, frameSet: alias.segmentEvidence.frameSet};
});

console.log(JSON.stringify({status: "ED32_SOURCE_FRAME_SET_REGISTERED", ...result}, null, 2));
