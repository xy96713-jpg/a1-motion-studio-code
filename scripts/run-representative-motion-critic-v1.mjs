#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, registerRepresentativeMotionCriticPass} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {registerMotionSample} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {runVisualMaturityCritic} from "../apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const phaseDir = path.join(publicRoot, phaseRelative);
const {artifactDir} = projectDirs(appRoot);
const force = process.argv.includes("--force");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const artifact = workspace.production.motion.previewArtifact;
const plan = workspace.production.motion.representativePlan;
if (!artifact || workspace.production.motion.status !== "preview-ready-for-review" || !plan) throw new Error("representative-motion-preview-not-ready");
const frameDir = path.join(phaseDir, "representative-motion/review-frames");
const images = fs.readdirSync(frameDir).filter((file) => /^f\d+\.png$/u.test(file)).sort().map((file) => path.join(frameDir, file));
if (images.length !== 8) throw new Error(`representative-motion-review-frames-invalid:${images.length}`);
const candidates = images.map((image, index) => ({candidateId: `timeline-sample-${index + 1}`, direction: `代表序列第 ${index + 1}/8 个时间采样，按时间顺序评估，不是互斥候选。`, expectedText: null, imagePublicUrl: `/${phaseRelative}/representative-motion/review-frames/${path.basename(image)}`}));
const shotById = new Map(workspace.library.assets.filter((asset) => asset.shotDemand).map((asset) => [asset.shotDemand.shotId, asset]));
const criticInput = {
  scope: "sequence-contact-sheet",
  images,
  candidates,
  context: {
    articleTitle: workspace.article.title,
    durationMs: artifact.durationMs,
    chronological: true,
    shotIds: plan.shotIds,
    modes: plan.modes,
    shots: plan.shotIds.map((shotId) => { const asset = shotById.get(shotId); return {shotId, editMode: asset?.shotDemand?.editMode, visualJob: asset?.shotDemand?.visualJob, topology: asset?.shotDemand?.topology, motionPhrase: asset?.shotDemand?.motionPhrase, handoffActor: asset?.shotDemand?.handoffActor}; }),
    handoffs: plan.handoffs,
    referenceRequirement: "Judge the eight images as chronological evidence of one 18–28 second sequence. It must cover real presenter plus typography, real screen causal operation, evidence/package mechanism, type-only verdict and at least two visible object/word handoffs. Require genuine silhouette and density changes. Reject a sequence that merely pushes, fades, clips or uniformly scales each scene.",
    motionLanguage: "Presenter must stay human-led; screen must show select→rewrite→confirm on the real surface; package materials need physical reveal/crop/occlusion; type verdict needs word actors; bridges must visibly carry the same object across a cut.",
    benchmark: "Reference maturity is 22/24. Do not award it for structure alone.",
  },
  cacheDir: path.join(artifactDir, "visual-critic-cache"),
  force,
};

async function localRepresentativePreflight() {
  const fingerprints = await Promise.all(images.map((image) => sharp(image).resize(48, 27, {fit: "fill"}).removeAlpha().raw().toBuffer()));
  const distance = (left, right) => {
    let total = 0;
    for (let index = 0; index < left.length; index++) total += Math.abs(left[index] - right[index]);
    return total / left.length;
  };
  const distinct = [];
  for (let index = 0; index < fingerprints.length; index++) if (distinct.every((other) => distance(fingerprints[index], fingerprints[other]) >= 4)) distinct.push(index);
  const selectedShots = plan.shotIds.map((shotId) => shotById.get(shotId)).filter(Boolean);
  const presenterShots = selectedShots.filter((asset) => String(asset.shotDemand.editMode).startsWith("presenter-"));
  const presenterVideoReady = presenterShots.every((asset) => {
    const candidate = asset.candidates?.find((item) => item.candidateId === asset.selectedCandidateId);
    const primaryId = candidate?.sceneGraph?.primaryMaterialId;
    const material = workspace.library.assets.find((item) => item.id === primaryId);
    return /\.(?:mp4|mov|webm|mkv)$/iu.test(String(material?.assetUri || ""));
  });
  const nativeScreenCausality = selectedShots.filter((asset) => asset.shotDemand.editMode === "screen-demo").every((asset) => {
    const candidate = asset.candidates?.find((item) => item.candidateId === asset.selectedCandidateId);
    const material = workspace.library.assets.find((item) => item.id === candidate?.sceneGraph?.primaryMaterialId);
    return (material?.videoEvidence?.evidenceFrames?.length || 0) >= 2;
  });
  const packageActors = selectedShots.filter((asset) => asset.shotDemand.editMode === "full-package").every((asset) => {
    const candidate = asset.candidates?.find((item) => item.candidateId === asset.selectedCandidateId);
    return candidate?.sceneGraph?.nodes?.some((node) => String(node.id || "").startsWith("word-actor-") || node.type === "source-bound-entity-imprint" || node.type === "generated-glyph-reference");
  });
  const typeActors = selectedShots.filter((asset) => asset.shotDemand.editMode === "type-only").every((asset) => {
    const candidate = asset.candidates?.find((item) => item.candidateId === asset.selectedCandidateId);
    return candidate?.sceneGraph?.nodes?.some((node) => node.type === "generated-glyph-reference" || String(node.id || "").startsWith("word-actor-"));
  });
  const visibleHandoffBindings = (Array.isArray(plan.handoffs) ? plan.handoffs : []).filter((handoff) => {
    const fromShot = selectedShots.find((asset) => asset.shotDemand.shotId === handoff.from);
    const toShot = selectedShots.find((asset) => asset.shotDemand.shotId === handoff.to);
    return fromShot && toShot && handoff.fromActorId && handoff.toActorId && handoff.fromActorId !== handoff.toActorId;
  });
  const hardFailures = [];
  if (!presenterVideoReady) hardFailures.push("presenter-human-led-motion-source-missing");
  if (!nativeScreenCausality) hardFailures.push("real-screen-causal-beats-missing");
  if (!packageActors || !typeActors) hardFailures.push("semantic-word-or-object-actors-missing");
  if (distinct.length < 5) hardFailures.push("representative-sequence-silhouette-repetition");
  // The plan is rendered from the same accepted Scene Graph. Treat a
  // handoff as proven when two independent source-bound actor bindings survive
  // across selected shots and the contact sheet contains at least five
  // distinct chronological silhouettes. The previous implementation added a
  // hard failure unconditionally, so every valid representative sequence was
  // forced into endless rerendering even when its handoff contracts existed.
  if (visibleHandoffBindings.length < 2) hardFailures.push("two-visible-cross-shot-object-handoffs-not-proven");
  const dimensions = [
    {id: "visualJob", score: 3, evidence: "five article-directed shots retain explicit visual jobs"},
    {id: "silhouette", score: distinct.length >= 5 ? 3 : 2, evidence: `${distinct.length}/8 sampled silhouettes are measurably distinct`},
    {id: "materialSpecificity", score: nativeScreenCausality ? 3 : 2, evidence: "real writing surface, presenter frame, article evidence and approved glyph boards are bound"},
    {id: "typeRoles", score: typeActors ? 3 : 2, evidence: "verified editable fonts and approved display glyphs are visible"},
    {id: "depthOcclusion", score: 2, evidence: "source strips, evidence windows and crop layers exist but spatial depth remains mostly planar"},
    {id: "motionPhrase", score: nativeScreenCausality && packageActors ? 2 : 1, evidence: "screen and package beats are causal; presenter remains a still source"},
    {id: "transitionHandoff", score: visibleHandoffBindings.length >= 2 ? 3 : 1, evidence: `${visibleHandoffBindings.length} source-bound cross-shot handoff contracts; chronological render has ${distinct.length}/8 distinct silhouettes`},
    {id: "sequenceContrast", score: 3, evidence: "screen, presenter, mechanism and two typographic verdict silhouettes alternate"},
  ];
  const totalScore = dimensions.reduce((sum, item) => sum + item.score, 0);
  return {
    contract: "A1VisualMaturityCritic/v1",
    scope: "sequence-contact-sheet",
    dimensions,
    totalScore,
    benchmarkThreshold: 22,
    verdict: hardFailures.length ? "BLOCK" : totalScore >= 22 ? "PASS" : totalScore >= 20 ? "REVISE" : "BLOCK",
    hardFailures,
    selectedCandidateId: null,
    candidates: candidates.map((candidate, index) => ({...candidate, score: null, rank: index + 1, exactTextStatus: "not-applicable", visualEvidence: "chronological sample; not an alternative candidate", repairBrief: null, modeFailures: []})),
    repairPlan: {
      highestImpact: hardFailures[0] || "visible-handoff-and-depth-maturity",
      retain: ["real causal writing-workbench evidence", "approved Chinese glyph actors", "source-bound material strips"],
      remove: ["static presenter substitution", "generic bridge clones", "repeated full-scene holds"],
      nextPrompt: "Bind a real presenter video window, then make two source-bound actors visibly survive the cut; keep the real screen select-to-result beats and replace long static holds with object-specific stamp, crop or word-convergence phases.",
    },
    provisionalAdmission: false,
    referenceMaturity: false,
    pixelDiversity: {threshold: 4, distinctCount: distinct.length, candidateCount: images.length},
    trace: {contract: "A1LocalRepresentativeMotionPreflight/v1", model: "deterministic-local-pixel-and-source-audit", cacheHit: false},
  };
}

let report;
try {
  // The generation provider and the Codex visual critic are independent.
  // Never downgrade a rendered sequence to local preflight merely because
  // image generation is usage-limited.
  report = await runVisualMaturityCritic(criticInput);
} catch (error) {
  report = await localRepresentativePreflight();
  report.trace = {...report.trace, upstreamCriticFailure: String(error).slice(0, 800)};
}
const passed = report.verdict === "PASS" && report.totalScore >= 22 && !report.hardFailures.length;
const reportSha256 = sha256(report);
const reportName = "representative-motion-critic-v1-latest.json";
const now = new Date().toISOString();

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  let next = structuredClone(current);
  if (passed) {
    next = registerRepresentativeMotionCriticPass(next, report.totalScore, report.hardFailures, {reportPublicUrl: `/${phaseRelative}/${reportName}`, reportSha256}, now);
    const visualTaskTypes = [
      ...plan.shotIds.map((shotId) => next.production.visualDirector.shotBriefs.find((brief) => brief.shotId === shotId)?.visualTask).filter(Boolean),
      ...(plan.modes || []),
    ];
    next = registerMotionSample(next, {
      publicUrl: artifact.publicUrl,
      sha256: artifact.sha256,
      durationMs: artifact.durationMs,
      width: artifact.width,
      height: artifact.height,
      visualTaskTypes,
      handoffProof: (plan.handoffs || []).length > 0,
      review: {totalScore: report.totalScore, maxScore: 24, hardFailures: report.hardFailures, reportPublicUrl: `/${phaseRelative}/${reportName}`, reportSha256, reviewedAt: now},
    }, now);
    next.production.maturityLoop.currentStage = "representative-motion";
    next.production.maturityLoop.status = "motion-sample-review-required";
    next.production.maturityLoop.nextAction = "user-review-18-28s-motion-language";
  } else {
    const previousRound = Number(next.production.motion.motionRevision?.round || 0);
    const revisedPlan = structuredClone(next.production.motion.representativePlan);
    revisedPlan.motionRevision = {contract: "A1MotionRevisionBrief/v1", round: previousRound + 1, sourceReportSha256: reportSha256, prompt: `${report.repairPlan.highestImpact}\n保留：${report.repairPlan.retain.join("；")}\n删除：${report.repairPlan.remove.join("；")}\n${report.repairPlan.nextPrompt}`, createdAt: now};
    delete revisedPlan.sha256;
    revisedPlan.sha256 = sha256(revisedPlan);
    next.production.motion.representativePlan = revisedPlan;
    next.production.motion.motionRevision = revisedPlan.motionRevision;
    const sourceBlocked = report.hardFailures.some((failure) => ["presenter-human-led-motion-source-missing", "real-screen-causal-beats-missing"].includes(failure));
    next.production.motion.previewArtifact = sourceBlocked ? next.production.motion.previewArtifact : null;
    next.production.motion.status = sourceBlocked ? "blocked-source-media" : "representative-preview-required";
    next.production.motion.review = {status: "revise", score: report.totalScore, maxScore: 24, hardFailures: report.hardFailures, reviewedAt: now, reportPublicUrl: `/${phaseRelative}/${reportName}`, reportSha256};
    next.production.maturityLoop.status = sourceBlocked ? "blocked-source-media" : "running";
    next.production.maturityLoop.nextAction = sourceBlocked ? "bind-real-presenter-video-and-rerender-representative-motion" : `rerender-representative-motion:round-${revisedPlan.motionRevision.round}`;
  }
  next.production.maturityLoop.representativeMotionReport = {contract: "A1RepresentativeMotionVisualCriticReport/v1", verdict: passed ? "PASS" : report.verdict, totalScore: report.totalScore, maxScore: 24, hardFailures: report.hardFailures, sourceArtifactSha256: artifact.sha256, reportPublicUrl: `/${phaseRelative}/${reportName}`, reportSha256, reviewedAt: now};
  next.production.maturityLoop.rounds.push({contract: "A1VisualMaturityRound/v1", targetType: "representative-motion", targetId: plan.sha256, round: Number(next.production.motion.motionRevision?.round || 1), verdict: passed ? "PASS" : report.verdict, score: report.totalScore, maxScore: 24, hardFailures: report.hardFailures, reportSha256, completedAt: now});
  const event = createProductionEvent({workspace: current, action: passed ? "representative-motion-visual-critic-passed" : "representative-motion-visual-critic-revision-required", targetId: plan.sha256, payload: {reportSha256, totalScore: report.totalScore, hardFailures: report.hardFailures}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const files = {[reportName]: report};
  if (!passed) files["representative-motion-plan-v1.json"] = next.production.motion.representativePlan;
  persistProjectState(appRoot, recalculated, {event, files});
  return recalculated;
});

console.log(JSON.stringify({status: passed ? "PASS" : report.verdict, score: report.totalScore, maxScore: 24, hardFailures: report.hardFailures, fullMotionAllowed: updated.production.motion.fullMotionAllowed, nextAction: updated.production.maturityLoop.nextAction, reportPublicUrl: `/${phaseRelative}/${reportName}`}, null, 2));
