import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {generationInputHash, generationJobIdentity} from "../apps/studio-next/src/lib/a1-generation-cache-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve(process.cwd(), "apps/studio-next");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  let workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  workspace = ensureProductionState(workspace);
  const proof = workspace.production.packagingAnchorProof;
  if (proof?.contract !== "A1ReferenceConditionedPackagingAnchorProof/v1") throw new Error("reference-conditioned-proof-required");
  const {publicDir} = projectDirs(appRoot);
  const anchors = proof.anchors || [];
  const registered = [];
  for (const anchor of anchors) {
    const master = anchor.imagegenMaster;
    if (!master?.workspacePublicUrl || !master.sourceSha256) throw new Error(`imagegen-master-provenance-missing:${anchor.eventId}`);
    const relative = master.workspacePublicUrl.replace(/^\//u, "");
    const outputPath = path.join(appRoot, "public", relative);
    if (!fs.existsSync(outputPath)) throw new Error(`imagegen-master-output-missing:${anchor.eventId}`);
    const outputSha256 = sha256File(outputPath);
    const brief = (workspace.production.packagingStyleBriefs || []).find((item) => item.eventId === anchor.eventId);
    const styleBriefHash = brief?.styleBriefSha256 || null;
    const eventId = anchor.eventId;
    const candidateId = `${eventId}-imagegen-master-imported`;
    const jobIdentity = generationJobIdentity({projectId: workspace.production.project.projectId, eventId, slotId: "imagegen-master", mode: "generate"});
    const generationInput = generationInputHash({projectId: workspace.production.project.projectId, eventId, masterSourceSha256: master.sourceSha256, styleBriefSha256: styleBriefHash, editableTextSpecSha256: anchor.editableTextSpecSha256 || null, outputSha256});
    const provenance = {
      contract: "A1AssetGenerationProvenance/v1",
      sourceType: "operator-imported-imagegen-master",
      eventId,
      styleBriefHash,
      referenceInputs: (brief?.sourceReferences || []).map((reference) => ({id: reference.id, sourceSha256: reference.sourceSha256, adoptedTraits: reference.adoptedTraits})),
      provider: "codex-imagegen",
      providerMode: "subscription-zero-extra-cost",
      generationId: null,
      generationIdStatus: "missing",
      promptSha256: null,
      promptStatus: "missing",
      sourceSha256: master.sourceSha256,
      sourcePath: master.sourcePath || null,
      outputSha256,
      outputPublicUrl: master.workspacePublicUrl,
      timingStatus: "missing",
      startedAt: null,
      completedAt: null,
      wallClockMs: null,
      review: "PENDING_USER_REVIEW",
      generatedReadableText: master.generatedReadableText === true,
      importedAt: new Date().toISOString(),
    };
    const job = {
      contract: "A1AssetGenerationJob/v2",
      id: `imported-${candidateId}`,
      jobIdentity,
      generationInputHash: generationInput,
      variantNonce: null,
      targetKind: "visual-layer",
      projectId: workspace.production.project.projectId,
      sourceHash: workspace.article.sourceTextSha256,
      assetPackSha256: workspace.library.assetPackSha256,
      assetId: null,
      candidateId,
      briefId: eventId,
      briefHash: styleBriefHash,
      shotId: brief?.sourceBeatIds?.[0] || null,
      layerId: "packaging-anchor-master",
      mode: "generate",
      qualityTier: "final",
      direction: null,
      expectedText: null,
      route: "reference-conditioned-imagegen-import",
      provider: "codex-imagegen",
      providerMode: "subscription-zero-extra-cost",
      status: "complete",
      prompt: null,
      promptSha256: null,
      cacheKey: generationInput,
      attempts: Number(master.attempt || 1),
      cacheHit: false,
      imported: true,
      error: null,
      createdAt: provenance.importedAt,
      startedAt: null,
      completedAt: null,
      wallClockMs: null,
      durationMs: null,
      output: {publicUrl: master.workspacePublicUrl, sha256: outputSha256, sourceSha256: master.sourceSha256, outputKind: "imagegen-style-master"},
      provenance,
    };
    const existing = workspace.production.generation.jobs.find((item) => item.jobIdentity === jobIdentity && item.generationInputHash === generationInput && item.output?.sha256 === outputSha256);
    if (!existing) {
      workspace.production.generation.jobs.push(job);
      workspace.production.generation.provenanceRegistry.push(provenance);
      registered.push(eventId);
    }
  }
  workspace = recalculateEditorialAssetWorkbench(workspace);
  persistProjectState(appRoot, workspace, {files: {"reference-conditioned-anchor-provenance.json": {contract: "A1ReferenceConditionedAnchorProvenanceRegistry/v1", registeredEventIds: registered, jobCount: workspace.production.generation.jobs.filter((job) => job.imported).length, generatedAt: new Date().toISOString()}}});
  return {workspaceSha256: workspace.workspaceSha256, registered, importedJobCount: workspace.production.generation.jobs.filter((job) => job.imported).length, summary: workspace.production.generation.summary};
});

console.log(JSON.stringify(result, null, 2));
