#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {buildImagegenArtDirectionSpec} from "../apps/studio-next/src/lib/a1-imagegen-art-direction-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const args = new Map(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => {
  const [key, ...rest] = value.slice(2).split("=");
  return [key, rest.join("=")];
}));
const shotId = args.get("shot") || "ED-01";
const source = path.resolve(args.get("source") || "");
const directionId = args.get("direction") || "desk-type-object";
const directionLabel = args.get("label") || directionId;
const candidateId = args.get("candidate") || `${shotId}-ART-imagegen-keyframe-v2`;
const sourceFrameSha256Arg = args.get("source-frame-sha256") || null;
if (!fs.existsSync(source)) throw new Error(`imagegen-reference-source-missing:${source}`);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const now = new Date().toISOString();
const outputRelativePath = `generated/system-line/editorial-asset-workbench-v1/art-direction/${shotId}/imagegen-keyframe-v2.png`;
const outputPath = path.join(publicRoot, outputRelativePath);

const metadata = await sharp(source).metadata();
if (!metadata.width || !metadata.height) throw new Error("imagegen-reference-dimensions-missing");
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
if (path.resolve(source) !== path.resolve(outputPath)) fs.copyFileSync(source, outputPath);
const outputSha256 = fileSha256(outputPath);
const compositionSpec = buildImagegenArtDirectionSpec(directionId, directionLabel);

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  next.production.shotArtDirectionByShotId ||= {};
  const legacySet = next.production.shotArtDirection;
  const set = next.production.shotArtDirectionByShotId[shotId]
    || (legacySet?.shotId === shotId ? legacySet : null)
    || {
      contract: "A1ShotArtDirectionReferenceSet/v1",
      shotId,
      targetShotId: null,
      purpose: `imagegen-art-direction-${shotId.toLowerCase()}`,
      status: "concepts-ready",
      jobIds: [],
      outputs: [],
      reviewOnly: true,
      creativeInputAllowed: true,
      candidateAdoptionAllowed: false,
      sourceFrameSha256: sourceFrameSha256Arg || outputSha256,
      updatedAt: now,
    };
  if (set.status !== "concepts-ready") throw new Error(`imagegen-art-direction-set-not-ready:${shotId}`);
  if (sourceFrameSha256Arg) set.sourceFrameSha256 = sourceFrameSha256Arg;
  const output = {
    contract: "A1ShotArtDirectionReference/v1",
    jobId: null,
    candidateId,
    direction: directionLabel,
    publicUrl: `/${outputRelativePath}`,
    sha256: outputSha256,
    width: metadata.width,
    height: metadata.height,
    provider: "openai-built-in-imagegen",
    model: "gpt-image-2",
    promptSha256: null,
    inputReferenceHashes: [set.sourceFrameSha256 || outputSha256],
    creativeInputAllowed: true,
    compositionSpec,
    referenceOnly: true,
    candidateAdoptionAllowed: false,
    preferredForReview: true,
    generatedAt: now,
  };
  set.outputs = [output, ...(set.outputs || []).filter((item) => item.candidateId !== candidateId)];
  set.creativeInputAllowed = true;
  set.updatedAt = now;
  next.production.shotArtDirectionByShotId[shotId] = set;
  if (!legacySet || legacySet.shotId === shotId) next.production.shotArtDirection = set;
  const event = createProductionEvent({workspace: current, action: "imagegen-art-direction-reference-registered", targetId: shotId, payload: {candidateId, outputSha256, compositionSpec: compositionSpec.id}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {[`art-direction-${shotId}-latest.json`]: {contract: "A1ImagegenArtDirectionRegistration/v1", shotId, output, workspaceSha256: recalculated.workspaceSha256}}});
  console.log(JSON.stringify({status: "REGISTERED", shotId, candidateId, publicUrl: output.publicUrl, compositionSpec: compositionSpec.id, workspaceSha256: recalculated.workspaceSha256}, null, 2));
});
