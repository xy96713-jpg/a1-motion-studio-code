#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench, sha256Json} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const now = new Date().toISOString();

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function parseSrt(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, "");
  return text.split(/\n\s*\n/u).map((block) => {
    const lines = block.split(/\r?\n/u).filter(Boolean);
    const timingIndex = lines.findIndex((line) => /\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/u.test(line));
    if (timingIndex < 0) return null;
    const [start, end] = lines[timingIndex].split(/\s+-->\s+/u);
    const parseTime = (value) => {
      const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/u);
      if (!match) throw new Error(`srt-time-invalid:${value}`);
      return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
    };
    const id = Number(lines[0]);
    return {id, startMs: parseTime(start), endMs: parseTime(end), text: lines.slice(timingIndex + 1).join(" ").trim()};
  }).filter(Boolean);
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = ensureProductionState(structuredClone(current), now);
  const ed32 = next.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-32");
  if (!ed32) throw new Error("ed32-shot-composition-missing");
  const continuous = next.library.assets.find((asset) => asset.id === "source-presenter-continuous-video" && asset.review?.status === "approved");
  if (!continuous?.assetUri || !continuous.presenterEvidence?.shotFrames?.some((frame) => frame.shotId === "ED-32")) throw new Error("ed32-approved-continuous-presenter-source-missing");
  const sourceFile = path.join(publicRoot, continuous.assetUri.replace(/^\/+/, ""));
  if (!fs.existsSync(sourceFile)) throw new Error(`ed32-presenter-source-file-missing:${sourceFile}`);
  const semanticSource = next.article?.semanticSourceCorrection?.rawSource;
  const srtPath = semanticSource?.path;
  if (!srtPath || !fs.existsSync(srtPath)) throw new Error(`ed32-srt-missing:${srtPath || "unset"}`);
  const srtSha256 = sha256File(srtPath);
  if (srtSha256 !== semanticSource.srtSha256) throw new Error("ed32-srt-hash-mismatch");
  const shotDemand = ed32.shotDemand;
  const cues = parseSrt(srtPath).filter((cue) => shotDemand.cueIds.includes(cue.id));
  if (cues.length !== shotDemand.cueIds.length) throw new Error("ed32-srt-cues-incomplete");
  const sourceText = cues.map((cue) => cue.text).join(" ");
  if (sourceText !== shotDemand.sourceText) throw new Error("ed32-srt-source-text-mismatch");
  const firstCue = cues[0];
  const lastCue = cues.at(-1);
  if (firstCue.startMs !== shotDemand.editWindow.startMs || lastCue.endMs !== shotDemand.editWindow.endMs) throw new Error("ed32-srt-edit-window-mismatch");
  const frame = continuous.presenterEvidence.shotFrames.find((item) => item.shotId === "ED-32");
  if (frame.atMs < firstCue.startMs || frame.atMs > lastCue.endMs) throw new Error("ed32-presenter-frame-outside-srt-window");

  const aliasId = "presenter-ch09-limitations-take";
  if (next.library.assets.some((asset) => asset.id === aliasId)) throw new Error("ed32-source-segment-alias-already-exists");
  const alias = {
    ...structuredClone(continuous),
    id: aliasId,
    name: "ED-32 责任声明真人连续片段",
    purpose: "ED-32 presenter-clean source segment bound to the exact SRT responsibility statement",
    semanticRole: "presenter-source-segment-ed32-limitations",
    usedByShotIds: ["ED-32"],
    presenterEvidence: {
      ...structuredClone(continuous.presenterEvidence),
      shotFrames: [structuredClone(frame)],
    },
    segmentEvidence: {
      contract: "A1PresenterSourceSegmentEvidence/v1",
      sourceAssetId: continuous.id,
      sourceVideoPublicUrl: continuous.assetUri,
      sourceVideoSha256: continuous.presenterEvidence.sha256,
      sourceStartMs: firstCue.startMs,
      sourceEndMs: lastCue.endMs,
      frameAtMs: frame.atMs,
      framePublicUrl: frame.publicUrl,
      frameSha256: frame.sha256,
      cueIds: cues.map((cue) => cue.id),
      sourceText,
      srtPath,
      srtSha256,
      identityPolicy: "user-owned-real-presenter-no-ai-substitution",
      continuityPolicy: "same-continuous-video-source; segment alias only; no synthetic replacement",
    },
    provenance: {
      ...structuredClone(continuous.provenance),
      sourceType: "user-owned-presenter-continuous-video-segment",
      sourceUri: continuous.provenance.sourceUri,
      segmentEvidence: "A1PresenterSourceSegmentEvidence/v1",
      evidenceBoundary: "real continuous presenter footage; exact SRT-bounded ED-32 segment",
    },
    status: "approved",
  };
  alias.contentSha256 = editorialAssetContentSha256(alias);
  alias.review = {
    status: "approved",
    note: "已核验连续真人视频、ED-32 精确 SRT 时间窗与帧位；这是源片段别名，不是替代素材。",
    reviewedAt: now,
    reviewedBy: "system-source-audit",
    approvedContentSha256: alias.contentSha256,
  };
  next.library.assets.push(alias);

  const beforeBlock = structuredClone(ed32.automationBlock || null);
  const beforeAudit = structuredClone(ed32.candidateSetAudit || null);
  ed32.shotDemand.requiredMaterialIds = [aliasId];
  ed32.shotDemand.materialGate = "READY_FOR_CANDIDATE_GENERATION";
  ed32.shotDemand.missingMaterialIds = [];
  ed32.shotDemand.sourceSegmentEvidence = structuredClone(alias.segmentEvidence);
  ed32.shotDemand.sourceEvidenceResolution = {
    contract: "A1ShotSourceEvidenceResolution/v1",
    status: "resolved",
    resolvedAt: now,
    sourceAssetId: continuous.id,
    segmentAssetId: aliasId,
    evidenceSha256: sha256Json(alias.segmentEvidence),
  };
  ed32.revisionHistory ||= [];
  ed32.revisionHistory.push({
    contract: "A1ShotSourceEvidenceBlockResolution/v1",
    reason: "ed32-real-continuous-presenter-segment-resolved",
    resolvedAt: now,
    previousAutomationBlock: beforeBlock,
    previousCandidateSetAudit: beforeAudit,
    segmentEvidence: structuredClone(alias.segmentEvidence),
  });
  delete ed32.automationBlock;
  ed32.candidateSetAudit = {
    contract: "A1ShotCandidateSetAudit/v1",
    status: "READY_FOR_CANDIDATE_GENERATION",
    candidateCount: 0,
    structureDirectionCount: ed32.shotDemand.structureDirections.length,
    distinctSilhouetteCount: 0,
    requiredDistinctSilhouetteCount: 1,
    visualPrimitiveId: ed32.shotDemand.visualPrimitiveId || null,
    imageGenerationDispatched: false,
    renderDispatched: false,
    preflightAt: now,
    blockingReason: null,
  };
  ed32.candidates = [];
  ed32.selectedCandidateId = null;
  ed32.candidateRender = null;
  ed32.visualCritic = null;
  ed32.status = "brief-ready";
  ed32.review = {status: "pending", note: "真实连续视频片段已核验，等待静态 scene-graph 候选审片。", reviewedAt: now, reviewedBy: "system-source-audit", approvedContentSha256: null};

  const graphDemand = next.assetRequirementGraph?.shotDemands?.find((item) => item.shotId === "ED-32");
  if (graphDemand) {
    graphDemand.requiredMaterialIds = [aliasId];
    graphDemand.candidateAssetIds = [...new Set([...(graphDemand.candidateAssetIds || []), aliasId])];
    graphDemand.materialGate = "READY_FOR_CANDIDATE_GENERATION";
    graphDemand.bindingRepair = {
      contract: "A1ShotSourceEvidenceResolution/v1",
      resolvedAt: now,
      sourceAssetId: continuous.id,
      segmentAssetId: aliasId,
    };
  }
  const event = createProductionEvent({
    workspace: current,
    action: "ed32-real-presenter-source-segment-resolved",
    targetId: "ED-32",
    payload: {sourceAssetId: continuous.id, segmentAssetId: aliasId, segmentEvidence: alias.segmentEvidence},
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
      "anchor-source-evidence-v1/ed32-source-segment-evidence.json": {
        contract: "A1PresenterSourceSegmentEvidence/v1",
        shotId: "ED-32",
        segmentAssetId: aliasId,
        segmentEvidence: alias.segmentEvidence,
        workspaceSha256: recalculated.workspaceSha256,
      },
    },
  });
  return {workspaceSha256: recalculated.workspaceSha256, aliasId, sourceAssetId: continuous.id, segmentEvidence: alias.segmentEvidence, authorityNextAction: recalculated.production.authority.nextAction};
});

console.log(JSON.stringify({status: "ED32_SOURCE_EVIDENCE_RESOLVED", ...result}, null, 2));
