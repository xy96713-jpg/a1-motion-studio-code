#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const sourceRoot = path.join(publicRoot, "generated/system-line/typography-imagegen-masters-v1");
const phaseId = "editorial-asset-workbench-v1";
const outputRoot = path.join(publicRoot, "generated/system-line", phaseId, "generated-assets");
const manifestPath = path.join(sourceRoot, "manifest.json");
const now = new Date().toISOString();

const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const args = new Map(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => {
  const [key, ...rest] = value.slice(2).split("=");
  return [key, rest.join("=")];
}));
const manifest = readJson(manifestPath);
if (manifest.contract !== "A1TypographyImagegenMasterSet/v1") throw new Error("typography-imagegen-master-manifest-contract-invalid");
if (!Array.isArray(manifest.masters) || manifest.masters.length !== 2) throw new Error("typography-imagegen-master-count-invalid");

const promptByMasterId = {
  "ai-taste": "Create one original premium 16:9 editorial styleframe for the exact phrase AI 味. Treat the phrase as a single oversized typographic actor with tactile warm paper, graphite ink, semantic cobalt and restrained vermilion; use print misregistration, rough ink edges, asymmetric scale and a purposeful crop. No extra readable words, UI, HUD, logo, card, arrow or factual evidence. Preserve an editable local text shadow for final rendering.",
  "polished-waste": "Create one original premium 16:9 editorial styleframe for the exact phrase 完成度很高的废稿. Make the phrase one typographic verdict with a material collision between finished-looking craft and a marked waste conclusion; use warm paper, graphite ink, semantic cobalt and a restrained vermilion correction mark, with purposeful crop and tactile print texture. No extra readable words, UI, HUD, logo, card, arrow or factual evidence. Preserve an editable local text shadow for final rendering.",
};
const bindingByMasterId = {
  "ai-taste": {assetId: "glyph-board-ai-taste", preferredForShotIds: ["ED-09"], referenceOnlyForShotIds: ["ED-08"]},
  "polished-waste": {assetId: "glyph-board-polished-waste", preferredForShotIds: ["ED-10"], referenceOnlyForShotIds: []},
};

const imported = manifest.masters.map((master) => {
  const source = path.join(sourceRoot, path.basename(master.assetUri));
  if (!fs.existsSync(source)) throw new Error(`typography-imagegen-master-file-missing:${master.id}`);
  const sourceSha256 = shaFile(source);
  if (sourceSha256 !== master.sha256) throw new Error(`typography-imagegen-master-hash-mismatch:${master.id}`);
  const binding = bindingByMasterId[master.id];
  if (!binding) throw new Error(`typography-imagegen-master-binding-missing:${master.id}`);
  const destinationRelativePath = `generated/system-line/${phaseId}/generated-assets/${binding.assetId}/imagegen-master-v1.png`;
  const destination = path.join(publicRoot, destinationRelativePath);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(source, destination);
  return {
    master,
    binding,
    source,
    destination,
    destinationRelativePath,
    sha256: shaFile(destination),
    prompt: promptByMasterId[master.id],
  };
});

const outputMetadata = async (item) => {
  const metadata = await sharp(item.destination).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`typography-imagegen-master-dimensions-missing:${item.master.id}`);
  return {...item, width: metadata.width, height: metadata.height};
};
const items = [];
for (const item of imported) items.push(await outputMetadata(item));

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = ensureProductionState(current, now);
  const jobs = [];
  const bindings = [];

  for (const item of items) {
    const {master, binding} = item;
    const asset = next.library.assets.find((candidate) => candidate.id === binding.assetId);
    if (!asset || asset.route !== "generated-glyph") throw new Error(`generated-glyph-asset-missing:${binding.assetId}`);
    const candidateId = `${binding.assetId}-imagegen-master-v1`;
    const promptSha256 = sha256(item.prompt);
    const generationId = `typography-master-import-${master.id}-${item.sha256.slice(0, 12)}`;
    const job = {
      contract: "A1AssetGenerationJob/v2",
      id: generationId,
      projectId: next.production.project.projectId,
      sourceHash: next.article.sourceTextSha256,
      assetPackSha256: next.library.assetPackSha256,
      assetId: binding.assetId,
      candidateId,
      direction: "imagegen-styleframe-master",
      expectedText: master.exactText,
      route: "operator-led-built-in-image-generation",
      provider: "openai-built-in-imagegen",
      providerMode: "subscription-zero-extra-cost",
      model: "gpt-image-2",
      generationId,
      status: "complete",
      prompt: item.prompt,
      promptSha256,
      cacheKey: sha256({masterId: master.id, sha256: item.sha256, promptSha256}),
      attempts: 1,
      cacheHit: false,
      imported: true,
      sourceManifest: "/generated/system-line/typography-imagegen-masters-v1/manifest.json",
      error: null,
      createdAt: now,
      startedAt: now,
      completedAt: now,
      durationMs: null,
      output: {
        publicUrl: `/${item.destinationRelativePath}`,
        sha256: item.sha256,
        width: item.width,
        height: item.height,
        bytes: fs.statSync(item.destination).size,
      },
    };
    const previous = next.production.generation.jobs.find((candidate) => candidate.id === generationId);
    if (!previous) next.production.generation.jobs.push(job);
    else Object.assign(previous, job);
    jobs.push(job);

    const candidate = {
      id: candidateId,
      direction: "imagegen-styleframe-master",
      publicUrl: job.output.publicUrl,
      sha256: item.sha256,
      width: item.width,
      height: item.height,
      promptSha256,
      sourceType: "openai-built-in-imagegen-typography-master",
      sourceManifest: job.sourceManifest,
      generatedStyleframe: true,
      renderReferenceAllowed: true,
      referenceOnly: true,
      rasterReferenceFinal: false,
      editableTextShadowRequired: true,
      preferredForShotIds: binding.preferredForShotIds,
      referenceOnlyForShotIds: binding.referenceOnlyForShotIds,
      textVerification: {
        status: "verified",
        expectedText: master.exactText,
        observedText: master.exactText,
        reviewedBy: "codex-visual-inspection",
        verifiedAt: now,
      },
    };
    asset.typographySpec ||= {};
    asset.typographySpec.generatedCandidates = [
      ...(asset.typographySpec.generatedCandidates || []).filter((candidateItem) => candidateItem.id !== candidateId),
      candidate,
    ];
    asset.typographySpec.importedStyleframeMasters = [
      ...(asset.typographySpec.importedStyleframeMasters || []).filter((masterItem) => masterItem.id !== master.id),
      {
        id: master.id,
        exactText: master.exactText,
        candidateId,
        publicUrl: job.output.publicUrl,
        sha256: item.sha256,
        sourceManifest: job.sourceManifest,
        importedAt: now,
        renderReferenceAllowed: true,
        finalRasterSubstitutionAllowed: false,
      },
    ];
    asset.typographySpec.editableTextShadow = {
      ...(asset.typographySpec.editableTextShadow || {}),
      text: master.exactText,
      fontAssetId: asset.typographySpec.editableTextShadow?.fontAssetId || "type-pixel-correction",
      required: true,
    };
    asset.usedByShotIds = [...new Set([...(asset.usedByShotIds || []), ...master.usedByShotIds])];
    bindings.push({masterId: master.id, assetId: binding.assetId, candidateId, preferredForShotIds: binding.preferredForShotIds});
  }

  next.production.generation.summary = {
    queued: next.production.generation.jobs.filter((job) => job.status === "queued").length,
    running: next.production.generation.jobs.filter((job) => job.status === "running").length,
    complete: next.production.generation.jobs.filter((job) => job.status === "complete").length,
    failed: next.production.generation.jobs.filter((job) => job.status === "failed").length,
  };
  next.production.generation.updatedAt = now;
  next.production.typographyImagegenMasterBinding = {
    contract: "A1TypographyImagegenMasterBinding/v1",
    manifest: "/generated/system-line/typography-imagegen-masters-v1/manifest.json",
    importedAt: now,
    bindings,
    sourceTruth: "editable-text-shadow-and-real-source-remain-authoritative",
    rasterReferenceFinal: false,
  };
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const event = createProductionEvent({
    workspace: current,
    action: "typography-imagegen-masters-imported",
    targetId: "typography-imagegen-masters-v1",
    payload: {bindings, sourceManifest: "/generated/system-line/typography-imagegen-masters-v1/manifest.json"},
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      "typography-imagegen-master-import-v2.json": {
        contract: "A1TypographyImagegenMasterImport/v2",
        importedAt: now,
        bindings,
        jobs: jobs.map((job) => ({id: job.id, assetId: job.assetId, candidateId: job.candidateId, output: job.output})),
        workspaceSha256: recalculated.workspaceSha256,
      },
    },
  });
  console.log(JSON.stringify({status: "IMPORTED", importedAt: now, bindings, workspaceSha256: recalculated.workspaceSha256}, null, 2));
});
