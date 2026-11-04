#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {buildCreatorMaterialMotionPrototypeV1} from "../apps/studio-next/src/lib/a1-creator-material-pixel-type-motion-v1.ts";
import {evaluateHyperframesPlanAtFrame, evaluateMotionIrSceneAtFrame} from "../lib/a1-motion-ir-parity-v1.js";

const root = process.cwd();
const phaseId = "creator-material-pixel-type-motion-v1";
const staticPhaseId = "creator-material-pixel-type-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const staticDir = path.join(root, "apps/studio-next/public/generated/system-line", staticPhaseId);
const staticAuditPath = path.join(staticDir, "audit-report.json");
const independentReviewPath = path.join(staticDir, "independent-visual-review.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/creatorMaterialPixelTypeMotionV1Props.json");
const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

if (!fs.existsSync(staticAuditPath) || !fs.existsSync(independentReviewPath)) throw new Error("creator-material-motion-static-review-missing");
const staticAudit = JSON.parse(fs.readFileSync(staticAuditPath, "utf8"));
const independentReview = JSON.parse(fs.readFileSync(independentReviewPath, "utf8"));
if (staticAudit.status !== "PASS_FOR_DYNAMIC_PROTOTYPE" || staticAudit.gates?.dynamicPrototypeAllowed !== true || staticAudit.independentReview?.reviewedArtifactsCurrent !== true) {
  throw new Error("creator-material-motion-static-gate-closed");
}
if (independentReview.verdict !== "PASS_FOR_DYNAMIC_PROTOTYPE" || independentReview.gates?.dynamicPrototypeAllowed !== true) {
  throw new Error("creator-material-motion-independent-review-gate-closed");
}

const authorityBefore = shaFile(authorityPath);
const plan = buildCreatorMaterialMotionPrototypeV1({staticAuditSha256: shaFile(staticAuditPath), independentReviewSha256: shaFile(independentReviewPath)});
const parity = plan.parityFrames.map((frame) => {
  const remotion = evaluateMotionIrSceneAtFrame(plan.motionIrScene, frame);
  const hyperframes = evaluateHyperframesPlanAtFrame(plan.hyperframesPlan, frame);
  return {frame, equal: JSON.stringify(remotion) === JSON.stringify(hyperframes), remotion, hyperframes};
});
if (parity.some((sample) => !sample.equal)) throw new Error("creator-material-motion-parity-failed");
if (plan.motionIrScene.actors.filter((actor) => actor.role === "word").length !== 3) throw new Error("creator-material-motion-word-actors-missing");
if (!plan.motionIrScene.actors.some((actor) => actor.role === "handoff")) throw new Error("creator-material-motion-handoff-missing");
if (plan.visualGrammar?.contract !== "A1VisualShotAdmission/v1") throw new Error("creator-material-motion-visual-admission-missing");
if (plan.visualGrammar?.primarySubject !== "real-screen-selection") throw new Error("creator-material-motion-primary-subject-invalid");
if (plan.visualGrammar?.forbiddenPatterns?.includes("floating-hud-labels") !== true) throw new Error("creator-material-motion-hud-rejection-missing");
if (plan.motionIrScene.textMotion.handoffActorId !== "selection-focus") throw new Error("creator-material-motion-selection-handoff-invalid");

writeJson(rendererPropsPath, plan);
writeJson(path.join(publicDir, "render-plan.json"), plan);
writeJson(path.join(artifactDir, "render-plan.json"), plan);
const authorityAfter = shaFile(authorityPath);
const report = {
  contract: "A1CreatorMaterialPixelTypeMotionBuildReport/v1",
  phaseId,
  status: "PASS",
  sourceOfTruth: plan.sourceOfTruth,
  staticAdmission: plan.admission,
  motion: {actorCount: plan.motionIrScene.actors.length, propertyTrackCount: plan.motionIrScene.actors.reduce((sum, actor) => sum + actor.propertyTracks.length, 0), wordActorCount: plan.motionIrScene.actors.filter((actor) => actor.role === "word").length, durationInFrames: plan.durationInFrames, fps: plan.fps},
  parity: {status: "PASS", checkedFrames: parity.map((sample) => sample.frame), samples: parity},
  currentAuthority: {sha256Before: authorityBefore, sha256After: authorityAfter, unchanged: authorityBefore === authorityAfter},
  gates: plan.gates,
};
writeJson(path.join(publicDir, "build-report.json"), report);
writeJson(path.join(artifactDir, "build-report.json"), report);
console.log(JSON.stringify({status: report.status, phaseId, sourceOfTruth: report.sourceOfTruth, motion: report.motion, parity: report.parity.status, authorityUnchanged: report.currentAuthority.unchanged}, null, 2));
