#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES, compileAnchorBoundGeneration} from "../apps/studio-next/src/lib/a1-golden-look-anchor-registry-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_CODEX_IMAGEGEN_PROVIDER, A1_GENERATOR_LANES, buildRequiredViewport, compileGenerationJobV2, preflightGenerationJobV2, sha256} from "../apps/studio-next/src/lib/a1-isolated-imagegen-generation-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const isolatedRoot = path.join(artifactDir, "isolated-imagegen-v2");
const repairManifestPath = path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json");
const referenceManifestPath = path.join(publicRoot, "generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const writeJob = process.argv.includes("--write-job");
const now = new Date().toISOString();

const publicFile = (publicUrl) => {
  const target = path.resolve(publicRoot, String(publicUrl || "").replace(/^\//u, ""));
  if (!target.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("isolated-imagegen-public-path-invalid");
  return target;
};
const writeJsonAtomic = (target, value) => {
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, bytes, "utf8");
  fs.renameSync(temporary, target);
  return sha256(bytes);
};

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const runtime = workspace.production.shotIntelligence;
const registry = workspace.production.goldenLookAnchorRegistry;
const repairManifest = JSON.parse(fs.readFileSync(repairManifestPath, "utf8"));
const canaryEntry = repairManifest.entries.find((entry) => entry.shotId === "ED-20");
if (!canaryEntry) throw new Error("isolated-imagegen-ed20-repair-entry-missing");
if (!["ANCHOR_REBASE_REQUIRED", "ANCHOR_APPROVED_PREFLIGHT_REQUIRED"].includes(canaryEntry.status)) throw new Error(`isolated-imagegen-ed20-anchor-state-required:${canaryEntry.status}`);
if (canaryEntry.primitiveId !== A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY || canaryEntry.generationAllowed === true) throw new Error("isolated-imagegen-ed20-anchor-rebase-not-frozen");

const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-20");
const styleBrief = workspace.production.packagingStyleBriefs.find((item) => item.sourceBeatIds?.includes("ED-20"));
if (!plan || !styleBrief || styleBrief.styleBriefSha256 !== plan.styleBriefSha256) throw new Error("isolated-imagegen-ed20-plan-style-binding-missing");
const selectedAnchorId = registry?.selection?.selectedAnchorIds?.[0] || null;
const anchored = compileAnchorBoundGeneration({
  registry,
  publicRoot,
  anchorId: selectedAnchorId,
  allowedUse: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY,
  assemblyMode: "OVERLAY",
  primitiveId: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY,
  videoContext: plan.videoContext,
  semanticPrompt: "Use at most two unequal pixel semantic windows to express 整理材料、明确约束、继续编辑、收稿 as one human editorial progression. Keep the real presenter and camera composition fixed. No four-card workflow, arrows, UI, machinery, fictional room, or fullscreen takeover.",
});
if (anchored.status !== "PASS") throw new Error(`isolated-imagegen-ed20-anchor-preflight-${anchored.status.toLowerCase()}:${anchored.failures.join(",")}`);

const referenceManifest = JSON.parse(fs.readFileSync(referenceManifestPath, "utf8"));
const selectedReferences = styleBrief.sourceReferences.map((binding) => {
  const source = referenceManifest.sources.find((item) => item.id === binding.id);
  if (!source || source.sha256 !== binding.sourceSha256 || !source.publicUrl) throw new Error(`isolated-imagegen-reference-binding-invalid:${binding.id}`);
  return {...binding, ...source, localPath: publicFile(source.publicUrl)};
});
const anchorPath = publicFile(anchored.anchorBinding.projectLocalUrl);
const exactText = "整理材料 / 明确约束 / 继续编辑 / 收稿";
const sourceRevisionHash = sha256({sourceRevisionHash: plan.canonicalStaticBoardInput?.sourceRevisionHash, registrySha256: registry.registrySha256, anchorSha256: anchored.anchorBinding.contentSha256, route: "ED20_PIXEL_WINDOW_OVERLAY"});
const job = preflightGenerationJobV2(compileGenerationJobV2({
  shotId: "ED-20",
  sourceRevisionHash,
  brief: {
    planSha256: plan.planSha256,
    styleBriefSha256: styleBrief.styleBriefSha256,
    referencePackId: styleBrief.referencePackId,
    goldenAnchorBinding: anchored.anchorBinding,
    productionPrimitive: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY,
    surfaceLogic: "local-pixel-grid-only-with-one-or-two-unequal-semantic-windows",
    paletteText: "cool white, cool gray, or charcoal base; one structural color and one semantic accent only",
    negativeStyleConstraints: ["no yellow paper or sepia default", "no full CRT world", "no fictional editor room", "no four-card workflow", "no arrows", "no UI", "no machinery", "no presenter relocation"],
  },
  semanticPayload: {semanticAction: "A human clarifies material and constraints, continues editing, and submits the draft.", semanticActor: "REAL_PRESENTER_WITH_LOCAL_PIXEL_WINDOWS", topology: "ONE_OR_TWO_UNEQUAL_WINDOWS_IN_VERIFIED_NEGATIVE_SPACE", typographyVisualRole: "SUPPORT_KEYWORD", protectedPhrases: ["整理材料", "明确约束", "继续编辑", "收稿"]},
  primitiveId: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY,
  presentationMode: "OVERLAY",
  exactText,
  referencePaths: [anchorPath, ...selectedReferences.map((item) => item.localPath)],
  referenceSha256s: [anchored.anchorBinding.contentSha256, ...selectedReferences.map((item) => item.sha256)],
  holdFramePath: publicFile(plan.videoContext.baseFrame.publicUrl),
  holdFrameSha256: plan.videoContext.baseFrame.sha256,
  styleVersion: `${styleBrief.referencePackId}:${styleBrief.styleBriefSha256}:${registry.registrySha256}`,
  requiredViewport: buildRequiredViewport({typographySafeInset: 0.12}),
  generatorLane: A1_GENERATOR_LANES.PRESENTER_HOLD_FRAME,
  provider: A1_CODEX_IMAGEGEN_PROVIDER,
  attempt: 1,
  retryOfJobId: null,
  retryReasonCodes: [],
  retryInputArtifactSha: null,
  createdAt: now,
  prompt: `${anchored.prompt}\nEXACT VISIBLE TEXT GROUPS ONLY: ${exactText}`,
}));
if (job.status !== "READY") throw new Error(`isolated-imagegen-ed20-generation-preflight-blocked:${job.preflight.failures.join(",")}`);

const jobPath = path.join(isolatedRoot, "jobs", `${job.jobId}.json`);
const existing = fs.existsSync(jobPath) ? JSON.parse(fs.readFileSync(jobPath, "utf8")) : null;
if (existing && existing.generationKey !== job.generationKey) throw new Error("isolated-imagegen-canary-content-address-collision");
let receiptSha256 = existing ? sha256(`${JSON.stringify(existing, null, 2)}\n`) : null;
if (writeJob && !existing) receiptSha256 = writeJsonAtomic(jobPath, job);
const report = {
  contract: "A1IsolatedImagegenCanaryPrepareReport/v2",
  status: "PASS",
  mode: writeJob ? "WRITE_JOB" : "DRY_RUN",
  selectedShotId: "ED-20",
  registrySha256: registry.registrySha256,
  anchorBinding: anchored.anchorBinding,
  primitiveId: A1_GOLDEN_LOOK_PRODUCTION_PRIMITIVES.OVERLAY,
  job,
  jobPath: writeJob ? jobPath : null,
  jobReceiptSha256: receiptSha256,
  workspaceSha256: workspace.workspaceSha256,
  boardSha256: runtime.wholeFilmStaticBoard.sha256,
  imageGenCalled: false,
  workspaceWritten: false,
  boardRebuilt: false,
};
if (writeJob) writeJsonAtomic(path.join(isolatedRoot, "canary-prepare-report.json"), report);
console.log(JSON.stringify(report, null, 2));
