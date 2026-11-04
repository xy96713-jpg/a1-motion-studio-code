#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildBoundedHistoryRetentionPlan, queryBoundedHistoryCollection} from "../apps/studio-next/src/lib/a1-bounded-history-retention-v1.mjs";

const CONTRACT = "A1BoundedHistoryCompactionDryRun/v1";
const appRoot = path.resolve("apps/studio-next");
const root = path.resolve(appRoot, "../..");
const {publicDir, artifactDir} = projectDirs(appRoot);
const workspacePath = path.join(publicDir, "workspace.json");
const artifactWorkspacePath = path.join(artifactDir, "workspace.json");
const receiptPath = path.join(publicDir, "transition-receipt.json");
const artifactReceiptPath = path.join(artifactDir, "transition-receipt.json");
const activeRunPath = path.join(publicDir, "active-run.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const outputDir = path.join(root, ".codex-artifacts/system-progress-system-line/bounded-history-compaction-v1");
const outputPath = path.join(outputDir, "dry-run.json");
const retentionPlanPath = path.join(outputDir, "retention-plan.json");
const historyIndexPath = path.join(outputDir, "history-index.json");
const chunkManifestPath = path.join(outputDir, "chunk-manifest.json");

const jsonBytes = (value) => Buffer.byteLength(JSON.stringify(value ?? null));
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const semanticSha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const isSha = (value) => /^[a-f0-9]{64}$/u.test(String(value || ""));
const isHistoryRecord = (entry) => entry && typeof entry === "object" && (
  entry.current === false
  || entry.historyReadOnly === true
  || entry.authorityScope === "HISTORY_READ_ONLY"
  || /HISTORY|REJECTED|SUPERSEDED|STALE|CANCELLED|FAILED/u.test(String(entry.status || entry.semanticDisposition || "").toUpperCase())
);

function boundedInventory(dir) {
  const files = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile()) {
        const stat = fs.statSync(file);
        files.push({relativePath: path.relative(dir, file), bytes: stat.size});
      }
    }
  }
  const mediaPattern = /\.(?:png|jpe?g|webp|gif|mp4|mov|m4v|webm|wav|mp3|m4a)$/iu;
  const historyPattern = /(?:^|[/_.-])(?:history|historical|rejected|legacy|superseded|stale)(?:[/_.-]|$)/iu;
  return {
    files,
    summary: {
      fileCount: files.length,
      bytes: files.reduce((sum, item) => sum + item.bytes, 0),
      mediaFileCount: files.filter((item) => mediaPattern.test(item.relativePath)).length,
      mediaBytes: files.filter((item) => mediaPattern.test(item.relativePath)).reduce((sum, item) => sum + item.bytes, 0),
      explicitHistoryFileCount: files.filter((item) => historyPattern.test(item.relativePath)).length,
      explicitHistoryBytes: files.filter((item) => historyPattern.test(item.relativePath)).reduce((sum, item) => sum + item.bytes, 0),
    },
  };
}

function collectReferencedArtifacts(value, result = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return result;
  seen.add(value);
  if (!Array.isArray(value)) {
    const directPath = value.publicUrl || value.assetUri || null;
    const directSha = value.sha256 || value.artifactSha256 || null;
    if (typeof directPath === "string" && directPath.startsWith("/generated/system-line/") && isSha(directSha)) result.push({publicUrl: directPath, sha256: directSha});
    for (const [key, item] of Object.entries(value)) {
      if (!key.endsWith("PublicUrl") || typeof item !== "string" || !item.startsWith("/generated/system-line/")) continue;
      const shaKey = `${key.slice(0, -"PublicUrl".length)}Sha256`;
      const candidateSha = value[shaKey];
      if (isSha(candidateSha)) result.push({publicUrl: item, sha256: candidateSha});
    }
  }
  for (const item of Array.isArray(value) ? value : Object.values(value)) collectReferencedArtifacts(item, result, seen);
  return result;
}

function arrayPressure(id, value) {
  const items = Array.isArray(value) ? value : [];
  const history = items.filter(isHistoryRecord);
  return {id, itemCount: items.length, jsonBytes: jsonBytes(items), historyCandidateCount: history.length, historyCandidateJsonBytes: jsonBytes(history)};
}

const workspace = readProjectWorkspace(appRoot);
const retention = buildBoundedHistoryRetentionPlan(workspace, {keepRecentFingerprints: 3, maxRecordsPerChunk: 100});
const defaultHistoryQueries = retention.plan.collections.map((collection) => queryBoundedHistoryCollection({
  compactedWorkspace: retention.compactedWorkspace,
  plan: retention.plan,
  chunks: [],
  collectionId: collection.id,
}));
const receipt = readJson(receiptPath);
const artifactReceipt = readJson(artifactReceiptPath);
const activeRun = readJson(activeRunPath);
const currentPhase = readJson(currentPhasePath);
const publicWorkspaceFileSha256 = fileSha256(workspacePath);
const artifactWorkspaceFileSha256 = fileSha256(artifactWorkspacePath);
const publicReceiptFileSha256 = fileSha256(receiptPath);
const artifactReceiptFileSha256 = fileSha256(artifactReceiptPath);
const publicInventory = boundedInventory(path.resolve(appRoot, "public/generated/system-line"));
const artifactInventory = boundedInventory(path.resolve(root, ".codex-artifacts/system-progress-system-line"));
const artifactByPath = new Map(artifactInventory.files.map((item) => [item.relativePath, item]));
const mirrorPairs = publicInventory.files.filter((item) => artifactByPath.get(item.relativePath)?.bytes === item.bytes);
const runtime = workspace.production?.shotIntelligence || {};
const jobs = workspace.production?.generation?.jobs || [];
const jobCounts = Object.fromEntries(["queued", "running", "complete", "failed", "stale", "cancelled"].map((status) => [status, jobs.filter((job) => job.status === status).length]));
const terminalJobs = jobs.filter((job) => !["queued", "running"].includes(job.status));
const referencedArtifacts = collectReferencedArtifacts(workspace);
const referencedBySha = new Map();
for (const reference of referencedArtifacts) {
  const list = referencedBySha.get(reference.sha256) || [];
  if (!list.some((item) => item.publicUrl === reference.publicUrl)) list.push(reference);
  referencedBySha.set(reference.sha256, list);
}
const immutableAliasGroups = [...referencedBySha.entries()].filter(([, references]) => references.length > 1).map(([sha256, references]) => ({sha256, referenceCount: references.length, publicUrls: references.map((item) => item.publicUrl)}));
const styleBriefShas = new Set((workspace.production?.packagingStyleBriefs || []).map((brief) => brief.styleBriefSha256));
const projection = workspace.production?.storyboardProductionProjection;
const unresolvedTasteBindings = (projection?.items || []).filter((item) => item.tasteBinding?.status === "TASTE_BOUND" && !styleBriefShas.has(item.tasteBinding.styleBriefSha256)).map((item) => item.shotId);
const pressure = [
  arrayPressure("production.generation.jobs", jobs),
  arrayPressure("production.packagingStyleBriefHistory", workspace.production?.packagingStyleBriefHistory),
  arrayPressure("production.shotIntelligence.lookMasterRawReferences", runtime.lookMasterRawReferences),
  arrayPressure("production.shotIntelligence.packageLookMasterPlanHistory", runtime.packageLookMasterPlanHistory),
  arrayPressure("production.shotIntelligence.packageAssetKitPlanHistory", runtime.packageAssetKitPlanHistory),
  arrayPressure("production.shotIntelligence.packageAssemblyRecipeHistory", runtime.packageAssemblyRecipeHistory),
  arrayPressure("production.shotIntelligence.researchPacketHistory", runtime.researchPacketHistory),
  arrayPressure("production.shotIntelligence.videoPackagingContextHistory", runtime.videoPackagingContextHistory),
  arrayPressure("production.shotIntelligence.wholeFilmStaticBoardHistory", runtime.wholeFilmStaticBoardHistory),
  arrayPressure("production.shotIntelligence.wholeFilmStaticBoardDecisionHistory", runtime.wholeFilmStaticBoardDecisionHistory),
  arrayPressure("production.library.assetRevisionHistory", (workspace.library?.assets || []).flatMap((asset) => asset.revisionHistory || [])),
].sort((a, b) => b.jsonBytes - a.jsonBytes);
const invariants = {
  publicArtifactWorkspaceMirrorExact: publicWorkspaceFileSha256 === artifactWorkspaceFileSha256,
  publicArtifactReceiptMirrorExact: publicReceiptFileSha256 === artifactReceiptFileSha256,
  receiptSemanticWorkspaceBound: receipt.workspaceSha256 === workspace.workspaceSha256,
  receiptWorkspaceFileBound: receipt.workspaceFileSha256 === publicWorkspaceFileSha256,
  receiptMirrorFieldsBound: ["workspaceSha256", "workspaceFileSha256", "transitionSha256"].every((key) => receipt[key] === artifactReceipt[key]),
  activeRunBound: activeRun.workspaceSha256 === workspace.workspaceSha256 && activeRun.workspaceFileSha256 === publicWorkspaceFileSha256 && activeRun.transitionSha256 === receipt.transitionSha256,
  currentPhaseBound: currentPhase.authority?.workspaceSha256 === workspace.workspaceSha256 && currentPhase.authority?.workspaceFileSha256 === publicWorkspaceFileSha256 && currentPhase.transitionSha256 === receipt.transitionSha256,
  currentTasteBindingsResolvable: unresolvedTasteBindings.length === 0,
  generationFrozen: workspace.production?.generation?.automaticDispatchAllowed === false && workspace.production?.generation?.workerStatus === "frozen" && jobCounts.queued === 0 && jobCounts.running === 0,
  userVisualApprovalUnchanged: workspace.production?.staticPackageReview?.userVisualApproval === "NOT_APPROVED",
  retentionExactJsonRoundTrip: retention.verification.exactJsonRoundTrip,
  retentionCollectionsResolvable: retention.verification.allCollectionsResolvable,
  retentionDefaultReadHotOnly: defaultHistoryQueries.every((query, index) => query.scope === "HOT_ONLY" && query.archiveRead === false && query.records.length === retention.plan.collections[index].hotCount),
  retentionSourceWorkspaceBound: retention.plan.sourceWorkspaceSha256 === workspace.workspaceSha256,
  retentionNoWorkspaceMutation: retention.plan.mutations.workspaceWritten === false && retention.plan.mutations.archiveWritten === false && retention.plan.mutations.filesDeleted === 0,
};
const failures = Object.entries(invariants).filter(([, pass]) => pass !== true).map(([id]) => id);
const reportBase = {
  contract: CONTRACT,
  status: failures.length ? "DRY_RUN_BLOCKED" : "DRY_RUN_PASS_NO_MUTATION",
  scope: "CURRENT_AUTHORITY_DEFAULT_READ_REDUCTION_AND_CONTENT_ADDRESSED_HISTORY_PLAN",
  authority: {
    workspaceSha256: workspace.workspaceSha256,
    workspaceFileSha256: publicWorkspaceFileSha256,
    transitionSha256: receipt.transitionSha256,
    storyboardRevisionSha256: projection?.storyboardRevisionSha256 || null,
    currentPhase: currentPhase.status,
    nextAction: currentPhase.authority?.nextAction?.id || null,
  },
  measurements: {
    workspaceBytes: fs.statSync(workspacePath).size,
    hotObjectJsonBytes: {
      shotIntelligence: jsonBytes(runtime),
      libraryAssets: jsonBytes(workspace.library?.assets || []),
      generationJobs: jsonBytes(jobs),
      packagingStyleBriefHistory: jsonBytes(workspace.production?.packagingStyleBriefHistory || []),
    },
    jobCounts: {...jobCounts, terminal: terminalJobs.length, total: jobs.length},
    pressure,
    boundedFilesystem: {
      public: publicInventory.summary,
      artifact: artifactInventory.summary,
      sameRelativePathSameSizeMirrorPairs: {fileCount: mirrorPairs.length, bytes: mirrorPairs.reduce((sum, item) => sum + item.bytes, 0), note: "Evidence mirrors are not classified as waste and are not deletion candidates."},
    },
    manifestReferencedImmutableAliasOpportunities: {groupCount: immutableAliasGroups.length, extraReferenceCount: immutableAliasGroups.reduce((sum, group) => sum + group.referenceCount - 1, 0), groups: immutableAliasGroups.slice(0, 100)},
    retentionProjection: {
      planSha256: retention.plan.planSha256,
      archiveIndexSha256: retention.plan.archiveIndexSha256,
      exactJsonRoundTrip: retention.verification.exactJsonRoundTrip,
      allCollectionsResolvable: retention.verification.allCollectionsResolvable,
      defaultArchiveRead: false,
      collectionCount: retention.plan.collections.length,
      chunkCount: retention.chunks.length,
      totals: retention.plan.totals,
      collections: retention.plan.collections.map((collection) => ({
        id: collection.id,
        assetId: collection.assetId,
        mode: collection.mode,
        sourceCount: collection.sourceCount,
        hotCount: collection.hotCount,
        coldCount: collection.coldCount,
        sourceJsonBytes: collection.sourceJsonBytes,
        hotJsonBytes: collection.hotJsonBytes,
        coldJsonBytes: collection.coldJsonBytes,
        sourceSha256: collection.sourceSha256,
        hotSha256: collection.hotSha256,
        chunkCount: collection.chunkSha256s.length,
      })),
    },
  },
  proposedColdLayer: {
    workspaceHotPolicy: "Keep current wave, current authority, current projection, active jobs, latest terminal summaries, current plus last rejected plus approved evidence, and last three approval fingerprints per shot.",
    historyPolicy: "Move complete historical objects to append-only content-addressed chunks with a hash-bound index; default bootstrap and execution-status never read chunks.",
    jobPolicy: "Group by logical production target; keep queued/running, latest terminal and latest successful output hot; move older complete/stale/cancelled/failed records to an archived-job ledger.",
    mediaPolicy: "Official generation workers write to staging, admit by content SHA, then expose immutable blobs through verified stable-path aliases; existing media is not converted by this dry-run.",
    retentionPolicy: "Per shot retain current, last rejected and approved evidence hot; older records become HISTORY_READ_ONLY pointers.",
  },
  migrationGates: [
    "CAS expected workspace SHA must match under the existing project lock.",
    "Workspace and transition receipt public/artifact mirrors must remain byte-identical.",
    "Active-run, current-phase, bootstrap revision and transition SHA must be one atomic commit.",
    "Every current manifest, style brief, semantic decision, candidate lineage and provenance pointer must resolve before and after migration.",
    "Checkpoint recovery must reconstruct the same current authority without reading cold chunks unless an explicit history query is made.",
    "No media deletion, move or hard-link conversion is allowed until a second apply-plan report lists exact paths and recovery strategy for user approval.",
  ],
  invariants,
  unresolvedTasteBindings,
  failures,
  mutations: {workspaceWritten: false, transitionWritten: false, mediaGenerated: false, filesMoved: 0, filesDeleted: 0, linksCreated: 0, userVisualApprovalChanged: false},
  generatedAt: new Date().toISOString(),
};
const report = {...reportBase, reportSha256: semanticSha256(reportBase)};
fs.mkdirSync(outputDir, {recursive: true});
const writeJsonAtomic = (file, value) => {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
};
writeJsonAtomic(retentionPlanPath, retention.plan);
writeJsonAtomic(historyIndexPath, retention.archiveIndex);
writeJsonAtomic(chunkManifestPath, {
  contract: "A1HistoryArchiveChunkManifest/v1",
  status: "DRY_RUN_PAYLOADS_NOT_WRITTEN",
  archiveIndexSha256: retention.archiveIndex.indexSha256,
  chunkCount: retention.chunks.length,
  chunks: retention.chunks.map(({payload, ...chunk}) => chunk),
  payloadsWritten: false,
  filesDeleted: 0,
});
writeJsonAtomic(outputPath, report);
if (failures.length) throw new Error(`bounded-history-compaction-dry-run-blocked:${failures.join(",")}`);
console.log(JSON.stringify({status: report.status, contract: report.contract, reportPath: path.relative(root, outputPath), reportSha256: report.reportSha256, retentionPlanSha256: retention.plan.planSha256, archiveIndexSha256: retention.archiveIndex.indexSha256, workspaceBytes: report.measurements.workspaceBytes, projectedWorkspaceBytes: retention.plan.totals.projectedCompactedWorkspacePersistedBytes, projectedWorkspaceReductionRatio: retention.plan.totals.projectedWorkspaceReductionRatio, hotRecords: retention.plan.totals.hotRecordCount, coldRecords: retention.plan.totals.coldRecordCount, exactJsonRoundTrip: retention.verification.exactJsonRoundTrip, immutableAliasGroups: immutableAliasGroups.length, filesMoved: 0, filesDeleted: 0}, null, 2));
