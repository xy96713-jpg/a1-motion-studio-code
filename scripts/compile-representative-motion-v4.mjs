#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {normalizeMotionActorTrack} from "../lib/a1-motion-ir-parity-v1.js";
import {verifyFontGlyphOutlineProof} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {deriveRepresentativeMotionPlacementGate} from "../apps/studio-next/src/lib/a1-package-video-placement-gate-v1.mjs";
import {derivePresenterPackagingComplexityGate} from "../apps/studio-next/src/lib/a1-presenter-packaging-complexity-gate-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phaseRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const v4Root = path.join(phaseRoot, "approved-master-layer-motion-pilot-v4");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("representative-motion-v4-compile-expected-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const publicPath = (publicUrl) => path.join(publicRoot, publicUrl.replace(/^\//u, ""));
const manifest = JSON.parse(fs.readFileSync(path.join(v4Root, "shot-assets/manifest.json"), "utf8"));
const fontProof = JSON.parse(fs.readFileSync(path.join(v4Root, "shot-assets/ED-31/actual-pixel-font-proof.json"), "utf8"));
verifyFontGlyphOutlineProof({proof: fontProof, fontPath: path.join(phaseRoot, "font-cache/fusion-pixel.ttf"), expectedFontSha256: "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32"});
const v2Props = JSON.parse(fs.readFileSync(path.join(phaseRoot, "approved-master-layer-motion-pilot-v2/input-props.json"), "utf8"));
const v2Plan = JSON.parse(fs.readFileSync(path.join(phaseRoot, "approved-master-layer-motion-pilot-v2/plan.json"), "utf8"));
if (manifest.contract !== "A1RepresentativeMotionV4ShotAssetManifest/v1" || manifest.status !== "IMAGEGEN_MASTER_AND_ED13_REDUCTION_READY") throw new Error("representative-motion-v4-asset-manifest-invalid");
for (const item of [manifest.outputs.ed31Master, manifest.outputs.ed31Title, ...Object.values(manifest.outputs.ed31Stages), manifest.outputs.ed31Result, manifest.outputs.ed31StableComposite, manifest.outputs.ed13Typography, manifest.outputs.ed13StableComposite]) if (shaFile(publicPath(item.publicUrl)) !== item.sha256) throw new Error(`representative-motion-v4-asset-sha-mismatch:${item.publicUrl}`);

const fps = 30;
const durationInFrames = 105;
const shotIds = ["ED-10", "ED-13", "ED-14", "ED-17", "ED-31"];
const reusedShotIds = ["ED-10", "ED-13", "ED-14", "ED-17"];
const changedShotIds = ["ED-31"];
const track = (id, role, semanticJob, startFrame, endFrame, from, to, curve = "editorial-reveal") => normalizeMotionActorTrack({id, role, semanticJob, startFrame, endFrame, curve, from, to});

function historicalMeasuredBoundsForSameFrame(workspace, shotId, baseFrameSha256) {
  return (workspace.production.shotIntelligence.packageLookMasterPlanHistory || []).filter((item) => item.shotId === shotId).map((item) => item.videoContextReconciliation || item.videoContext).filter(Boolean).find((context) => context.baseFrame?.sha256 === baseFrameSha256 && context.subjectBounds?.status === "DECLARED_FROM_ACTUAL_HOLD_FRAME_REVIEW")?.subjectBounds || null;
}

const result = await withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`representative-motion-v4-compile-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen" || current.production.generation.automaticDispatchAllowed !== false) throw new Error("representative-motion-v4-frozen-runtime-required");
  if (current.production.assembly.status !== "NOT_CREATED" || current.production.assembly.productionWired !== false || current.production.motion.aeLevelProven !== false || current.production.assembly.userVisualApproval !== "NOT_APPROVED") throw new Error("representative-motion-v4-locks-required");
  if (current.production.shotIntelligence.representativeMotionV4ShotAssets?.manifestSha256 !== manifest.manifestSha256) throw new Error("representative-motion-v4-workspace-manifest-pointer-mismatch");

  const ed13Old = v2Props.shots.find((shot) => shot.shotId === "ED-13");
  const ed13Bounds = historicalMeasuredBoundsForSameFrame(current, "ED-13", ed13Old.baseFrame.sha256);
  if (!ed13Bounds) throw new Error("representative-motion-v4-ed13-measured-bounds-required");
  const routeOverrides = {
    "ED-13": {presentationMode: "OVERLAY", frameOccupation: "OVERLAY", baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO", baseSubjectMustRemainVisible: true},
    "ED-31": {presentationMode: "FULLSCREEN_EXPLAINER_TAKEOVER", frameOccupation: "FULL_FRAME_TAKEOVER", baseVideoRelationship: "TEMPORARY_FULL_FRAME_TAKEOVER", baseSubjectMustRemainVisible: false},
  };
  const semanticContexts = {
    "ED-13": {semanticIntent: "人物保持主体，只保留两条必要对比标题", semanticStructure: {kinds: ["SIMPLE_CONTRAST_TITLE", "LIGHT_MASK"], stepCount: 1, relationshipCount: 0, regionCount: 1}},
    "ED-31": {semanticIntent: "一条连续纸带将混乱材料演化为可控工作流", semanticStructure: {kinds: ["MULTI_STEP_WORKFLOW"], stepCount: 4, relationshipCount: 3, regionCount: 4}},
  };
  const placementGate = deriveRepresentativeMotionPlacementGate(current, shotIds, {packageOnlyShotIds: ["ED-10", "ED-14", "ED-17", "ED-31"], routeOverrides, semanticContexts, subjectBoundsOverrides: {"ED-13": ed13Bounds}});
  if (placementGate.status !== "PASS") throw new Error(`representative-motion-v4-placement-blocked:${placementGate.blockerShotIds.join(",")}`);
  const ed13Complexity = derivePresenterPackagingComplexityGate({...routeOverrides["ED-13"], ...semanticContexts["ED-13"], baseVisualCarrier: "PRESENTER_BASE"});
  const ed31Complexity = derivePresenterPackagingComplexityGate({...routeOverrides["ED-31"], ...semanticContexts["ED-31"]});
  if (!ed13Complexity.confirmed || !ed31Complexity.confirmed || ed31Complexity.status !== "COMPLEX_EXPLANATION_FULL_FRAME_TAKEOVER_PASS") throw new Error("representative-motion-v4-complexity-gate-failed");

  const ed13Scene = {
    contract: "A1MotionIRScene/v2", sceneId: "ED-13", sourceMotionContract: "A1PackageLayerMotionDirector/v1", sourceAuthority: "representative-motion-v4-imagegen-and-clean-typography", reviewOnly: true, promotedRender: false,
    timing: {fps, frameStart: 0, frameDuration: durationInFrames, duration: durationInFrames / fps},
    phases: {setup: {startFrame: 0, endFrame: 14}, action: {startFrame: 14, endFrame: 54}, lock: {startFrame: 54, endFrame: 66}, stableReadingHold: {startFrame: 66, endFrame: 96}, handoff: {startFrame: 97, endFrame: 104}},
    kineticText: {source: "APPROVED_EXTRACTED_EXACT_GLYPH_PIXELS", localRetypesetting: false},
    textMotion: {operation: "LIGHT_TITLE_REVEAL", constraints: ["NO_LOCAL_RETYPESETTING", "NO_DECORATIVE_UNDERLINE", "PRESENTER_REMAINS_DOMINANT"]},
    actors: [
      track("typography", "exact-glyph-title-actor", "reveal only the retained comparison titles", 12, 38, {opacity: 0, y: 12, scale: .99}, {opacity: 1, y: 0, scale: 1}, "selection-snap"),
      track("final-lock", "exact-presenter-composite-lock", "lock actual cleaned alpha over unchanged presenter frame", 58, 66, {opacity: 0}, {opacity: 1}, "quiet-hold"),
    ],
    placementGate: placementGate.items.find((item) => item.shotId === "ED-13"), presenterPackagingComplexity: {applied: ed13Complexity},
  };
  const master = manifest.outputs.ed31Master;
  const workflowActors = {
    "paper-pile": master, "paper-ribbon": master, organize: master, arrange: master, read: master, check: master, terminal: master,
    "text-title": manifest.outputs.ed31Title,
    "text-organize": manifest.outputs.ed31Stages["stage-organize"],
    "text-arrange": manifest.outputs.ed31Stages["stage-arrange"],
    "text-read": manifest.outputs.ed31Stages["stage-read"],
    "text-check": manifest.outputs.ed31Stages["stage-check"],
    "text-result": manifest.outputs.ed31Result,
  };
  const actorRegions = {
    "paper-pile": {clipPath: "inset(0 76% 0 0)"},
    "paper-ribbon": {clipPath: "inset(18% 58% 5% 20%)"},
    organize: {clipPath: "inset(18% 43% 5% 38%)"},
    arrange: {clipPath: "inset(18% 28% 5% 54%)"},
    read: {clipPath: "inset(18% 16% 5% 68%)"},
    check: {clipPath: "inset(18% 8% 5% 78%)"},
    terminal: {clipPath: "inset(0 0 0 82%)"},
  };
  const ed31Scene = {
    contract: "A1MotionIRScene/v2", sceneId: "ED-31", sourceMotionContract: "A1ImageGenRasterSemanticMotionDirector/v1", sourceAuthority: "user-selected-built-in-imagegen-master", reviewOnly: true, promotedRender: false,
    timing: {fps, frameStart: 0, frameDuration: durationInFrames, duration: durationInFrames / fps},
    phases: {setup: {startFrame: 0, endFrame: 12}, action: {startFrame: 12, endFrame: 64}, lock: {startFrame: 64, endFrame: 72}, stableReadingHold: {startFrame: 72, endFrame: 96}, handoff: {startFrame: 97, endFrame: 104}},
    kineticText: {source: "LOCAL_EXACT_CHINESE_BOUND_FONTS", localRetypesetting: true},
    textMotion: {operation: "MASKED_RASTER_CAUSAL_REVEAL", constraints: ["IMAGEGEN_MASTER_REMAINS_PRIMARY_COMPOSITION", "NO_RASTER_REDRAW", "NO_GENERIC_FLOWCHART", "MAX_TRANSLATION_30PX"]},
    actors: [
      track("paper-pile", "imagegen-raster-region", "left paper pile enters", 0, 14, {opacity: 0, x: -28}, {opacity: 1, x: 0}),
      track("paper-ribbon", "imagegen-raster-region", "paper ribbon unfolds and converges", 8, 26, {opacity: 0, x: -24}, {opacity: 1, x: 0}),
      track("organize", "imagegen-raster-region", "organize stage resolves", 16, 30, {opacity: 0, x: -16}, {opacity: 1, x: 0}),
      track("arrange", "imagegen-raster-region", "arrange stage resolves", 24, 38, {opacity: 0, x: -16}, {opacity: 1, x: 0}),
      track("read", "imagegen-raster-region", "magnifier reading stage resolves", 32, 46, {opacity: 0, scale: .96}, {opacity: 1, scale: 1}),
      track("check", "imagegen-raster-region", "check marks resolve", 40, 54, {opacity: 0, x: -12}, {opacity: 1, x: 0}),
      track("terminal", "imagegen-raster-region", "blue controlled terminal locks", 50, 64, {opacity: 0, x: 24, scale: .98}, {opacity: 1, x: 0, scale: 1}),
      track("text-title", "exact-local-title", "state exact promise without covering ribbon", 10, 28, {opacity: 0, y: -10}, {opacity: 1, y: 0}, "selection-snap"),
      track("text-organize", "exact-local-stage-label", "label organize", 18, 30, {opacity: 0, y: 8}, {opacity: 1, y: 0}),
      track("text-arrange", "exact-local-stage-label", "label arrange", 26, 38, {opacity: 0, y: 8}, {opacity: 1, y: 0}),
      track("text-read", "exact-local-stage-label", "label read", 34, 46, {opacity: 0, y: 8}, {opacity: 1, y: 0}),
      track("text-check", "exact-local-stage-label", "label check", 42, 54, {opacity: 0, y: 8}, {opacity: 1, y: 0}),
      track("text-result", "exact-local-result", "label controlled workflow", 52, 66, {opacity: 0, scale: .96}, {opacity: 1, scale: 1}, "verdict-cut"),
      track("final-lock", "imagegen-master-with-exact-text-lock", "lock complete selected raster and exact text", 66, 72, {opacity: 0}, {opacity: 1}, "quiet-hold"),
    ],
    placementGate: placementGate.items.find((item) => item.shotId === "ED-31"), presenterPackagingComplexity: {applied: ed31Complexity}, imagegenMasterSha256: master.sha256,
  };

  const shots = v2Props.shots.map((shot) => {
    if (shot.shotId === "ED-13") return {...shot, mode: "SIMPLE_PRESENTER_CONTRAST_TITLE_V4", semanticIntent: "人物保持主体，只保留两条必要对比标题", stableReferenceMode: "APPROVED_FINAL_COMPOSITE", layers: {TYPOGRAPHY: manifest.outputs.ed13Typography}, finalComposite: manifest.outputs.ed13StableComposite, motionIrScene: ed13Scene};
    if (shot.shotId === "ED-31") return {shotId: "ED-31", durationInFrames, mode: "IMAGEGEN_PAPER_RIBBON_FULLSCREEN_WORKFLOW_TAKEOVER", semanticIntent: "纸堆沿连续纸带完成整理、编排、读取、检查并落到可控工作流", baseFrame: null, finalComposite: manifest.outputs.ed31StableComposite, stableReferenceMode: "APPROVED_FINAL_COMPOSITE", layers: {}, workflowActors, actorRegions, cutouts: null, backgroundColor: "#f3f3ef", motionIrScene: ed31Scene};
    return shot;
  });
  const propsBody = {contract: "A1ApprovedMasterLayerMotionPilotProps/v1", reviewOnly: true, promotedRender: false, fps, overlapInFrames: v2Props.overlapInFrames, shots};
  const props = {...propsBody, propsSha256: sha256(propsBody)};
  const durationTotal = shots.length * durationInFrames - props.overlapInFrames * (shots.length - 1);
  const now = new Date().toISOString();
  const planBody = {contract: "A1RepresentativeMotionV4Plan/v1", status: "PLAN_READY_REVIEW_ONLY_STAGED_NOT_CURRENT", reviewOnly: true, promotedRender: false, sourceWorkspaceSha256: current.workspaceSha256, sourceV2PlanSha256: v2Plan.planSha256, sourceV2PropsSha256: v2Props.propsSha256, sourceV4AssetManifestSha256: manifest.manifestSha256, sourceActualPixelFontProofSha256: manifest.ed31ActualPixelFontProofSha256, fps, shotDurationInFrames: durationInFrames, overlapInFrames: props.overlapInFrames, durationInFrames: durationTotal, durationMs: Math.round(durationTotal / fps * 1000), shotIds, changedShotIds, reusedShotIds, reusePolicy: "ED10_ED14_ED17_DECODED_V2_FRAME_REUSE; ED13_DECODED_PRIOR_V4_FRAME_REUSE; REMOTION_RERENDER_ONLY_ED31", modes: Object.fromEntries(shots.map((shot) => [shot.shotId, shot.mode])), placementGate, propsSha256: props.propsSha256, renderer: {formal: "remotion-plus-frame-reuse", compositionId: "A1ApprovedMasterLayerMotionPilotV1", width: 1920, height: 1080, reviewScale: .5}, gates: {representativeRenderAllowed: true, workbenchCurrentAllowed: false, wholeFilmMotionAllowed: false, finalRenderAllowed: false}, generatedAt: now};
  const plan = {...planBody, planSha256: sha256({...planBody, generatedAt: undefined})};
  let next = structuredClone(current);
  next.production.shotIntelligence.representativeMotionV4StagedPlan = {contract: plan.contract, status: plan.status, planSha256: plan.planSha256, propsSha256: props.propsSha256, shotIds, changedShotIds, reusedShotIds, durationMs: plan.durationMs, placementGate, workbenchCurrent: false, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/approved-master-layer-motion-pilot-v4/plan.json", updatedAt: now};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "compile-representative-motion-v4", targetId: changedShotIds.join(","), payload: {planSha256: plan.planSha256, propsSha256: props.propsSha256, imagegenMasterSha256: manifest.imagegenMasterSha256, reusedShotIds}, now});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `representative-motion-v4-plan-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-motion-pilot-v4/plan.json": plan, "approved-master-layer-motion-pilot-v4/input-props.json": props}});
  return {status: plan.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, transitionSha256: committed.transitionSha256, planSha256: plan.planSha256, propsSha256: props.propsSha256, changedShotIds, reusedShotIds, placementGate: placementGate.status, durationMs: plan.durationMs};
});

console.log(JSON.stringify(result, null, 2));
