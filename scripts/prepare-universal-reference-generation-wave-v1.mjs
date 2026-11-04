#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {normalizeUniversalReferenceInputs} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const waveRelativePath = "golden-film-visual-system-maturity-v1/universal-reference-generation-wave-v1/manifest.json";
const targetShotIds = ["ED-08", "ED-13", "ED-14", "ED-19", "ED-31"];
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicPath = (url) => path.resolve(publicRoot, String(url || "").replace(/^\//u, ""));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function dedupeReferences(inputs) {
  const seen = new Set();
  return inputs.filter(Boolean).filter((item) => {
    const key = `${item.sourcePath}:${item.sourceSha256}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((item, index) => ({...item, generationAttachmentIndex: index}));
}

function refFromBase(plan) {
  return {
    id: `${plan.shotId.toLowerCase()}-real-hold-frame`,
    sourcePath: publicPath(plan.videoContext.baseFrame.publicUrl),
    sourceSha256: plan.videoContext.baseFrame.sha256,
    sourceType: "REAL_HOLD_FRAME",
    semanticRole: "real-hold-frame-composition-anchor",
    transformPolicy: "PIXEL_EXACT_RESTORE",
    role: "real-hold-frame-composition-anchor",
  };
}

function refFromEvidence(item) {
  return {
    id: item.id,
    sourcePath: publicPath(item.publicUrl),
    sourceSha256: item.sha256,
    sourceType: "RESEARCH_EVIDENCE",
    semanticRole: "official-article-title-and-abstract-evidence-window",
    transformPolicy: "EVIDENCE_WINDOW",
    role: "real-research-evidence",
  };
}

function promptFor(shotId, variant, plan) {
  const common = `Use case: stylized-concept.\nAsset type: complete 16:9 editorial video Look Master, not a layer or overlay.\nInput images: ${shotId === "ED-19" ? "none; explicit NO_REFERENCE_GENERATIVE decision" : "all listed reference images are actual multimodal inputs; preserve their declared roles and source identity"}.\nColor palette: cool white, charcoal, black, low-saturation blue, controlled cobalt blue; no warm yellow, cream, beige or sepia dominant field.\nTypography: typography is a visual actor inside the whole composition, never CSS, a subtitle, sticker, corner card or post-composited panel.\nConstraints: one primary visual action, one reading path, at most two dominant masses, quiet field preserved, no debug words, no filler, no fake UI, no fake citation, no logos, no thick CRT frame, no card wall, no checkerboard, no local CSS design.\nVariant: ${variant}.\n`;
  if (shotId === "ED-08") return `${common}Primary request: design the entire frame around the real presenter hold frame. Keep the exact presenter position, face, body, microphone and negative space as composition anchors; the generated presenter is only a preview and original pixels will later be restored. Preserve a behind-subject depth relationship. Make the exact Chinese visual actor “AI 常常不说人话” large and unmistakable, with one semantic action: a coherent language stream enters and becomes subtly distorted/unreadable behind the presenter. Use cool gray/charcoal field and one cobalt signal. No dialogue bubble, no tiny sticker, no extra readable words.`;
  if (shotId === "ED-13") return `${common}Primary request: use the real presenter hold frame as a geometry and identity anchor while making a light, integrated editorial explainer. Preserve the presenter and negative space in the complete composition; the original presenter pixels will later be restored. Show one clean causal contrast: smoother Chinese expression is a surface improvement, but the root problem remains unresolved. The exact Chinese visual actors are “国产模型写中文确实会顺一些” and “问题也并没有彻底解决”. Use cool white/charcoal/cobalt pixel-editorial language, restrained flat materials, no torn-paper social-media collage, no panel stack, no extra text.`;
  if (shotId === "ED-14") return `${common}Primary request: build a source-bound research explainer around the attached official article title/abstract capture and the attached real hold frame. Keep the evidence screenshot's source identity and readable title/abstract region; do not redraw a fake paper, author, citation or website. The visual mechanism is one narrowing path from varied sentence structures toward lower syntactic and lexical diversity. Use the exact Chinese semantic actors “句法多样性下降” and “词汇多样性下降” only when shown; do not claim “默认路径” or “高频安全表达”. Evidence window and typography must be one unified composition. Variant uses ${variant}. No invented source labels.`;
  if (shotId === "ED-19") return `${common}Primary request: create a complete cold editorial typography takeover for the abstract operation sequence “整理→编排→读取→检查”. Treat the four exact Chinese words “整理”, “编排”, “读取”, “检查” as one directional reading path with one visual action: a clean editorial track is organized, routed, read and finally checked. Use neutral white, charcoal and cobalt only, with at most one tiny magenta correction signal. Replace the old empty gray/magenta field with structural pixel-editorial material. No presenter, no external reference, no source identity, no fake UI, no extra readable words.`;
  return `${common}Primary request: design the complete frame around the real presenter hold frame. Preserve exact presenter identity, body, microphone and negative space; the original presenter pixels will later be restored. Build one full-width controlled workflow track behind and around the presenter, showing the idea of turning real writing inconveniences into a controllable workflow. Use the exact Chinese visual actor “可控的工作流” and at most the short process words “整理”, “编排”, “读取”, “检查”. Variant uses ${variant}. Use cool white/charcoal/cobalt with one controlled process accent, no small tool stickers, no generic dashboard, no card grid.`;
}

async function validateReference(reference) {
  if (!fs.existsSync(reference.sourcePath)) throw new Error(`wave-reference-missing:${reference.id}`);
  const bytes = fs.readFileSync(reference.sourcePath);
  const actualSha = sha256(bytes);
  if (actualSha !== reference.sourceSha256) throw new Error(`wave-reference-sha-mismatch:${reference.id}`);
  const metadata = await sharp(reference.sourcePath).metadata();
  if (!metadata.format || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) throw new Error(`wave-reference-decode-invalid:${reference.id}`);
  return {id: reference.id, sourcePath: reference.sourcePath, sourceSha256: reference.sourceSha256, sourceType: reference.sourceType, semanticRole: reference.semanticRole || reference.role || reference.id, transformPolicy: reference.transformPolicy, width: metadata.width, height: metadata.height, format: metadata.format};
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("wave-preflight-requires-idle-frozen-queue");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("wave-preflight-assembly-forbidden");
  const migrationPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/golden-film-visual-system-maturity-v1/universal-reference-packaging-migration.json");
  const migration = readJson(migrationPath);
  if (migration.status !== "CURRENT_UNIVERSAL_REFERENCE_MIGRATION_BLOCKED") throw new Error(`wave-preflight-migration-status-invalid:${migration.status}`);
  const plans = new Map(current.production.shotIntelligence.packageLookMasterPlans.filter((plan) => targetShotIds.includes(plan.shotId)).map((plan) => [plan.shotId, plan]));
  if (plans.size !== targetShotIds.length) throw new Error("wave-preflight-plan-count-invalid");
  const jobs = [];
  const shotPreflight = [];
  for (const shotId of targetShotIds) {
    const plan = plans.get(shotId);
    const entry = migration.entries.find((item) => item.shotId === shotId);
    const refs = shotId === "ED-19"
      ? []
      : dedupeReferences([
        refFromBase(plan),
        ...(plan.sourceEvidenceInputs || []).map(refFromEvidence),
        ...(plan.referenceInputs || []).map((item) => ({...item, sourcePath: item.sourcePath, sourceSha256: item.sourceSha256, sourceType: item.sourceType, semanticRole: item.semanticRole, transformPolicy: item.transformPolicy})),
      ]);
    const normalized = refs.length ? normalizeUniversalReferenceInputs(refs) : [];
    const validatedRefs = [];
    for (const ref of normalized) validatedRefs.push(await validateReference(ref));
    const primaryAttachmentReady = shotId === "ED-19" || validatedRefs.some((ref) => ref.sourceType === "REAL_HOLD_FRAME") && (shotId !== "ED-14" || validatedRefs.some((ref) => ref.sourceType === "RESEARCH_EVIDENCE"));
    if (!primaryAttachmentReady) throw new Error(`wave-preflight-primary-attachment-missing:${shotId}`);
    const directions = plan.candidateDirections.slice(0, 2);
    const candidateJobs = directions.map((direction, index) => {
      const prompt = promptFor(shotId, direction.primitiveId || direction.directionId || `variant-${index + 1}`, plan);
      const promptSha256 = sha256(prompt);
      const jobId = `look-master-wave-v1-${shotId.toLowerCase()}-c${index + 1}-${promptSha256.slice(0, 12)}`;
      const outputRelativePath = `generated/system-line/editorial-asset-workbench-v1/look-master-wave-v1/${shotId}/${jobId}.png`;
      const generationInputHash = sha256({contract: "A1UniversalReferenceGenerationWave/v1", shotId, candidateIndex: index + 1, planSha256: plan.planSha256, directionId: direction.directionId, directionFingerprint: direction.fingerprint, referenceDecision: entry.referenceDecision, referenceSourceSha256s: normalized.map((ref) => ref.sourceSha256), promptSha256});
      return {jobId, shotId, candidateIndex: index + 1, directionId: direction.directionId, directionFingerprint: direction.fingerprint, planSha256: plan.planSha256, prompt, promptSha256, generationInputHash, outputRelativePath, referenceDecision: entry.referenceDecision, references: validatedRefs, actualImagegenAttachmentEvidence: {status: "READY_TO_ATTACH", attachmentCount: validatedRefs.length, sourceSha256s: validatedRefs.map((ref) => ref.sourceSha256), attachments: validatedRefs.map((ref, attachmentIndex) => ({...ref, generationAttachmentIndex: attachmentIndex, attachedToInitialPrompt: false}))}};
    });
    jobs.push(...candidateJobs);
    shotPreflight.push({shotId, referenceDecision: entry.referenceDecision, attachmentReady: true, attachmentCount: validatedRefs.length, attachmentSourceSha256s: validatedRefs.map((ref) => ref.sourceSha256), candidateJobIds: candidateJobs.map((job) => job.jobId)});
  }
  const waveBase = {contract: "A1UniversalReferenceGenerationWave/v1", status: "PREFLIGHT_PASS_READY_FOR_MANUAL_IMAGEGEN", current: true, targetShotIds, candidateCount: jobs.length, concurrencyHardMax: 2, noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true, preflight: {status: "PASS", requiredReferenceShotCount: 4, attachmentReadyShotIds: ["ED-08", "ED-13", "ED-14", "ED-31"], attachmentReadyCount: 4, ed19NoReferenceGenerative: true}, jobs, shotPreflight, generatedCount: 0, adoptedCount: 0, rejectedCount: 0, workerStatus: "ready-for-manual-imagegen", generatedAt: now};
  const wave = {...waveBase, manifestSha256: sha256(waveBase)};
  const committed = persistProjectState(appRoot, current, {files: {[waveRelativePath]: wave}});
  return {status: wave.status, manifestSha256: wave.manifestSha256, workspaceSha256: committed.workspaceSha256, targetShotIds, jobCount: jobs.length, attachmentReadyCount: wave.preflight.attachmentReadyCount, noReferenceGenerativeShotIds: ["ED-19"], queue: {queued: 0, running: 0, workerStatus: "ready-for-manual-imagegen"}, jobs: jobs.map((job) => ({jobId: job.jobId, shotId: job.shotId, candidateIndex: job.candidateIndex, outputRelativePath: job.outputRelativePath, referenceCount: job.references.length, sourceSha256s: job.references.map((ref) => ref.sourceSha256)}))};
});

console.log(JSON.stringify(result, null, 2));
