#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  assertEditorialAssetWorkbench,
  editorialAssetContentSha256,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createGlyphCutout} from "./lib/a1-glyph-cutout-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl || "").replace(/^\/+/, ""));

const source = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const prepared = [];
const updates = new Map();
for (const asset of source.library.assets.filter((item) => item.route === "generated-glyph" && item.selectedCandidateId)) {
  for (const candidate of asset.typographySpec?.generatedCandidates || []) {
    if (!candidate.publicUrl || candidate.textVerification?.status !== "verified") continue;
    const inputPath = publicFile(candidate.publicUrl);
    if (!fs.existsSync(inputPath)) throw new Error(`approved-glyph-source-missing:${asset.id}:${candidate.id}`);
    const outputPublicUrl = candidate.publicUrl.replace(/\.png$/u, ".cutout.png");
    const result = await createGlyphCutout({inputPath, outputPath: publicFile(outputPublicUrl)});
    updates.set(`${asset.id}:${candidate.id}`, {outputPublicUrl, result});
    prepared.push({assetId: asset.id, candidateId: candidate.id, publicUrl: outputPublicUrl, ...result});
  }
}

if (prepared.length) withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  for (const asset of next.library.assets.filter((item) => item.route === "generated-glyph")) {
    let updated = false;
    for (const candidate of asset.typographySpec?.generatedCandidates || []) {
      const update = updates.get(`${asset.id}:${candidate.id}`);
      if (!update) continue;
      updated = true;
      candidate.cutoutContract = update.result.contract;
      candidate.cutoutPublicUrl = update.outputPublicUrl;
      candidate.cutoutSha256 = update.result.sha256;
      candidate.cutoutSourceSha256 = update.result.sourceSha256;
      candidate.cutoutWidth = update.result.width;
      candidate.cutoutHeight = update.result.height;
    }
    if (updated) {
      asset.status = "adopted";
      asset.review = {
        status: "approved",
        note: "保留已批准且逐字核验的原字形；透明演员是与源 SHA 绑定的确定性衍生，不改变字形内容。",
        reviewedAt: new Date().toISOString(),
        reviewedBy: "system-preserved-upstream-approval",
        approvedContentSha256: editorialAssetContentSha256(asset),
      };
    }
  }
  const now = new Date().toISOString();
  const event = createProductionEvent({
    workspace: current,
    action: "approved-glyph-transparent-actors-prepared",
    targetId: "approved-generated-glyphs",
    payload: {candidateCount: prepared.length, assetIds: [...new Set(prepared.map((item) => item.assetId))]},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next, now), {
    event,
    files: {"approved-glyph-transparent-actors-v1.json": {contract: "A1ApprovedGlyphTransparentActorSet/v1", generatedAt: now, items: prepared}},
  });
});

console.log(JSON.stringify({status: "PASS", preparedCount: prepared.length, items: prepared}, null, 2));
