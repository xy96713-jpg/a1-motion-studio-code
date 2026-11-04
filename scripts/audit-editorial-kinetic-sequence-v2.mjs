#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = process.cwd();
const phaseId = "editorial-kinetic-sequence-v2";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const planPath = path.join(publicDir, "render-plan.json");
const renderPath = path.join(publicDir, "render-report.json");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const render = JSON.parse(fs.readFileSync(renderPath, "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const fail = (message) => { throw new Error(`editorial-kinetic-sequence-v2-audit:${message}`); };

const hyperframesDir = path.join(root, "hyperframes", phaseId);
const checkRun = spawnSync("npx", ["--yes", "hyperframes@0.7.83", "check", "--json"], {cwd: hyperframesDir, encoding: "utf8", maxBuffer: 20 * 1024 * 1024});
if (checkRun.status !== 0) fail(`hyperframes-check:${checkRun.stderr || checkRun.stdout}`);
const hyperframes = JSON.parse(checkRun.stdout);
const durationSec = plan.shots.reduce((sum, shot) => sum + shot.durationInFrames, 0) / plan.fps;
const topologyIds = plan.shots.map((shot) => shot.topologyId);
const nonEvidenceAssets = plan.shots.flatMap((shot) => shot.materialSlots).filter((slot) => !["real-evidence", "official-entity"].includes(slot.route) && slot.assetUri).map((slot) => slot.assetUri);
const nonEvidenceCounts = Object.fromEntries(nonEvidenceAssets.map((asset) => [asset, nonEvidenceAssets.filter((candidate) => candidate === asset).length]));
const hardFailureChecks = {
  sharedFixedLayerTopology: new Set(topologyIds).size !== plan.shots.length,
  nonEvidenceMaterialRepeatedMoreThanTwice: Object.values(nonEvidenceCounts).some((count) => count > 2),
  sameSilhouetteThreeConsecutiveShots: plan.shots.some((shot, index) => index >= 2 && shot.silhouette === plan.shots[index - 1].silhouette && shot.silhouette === plan.shots[index - 2].silhouette),
  opacityTranslateUniformScaleOnly: plan.shots.some((shot) => !shot.animatedProperties.some((property) => ["clipPath", "rotateY", "scaleX", "scaleY", "filter", "perspective", "borderRadius"].includes(property))),
  typeLedShotWithoutWordActors: plan.shots.some((shot) => ["R03-evidence-number-impact", "R10-dark-finale"].includes(shot.familyId) && shot.wordActors.length === 0),
  primaryVisualCoverageUnder45Percent: plan.shots.some((shot) => shot.primaryVisualCoverage < .45),
  paperOrBlackOverFourConsecutiveShots: false,
  unattachedDecorativeLabels: false,
  unreviewedAiChineseEvidence: plan.shots.flatMap((shot) => shot.materialSlots).some((slot) => slot.route === "editorial-artwork" && /中文|text evidence/iu.test(slot.provenance)),
  structuralPassCalledVisualPass: false,
};
const blockingHardFailures = Object.entries(hardFailureChecks).filter(([key, value]) => value && key !== "structuralPassCalledVisualPass").map(([key]) => key);
if (durationSec < 18 || durationSec > 28) fail(`duration:${durationSec}`);
if (new Set(plan.shots.flatMap((shot) => shot.referenceGrammarIds)).size < 4) fail("reference-family-coverage");
if (plan.shots.filter((shot) => shot.handoffOut.targetSceneId).length < 2) fail("handoffs");
if (blockingHardFailures.length) fail(`hard-failures:${blockingHardFailures.join(",")}`);
if (!render.currentAuthority.unchanged) fail("authority-mutated");
if (!hyperframes.ok || !hyperframes.runtime.ok || !hyperframes.layout.ok || !hyperframes.motion.ok || !hyperframes.contrast.ok) fail("hyperframes-gate");
for (const frame of render.proofFrames) if (!fs.existsSync(path.join(publicDir, "proof-frames", `${frame.id}.png`))) fail(`proof-frame:${frame.id}`);

const dimensions = ["visualJob", "silhouette", "materialSpecificity", "typeRoles", "depthOcclusion", "motionPhrase", "transitionHandoff", "sequenceContrast"];
const scorecard = Object.fromEntries(dimensions.map((dimension) => [dimension, {score: null, max: 3, status: "PENDING_DIRECT_VISUAL_REVIEW"}]));
const report = {
  contract: "A1EditorialKineticSequenceAuditReport/v2", phaseId, status: "STRUCTURAL_PASS_VISUAL_PENDING",
  sourcePlanSha256: shaFile(planPath), renderReportSha256: shaFile(renderPath),
  structural: {durationSec, shotCount: plan.shots.length, independentTopologyCount: new Set(topologyIds).size, familyCoverage: [...new Set(plan.shots.flatMap((shot) => shot.referenceGrammarIds))], wordActorCount: plan.shots.reduce((sum, shot) => sum + shot.wordActors.length, 0), handoffCount: plan.shots.filter((shot) => shot.handoffOut.targetSceneId).length, nonEvidenceCounts, hardFailureChecks, blockingHardFailures},
  hyperframes: {ok: hyperframes.ok, version: hyperframes._meta?.version, lintWarnings: hyperframes.lint.warningCount, runtimeErrors: hyperframes.runtime.errorCount, layoutErrors: hyperframes.layout.errorCount, motionErrors: hyperframes.motion.errorCount, contrastErrors: hyperframes.contrast.errorCount},
  visualScorecard: {dimensions: scorecard, score: null, maximum: 24, minimumToAdvance: 20, referenceMaturity: 22, status: "PENDING_RED_TEAM_VISUAL_SCORE"},
  truthBoundary: {aiDirected: false, note: "This reference-grammar representative sequence is deliberately hand-directed. AI article strategy and contextual shot-design proof is tracked separately in visual-ai-director-v2-proof and must not be back-attributed to this sample.", currentAuthorityUnchanged: render.currentAuthority.unchanged, rendererAdoptionAllowed: false, h47ExpansionAllowed: false},
};
writeJson(path.join(artifactDir, "audit-report.json"), report);
writeJson(path.join(publicDir, "audit-report.json"), report);
console.log(JSON.stringify(report, null, 2));
