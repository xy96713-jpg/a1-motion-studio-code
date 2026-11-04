#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {evaluateHyperframesPlanAtFrame, evaluateMotionIrSceneAtFrame} from "../lib/a1-motion-ir-parity-v1.js";

const root = process.cwd();
const phaseId = "creator-material-pixel-type-motion-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const planPath = path.join(publicDir, "render-plan.json");
const buildPath = path.join(publicDir, "build-report.json");
const renderPath = path.join(publicDir, "render-report.json");
const staticDir = path.join(root, "apps/studio-next/public/generated/system-line/creator-material-pixel-type-v1");
const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const build = JSON.parse(fs.readFileSync(buildPath, "utf8"));
const render = JSON.parse(fs.readFileSync(renderPath, "utf8"));
const failures = [];
const check = (id, value) => { if (!value) failures.push(id); };

const hyperframesDir = path.join(root, "hyperframes", phaseId);
const checkRun = spawnSync("npx", ["--yes", "hyperframes@0.7.83", "check", "--json"], {cwd: hyperframesDir, encoding: "utf8", maxBuffer: 20 * 1024 * 1024});
if (checkRun.status !== 0) failures.push(`hyperframes-check:${checkRun.stderr || checkRun.stdout}`);
let hyperframes = null;
try { hyperframes = JSON.parse(checkRun.stdout); } catch { failures.push("hyperframes-json"); }

const staticAuditPath = path.join(staticDir, "audit-report.json");
const staticReviewPath = path.join(staticDir, "independent-visual-review.json");
check("static-admission-current", shaFile(staticAuditPath) === plan.admission.staticAuditSha256 && shaFile(staticReviewPath) === plan.admission.independentReviewSha256);
check("motion-contract", plan.contract === "A1CreatorMaterialPixelTypeMotionPrototype/v1" && plan.motionIrScene?.contract === "A1MotionIRScene/v2");
check("single-ir", plan.sourceOfTruth === "A1MotionIRScene/v2" && plan.hyperframesPlan?.sourceSceneId === plan.motionIrScene?.sceneId);
check("review-only", plan.motionIrScene?.reviewOnly === true && plan.motionIrScene?.promotedRender === false && plan.gates?.reviewOnly === true);
check("duration", plan.durationInFrames >= 60 && plan.durationInFrames <= 120 && plan.durationInFrames === render.remotion?.durationInFrames);
check("word-actors", plan.typography?.wordActors?.length === 3 && plan.typography.wordActors.every((word) => plan.motionIrScene.actors.some((actor) => actor.id === word.actorId && actor.role === "word")));
check("handoff-actors", plan.motionIrScene.actors.filter((actor) => actor.role === "handoff").length >= 2);
check("visual-admission", plan.visualGrammar?.contract === "A1VisualShotAdmission/v1" && plan.visualGrammar?.primarySubject === "real-screen-selection" && plan.visualGrammar?.topology === "evidence-surface-overprint");
check("forbidden-hud", plan.visualGrammar?.forbiddenPatterns?.includes("floating-hud-labels") === true && plan.visualGrammar?.forbiddenPatterns?.includes("document-card-overlay") === true);
check("selection-handoff", plan.motionIrScene.textMotion.handoffActorId === "selection-focus" && plan.motionIrScene.actors.some((actor) => actor.id === "selection-focus" && actor.role === "handoff"));
const properties = new Set(plan.motionIrScene.actors.flatMap((actor) => actor.propertyTracks.map((track) => track.property)));
check("advanced-properties", ["clip", "scaleX"].every((property) => properties.has(property)));
check("stable-reading-hold", plan.motionIrScene.phases?.stableReadingHold?.[1] - plan.motionIrScene.phases?.stableReadingHold?.[0] >= 24);
for (const frame of plan.parityFrames) check(`parity-frame-${frame}`, JSON.stringify(evaluateMotionIrSceneAtFrame(plan.motionIrScene, frame)) === JSON.stringify(evaluateHyperframesPlanAtFrame(plan.hyperframesPlan, frame)));
check("build-parity", build.parity?.status === "PASS");
check("remotion-no-gsap", render.remotion?.gsapRuntimeUsed === false && render.remotion?.sourceInterpreter === "evaluateMotionIrSceneAtFrame()");
check("render-artifacts", [render.video, render.contactSheet, render.reviewStrip].every((artifact) => { const file = path.join(publicDir, path.basename(artifact.publicUrl)); return fs.existsSync(file) && shaFile(file) === artifact.sha256; }));
check("proof-frames", render.proofFrames?.length === 6 && render.proofFrames.every((frame) => { const file = path.join(publicDir, "proof-frames", `${frame.id}.png`); return fs.existsSync(file) && shaFile(file) === frame.sha256; }));
check("authority-unchanged", build.currentAuthority?.unchanged === true && render.currentAuthority?.unchanged === true && shaFile(authorityPath) === render.currentAuthority.sha256After);
check("expansion-locked", !plan.gates.familyAdoptionAllowed && !plan.gates.rendererAdoptionAllowed && !plan.gates.fullSequenceRenderAllowed && !plan.gates.h47ExpansionAllowed);
check("hyperframes-clean", Boolean(hyperframes?.ok && hyperframes.runtime?.ok && hyperframes.layout?.ok && hyperframes.motion?.ok && hyperframes.contrast?.ok));

const report = {
  contract: "A1CreatorMaterialPixelTypeMotionAuditReport/v1",
  phaseId,
  status: failures.length ? "FAIL" : "STRUCTURAL_PASS_VISUAL_PENDING",
  failures,
  sourceOfTruth: plan.sourceOfTruth,
  motion: {actorCount: plan.motionIrScene.actors.length, propertyTrackCount: plan.motionIrScene.actors.reduce((sum, actor) => sum + actor.propertyTracks.length, 0), properties: [...properties], parityFrames: plan.parityFrames, stableReadingHoldFrames: plan.motionIrScene.phases.stableReadingHold[1] - plan.motionIrScene.phases.stableReadingHold[0]},
  hyperframes: hyperframes ? {ok: hyperframes.ok, version: hyperframes._meta?.version, lintWarnings: hyperframes.lint?.warningCount, runtimeErrors: hyperframes.runtime?.errorCount, layoutErrors: hyperframes.layout?.errorCount, motionErrors: hyperframes.motion?.errorCount, contrastErrors: hyperframes.contrast?.errorCount} : null,
  render: {video: render.video, contactSheet: render.contactSheet, reviewStrip: render.reviewStrip},
  truthBoundary: {handDirectedPrototype: true, aiDirected: false, staticFamilyAdmittedForPrototypeOnly: true, currentAuthorityUnchanged: render.currentAuthority.unchanged},
  gates: {humanVisualApproval: "PENDING_INDEPENDENT_MOTION_REVIEW", dynamicPrototypeStructuralPass: failures.length === 0, familyAdoptionAllowed: false, rendererAdoptionAllowed: false, fullSequenceRenderAllowed: false, h47ExpansionAllowed: false, nextRequiredProof: "independent direct visual review of the 4-second MP4 and review strip"},
};
writeJson(path.join(publicDir, "audit-report.json"), report);
writeJson(path.join(artifactDir, "audit-report.json"), report);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
