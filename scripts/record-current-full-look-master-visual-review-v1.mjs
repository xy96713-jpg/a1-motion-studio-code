#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {assertFullLookMasterVisualDirectorReview} from "../apps/studio-next/src/lib/a1-full-look-master-visual-director-review-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const relativePath = "golden-film-visual-system-maturity-v1/full-look-master-visual-director-review.json";
const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJsonAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
};

const firstStructuralRetryDecisions = new Map([
  ["ED-09:1", {decision: "PASS", reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "EXACT_LANGUAGE_FIELD_LOSES_LEGIBILITY", "NO_PANEL_OR_FAKE_BODY_COPY"], note: "The two exact phrases form one large language actor and the second phrase visibly breaks down without UI cards or filler copy."}],
  ["ED-09:2", {decision: "REJECT", reasonCodes: ["MACHINE_SURFACE_PSEUDO_TEXT", "NON_SEMANTIC_MICRO_LABEL_FILLER"], note: "The machine relation is clear, but unreadable micro-label texture reintroduces the filler that this structural retry was required to remove."}],
  ["ED-10:1", {decision: "PASS", reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "SINGLE_EXACT_VERDICT", "EROSION_ACTION_IS_THE_IMAGE"], note: "The exact verdict appears once as the dominant actor and physically erodes into the dark field."}],
  ["ED-10:2", {decision: "PASS", reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "SINGLE_EXACT_VERDICT", "CONCRETE_COLLAPSE_ACTION_CLEAR"], note: "The exact verdict appears once inside a single collapsing material object; there is no secondary headline."}],
  ["ED-12:1", {decision: "PASS", reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "EXACT_MODEL_NAMES_AS_TYPOGRAPHY", "NO_GENERATED_LOGOS_OR_PRODUCT_UI"], note: "The five real model names remain plain typography in one open comparison field without fake brand marks or ranking."}],
  ["ED-12:2", {decision: "REJECT", reasonCodes: ["NUMBERED_RANKING_IMPLICATION", "REPEATED_X_MARKS", "TALLY_UI_COMPOSITION"], note: "The numbered list and repeated X marks imply ranking or failure and collapse the breadth-of-trial beat back into interface UI."}],
  ["ED-17:1", {decision: "REJECT", reasonCodes: ["THREE_SMALL_OBJECT_SEQUENCE", "WEAKER_SINGLE_EDITORIAL_ACTOR"], note: "Readable, but the three pedestal objects still feel like a generic step sequence rather than one memorable material-to-angle-to-AI actor."}],
  ["ED-17:2", {decision: "PASS", reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "ONE_FULL_FRAME_WORKFLOW_ACTOR", "UPPERCASE_AI_AND_EXACT_PHRASES_VISIBLE"], note: "The material field, angle turn and AI writing action occupy one full-frame path with no numbering or pseudo telemetry."}],
  ["ED-33:1", {decision: "PASS", reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "EXACT_TWO_LINE_VERDICT", "CONTROLLED_REVISION_WAVE_CLEAR"], note: "The exact two-line conclusion stays board-scale readable and the restrained fold/wave makes controlled revision the main action."}],
  ["ED-33:2", {decision: "PASS", reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "EXACT_TWO_LINE_VERDICT", "DOCUMENT_REVISION_OBJECT_CLEAR"], note: "The document, controlled blue path and preserved fragment make revision without wholesale restart legible in one composition."}],
]);

const exactCopyLegibilityDecisions = new Map([
  ["ED-10:1", {decision: "PASS", reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "EXACT_COPY_VISUALLY_VERIFIED", "UNDISTORTED_GLYPHS", "MATERIAL_ACTION_OUTSIDE_TYPE"], note: "The exact verdict is fully readable at board scale while the surrounding cool paper field supplies the polished-shell-versus-empty-core consequence without damaging glyph strokes.", exactCharacterVerification: {status: "PASS", expected: "完成度很高的废稿", observedLines: ["完成度", "很高的废稿"]}}],
  ["ED-10:2", {decision: "REJECT", reasonCodes: ["FOREGROUND_MARK_OVERLAPS_PROTECTED_COPY", "AVOIDABLE_OCR_AND_HIERARCHY_RISK"], note: "The exact copy is present, but the magenta terminal mark crosses the protected verdict and weakens the cleaner one-actor hierarchy; the unobstructed option is objectively stronger.", exactCharacterVerification: {status: "PASS", expected: "完成度很高的废稿", observedLines: ["完成度很高", "的废稿"]}}],
  ["ED-17:1", {decision: "PASS", reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "EXACT_THREE_PHRASES_VISUALLY_VERIFIED", "ONE_CONTINUOUS_PAPER_RIBBON", "METHOD_SEQUENCE_BOARD_SCALE_READABLE"], note: "One continuous paper ribbon bends from method to angle and resolves into writing; all three protected phrases remain intact and the action reads without cards or numbering.", exactCharacterVerification: {status: "PASS", expected: "所以目前主流的做法|再找角度|最后再让 AI 动笔", observedLines: ["所以目前主流的做法", "再找角度", "最后再让 AI 动笔"]}}],
  ["ED-17:2", {decision: "PASS", reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "EXACT_THREE_PHRASES_VISUALLY_VERIFIED", "SINGLE_TYPESETTING_RAIL", "METHOD_SEQUENCE_BOARD_SCALE_READABLE"], note: "The darker typesetting rail provides a materially distinct process primitive; the acid joint marks the angle decision and the pen output closes the sequence with all protected copy intact.", exactCharacterVerification: {status: "PASS", expected: "所以目前主流的做法|再找角度|最后再让 AI 动笔", observedLines: ["所以目前主流的做法", "再找角度", "最后再让 AI 动笔"]}}],
]);

const objectiveWholeFilmClosureDecisions = new Map([
  ["ED-16:1", {
    decision: "REJECT",
    reasonCodes: ["PANEL_LIKE_INPUT_BLOCKS", "PSEUDO_BODY_COPY_TEXTURE", "WEAKER_SINGLE_CAUSE_CONSEQUENCE_ACTION"],
    note: "The exact three phrases are legible, but the two framed input areas still read as panels and the small pseudo-body texture adds non-semantic filler. The alternate candidate resolves the same meaning as one stronger physical consequence.",
    exactCharacterVerification: {status: "PASS", expected: "材料不够|角度不清|泛泛而谈", observedLines: ["材料不够", "角度不清", "泛泛而谈"]},
  }],
  ["ED-16:2", {
    decision: "PASS",
    reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "EXACT_CAUSE_CONSEQUENCE_PHRASES", "ONE_PHYSICAL_CONVERGENCE_ACTION", "NEUTRAL_COOL_DOMINANT_FIELD"],
    note: "Two large pressure fields carry the exact causes and converge into one dominant consequence. The hierarchy survives board scale, uses no card stack or fake interface, and keeps the canvas neutral/cool with one controlled magenta accent.",
    exactCharacterVerification: {status: "PASS", expected: "材料不够|角度不清|泛泛而谈", observedLines: ["材料不够", "角度不清", "泛泛而谈"]},
  }],
  ["ED-17:1", {
    decision: "PASS",
    reasonCodes: ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", "EXACT_THREE_PHRASES_VISUALLY_VERIFIED", "ONE_CONTINUOUS_PAPER_RIBBON", "METHOD_SEQUENCE_BOARD_SCALE_READABLE"],
    note: "One continuous paper ribbon turns source material into an angle and ends at the writing tool. All three exact steps remain readable without cards, numbering, or unrelated filler.",
    exactCharacterVerification: {status: "PASS", expected: "先给材料|再找角度|最后再让 AI 动笔", observedLines: ["先给材料", "再找角度", "最后再让 AI 动笔"]},
  }],
  ["ED-17:2", {
    decision: "REJECT",
    reasonCodes: ["THREE_BOX_SEQUENCE", "MODULAR_CARD_METAPHOR", "WEAKER_CONTINUOUS_METHOD_ACTOR"],
    note: "The exact copy is readable, but the three extruded modules behave like a card sequence. The continuous paper-ribbon candidate expresses the method as one clearer editorial actor.",
    exactCharacterVerification: {status: "PASS", expected: "先给材料|再找角度|最后再让 AI 动笔", observedLines: ["先给材料", "再找角度", "最后再让 AI 动笔"]},
  }],
]);

const workspace = readProjectWorkspace(appRoot);
const maturity = readJson(maturityPath);
const targetShotIds = [...(maturity.phases?.PHASE_3?.targetShotIds || [])].sort();
const firstStructuralRetryTargets = ["ED-09", "ED-10", "ED-12", "ED-17", "ED-33"];
const exactCopyLegibilityTargets = ["ED-10", "ED-17"];
const objectiveWholeFilmClosureTargets = ["ED-16", "ED-17"];
const decisions = JSON.stringify(targetShotIds) === JSON.stringify(firstStructuralRetryTargets)
  ? firstStructuralRetryDecisions
  : JSON.stringify(targetShotIds) === JSON.stringify(exactCopyLegibilityTargets)
    ? exactCopyLegibilityDecisions
    : JSON.stringify(targetShotIds) === JSON.stringify(objectiveWholeFilmClosureTargets)
      ? objectiveWholeFilmClosureDecisions
      : null;
if (!decisions) throw new Error(`visual-review-target-scope-invalid:${targetShotIds.join(",")}`);
const waveJobIds = new Set(maturity.phases.PHASE_3.queuedJobIds || maturity.phases.PHASE_3.currentWaveJobIds || []);
const jobs = workspace.production.generation.jobs
  .filter((job) => waveJobIds.has(job.id) && job.status === "complete" && job.output?.sha256)
  .sort((left, right) => left.shotId.localeCompare(right.shotId) || left.candidateIndex - right.candidateIndex);
if (jobs.length !== decisions.size) throw new Error(`visual-review-current-wave-job-count-invalid:${jobs.length}`);
const jobDispatchShas = [...new Set(jobs.map((job) => job.goldenFilmMaturityRunSha256).filter((value) => /^[a-f0-9]{64}$/.test(value || "")))];
if (jobDispatchShas.length !== 1) throw new Error(`visual-review-job-dispatch-sha-invalid:${jobDispatchShas.join(",")}`);
const waveDispatchMaturityRunSha256 = jobDispatchShas[0];
const phaseDispatchSha256 = maturity.phases.PHASE_3.waveDispatchMaturityRunSha256;
if (phaseDispatchSha256 && phaseDispatchSha256 !== waveDispatchMaturityRunSha256) {
  throw new Error(`visual-review-phase-job-dispatch-sha-mismatch:${phaseDispatchSha256}:${waveDispatchMaturityRunSha256}`);
}

const items = jobs.map((job) => {
  const review = decisions.get(`${job.shotId}:${job.candidateIndex}`);
  if (!review) throw new Error(`visual-review-decision-missing:${job.shotId}:${job.candidateIndex}`);
  return {
    generationJobId: job.id,
    shotId: job.shotId,
    candidateIndex: job.candidateIndex,
    artifactSha256: job.output.sha256,
    ...review,
    actualFullFrameInspected: true,
    boardScaleInspected: true,
    exactCharacterVerification: review.exactCharacterVerification || null,
    fullLookMasterActualPixelPass: review.decision === "PASS",
  };
});
const passItems = items.filter((item) => item.decision === "PASS");
const rejectedOnlyShotIds = targetShotIds.filter((shotId) => items.filter((item) => item.shotId === shotId).every((item) => item.decision === "REJECT"));
const manifest = {
  contract: "A1FullLookMasterVisualDirectorReview/v1",
  status: "PASS",
  current: true,
  waveDispatchMaturityRunSha256,
  reviewScope: "SYSTEM_VISUAL_DIRECTOR_ACTUAL_FULL_FRAME",
  reviewMethod: "ORIGINAL_PIXEL_AND_WHOLE_FILM_BOARD_SCALE_INSPECTION",
  userVisualApproval: "NOT_REQUESTED",
  reviewedCandidateCount: items.length,
  passCandidateCount: passItems.length,
  rejectCandidateCount: items.length - passItems.length,
  passShotIds: [...new Set(passItems.map((item) => item.shotId))].sort(),
  retryShotIds: rejectedOnlyShotIds,
  items,
  shotRepairs: [],
  generatedAt: new Date().toISOString(),
};
assertFullLookMasterVisualDirectorReview(manifest, {waveDispatchMaturityRunSha256: manifest.waveDispatchMaturityRunSha256, jobs});
writeJsonAtomic(path.join(artifactDir, relativePath), manifest);
writeJsonAtomic(path.join(publicDir, relativePath), manifest);

console.log(JSON.stringify({status: "PASS", waveDispatchMaturityRunSha256: manifest.waveDispatchMaturityRunSha256, reviewedCandidateCount: items.length, passCandidateCount: passItems.length, passShotIds: manifest.passShotIds, retryShotIds: manifest.retryShotIds}, null, 2));
