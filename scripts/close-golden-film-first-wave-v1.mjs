#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {persistGoldenFilmVisualSystemMaturityRun} from "./run-golden-film-visual-system-maturity-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const runPath = path.join(publicDir, "golden-film-visual-system-maturity-v1", "maturity-run.json");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const result = withProjectLock(appRoot, () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const run = readJson(runPath);
  const maturityRunSha256 = run.maturityRunSha256;
  const jobs = before.production.generation.jobs.filter((job) => job.goldenFilmMaturityRunSha256 === maturityRunSha256 && job.status === "complete" && job.output?.sha256);
  if (jobs.length !== 4 || new Set(jobs.map((job) => job.shotId)).size !== 2) throw new Error(`golden-film-first-wave-complete-job-count-invalid:${jobs.length}`);
  if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("golden-film-first-wave-close-requires-frozen-idle-runtime");
  const generatedShas = jobs.map((job) => job.output.sha256);
  const jobBySha = new Map(jobs.map((job) => [job.output.sha256, job]));
  const next = structuredClone(before);
  next.production.shotIntelligence.lookMasterRawReferences = (next.production.shotIntelligence.lookMasterRawReferences || []).map((raw) => {
    const job = jobBySha.get(raw.artifact?.sha256);
    if (!job) return raw;
    return {
      ...raw,
      status: "VISUAL_REJECTED",
      selectionEligible: false,
      candidateAdmissionRequired: true,
      goldenFilmMaturityRejection: {
        contract: "A1GoldenFilmMaturityCandidateRejection/v1",
        status: "REJECTED",
        maturityRunSha256,
        reasonCodes: ["GENERATION_PROMPT_EXACT_COPY_UNDEFINED", ...(job.shotId === "ED-15" ? ["ED15_DUAL_GAP_PROMPT_NOT_COMPLETE"] : [])],
        evidence: "The completed job prompt contained EXACT SOURCE COPY: undefined; the output is retained as immutable audit history and cannot enter current binding.",
        immutableArtifactSha256: raw.artifact.sha256,
        nextAction: "DISPATCH_ONE_BOUNDED_PROMPT_REPAIR_WAVE_MAX_2",
        createdAt: new Date().toISOString(),
      },
      note: "Maturity wave candidate rejected before admission: generated against stale prompt contract with undefined exact copy. Artifact retained; no OCR or semantic approval is implied.",
    };
  });
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, new Date().toISOString()));
  const committed = persistProjectState(appRoot, recalculated, {expectedWorkspaceSha256: before.workspaceSha256});
  const nextRun = structuredClone(run);
  nextRun.generatedAt = new Date().toISOString();
  nextRun.phases.PHASE_3 = {
    ...nextRun.phases.PHASE_3,
    status: "REJECTED_PROMPT_PREFLIGHT",
    generationAllowed: false,
    generationDispatched: true,
    targetShotIds: ["ED-15", "ED-16"],
    queuedJobIds: jobs.map((job) => job.id),
    newGeneratedShas: generatedShas,
    newGeneratedCount: generatedShas.length,
    failureReasons: [...new Set(jobs.flatMap((job) => ["GENERATION_PROMPT_EXACT_COPY_UNDEFINED", ...(job.shotId === "ED-15" ? ["ED15_DUAL_GAP_PROMPT_NOT_COMPLETE"] : [])]))],
    nextAction: "DISPATCH_ONE_BOUNDED_PROMPT_REPAIR_WAVE_MAX_2",
  };
  nextRun.phases.PHASE_4 = {
    ...nextRun.phases.PHASE_4,
    status: "BLOCKED",
    boardRebuilt: false,
    failureReasons: ["PHASE_3_CANDIDATES_REJECTED_PROMPT_PREFLIGHT"],
    nextAction: "DISPATCH_ONE_BOUNDED_PROMPT_REPAIR_WAVE_MAX_2",
  };
  nextRun.overallStatus = "GENERATION_COMPLETE_REJECTED";
  nextRun.nextAction = "DISPATCH_ONE_BOUNDED_PROMPT_REPAIR_WAVE_MAX_2";
  nextRun.runtimeFreeze = {...nextRun.runtimeFreeze, queue: 0, running: 0, workerStatus: "frozen", assemblyCount: 0, assemblyCreationAllowed: false};
  nextRun.imageLedger = {...nextRun.imageLedger, generationDispatched: true, newGeneratedShas: generatedShas, newGeneratedCount: generatedShas.length, goodPngShaChanged: false};
  nextRun.maturityRunSha256 = sha256({...nextRun, maturityRunSha256: undefined});
  persistGoldenFilmVisualSystemMaturityRun(nextRun);
  return {workspaceSha256: committed.workspaceSha256, run: nextRun, generatedShas};
});

console.log(JSON.stringify({status: "PASS", ...result, rejected: result.generatedShas.length, nextAction: result.run.nextAction}, null, 2));
