#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileA1VisualProductionSystem} from "../apps/studio-next/src/lib/a1-visual-production-system-v1.ts";

const root = process.cwd();
const phaseId = "visual-production-system-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const candidatePath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-preproduction-motion-candidate-v1/candidate-props.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

function routeForScene(scene) {
  if (scene.route === "real-evidence" || scene.layers?.some((layer) => layer.kind === "evidence" && layer.asset)) return "real-evidence";
  if (scene.route === "editorial-artwork" || scene.layers?.some((layer) => layer.source?.type === "generated")) return "editorial-artwork";
  if (scene.route === "deterministic-explainer" || ["process-chain", "archive-stack"].includes(scene.family)) return "deterministic-explainer";
  return "typography-only";
}

function semanticInput(scene, index, previousFamilyId) {
  const decision = scene.storyboard?.semanticDecision || {};
  const presentation = scene.presentation || {};
  const visualJob = decision.visualJob || scene.route || scene.family || presentation.state || "claim";
  const semanticRole = decision.semanticRole || scene.family || presentation.state || "claim";
  const hasVerifiedMaterial = Boolean(scene.entityEvidence?.some((item) => item.asset) || scene.layers?.some((layer) => layer.source?.type === "verified-web" && layer.asset));
  const intensity = scene.animationTier === "formal-highlight" ? .82 : scene.family === "direction-convergence" ? .18 : .54;
  return {
    sceneId: scene.beatId || scene.id || `scene-${index + 1}`,
    sourceText: scene.screenText || scene.titleLines?.join("") || "未命名镜头",
    semanticRole,
    visualJob,
    route: routeForScene(scene),
    hasVerifiedMaterial,
    intensity,
    previousFamilyId,
  };
}

function build() {
  if (!fs.existsSync(candidatePath)) throw new Error(`candidate-props-missing:${candidatePath}`);
  const candidate = readJson(candidatePath);
  if (candidate.contract !== "A1MicrobeatLayeredFullPlan/v1") throw new Error(`unexpected-candidate-contract:${candidate.contract}`);
  const authorityShaBefore = shaFile(path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json"));
  const inputs = [];
  let previousFamilyId = null;
  for (const [index, scene] of (candidate.scenes || []).entries()) {
    const input = semanticInput(scene, index, previousFamilyId);
    inputs.push(input);
    // The compiler intentionally keeps only its own selected family as continuity context.
    previousFamilyId = null;
  }
  const plan = compileA1VisualProductionSystem(inputs, {visualMasterId: "july1-retro-print-archive-wireframe-v1", visualMasterStatus: "candidate-review-only"});
  const report = {
    contract: "A1VisualProductionSystemBuildReport/v1",
    phaseId,
    status: "PASS",
    source: {candidateProps: path.relative(root, candidatePath), candidatePropsSha256: shaFile(candidatePath), currentAuthorityPropsSha256Before: authorityShaBefore, currentAuthorityPropsSha256After: shaFile(path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json")), currentAuthorityUnchanged: authorityShaBefore === shaFile(path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json"))},
    system: {contract: plan.contract, systemId: plan.systemId, visualMaster: plan.visualMaster, sourceOfTruth: plan.sourceOfTruth},
    summary: plan.summary,
    familyCounts: Object.fromEntries(plan.scenes.reduce((counts, scene) => counts.set(scene.familyId, (counts.get(scene.familyId) || 0) + 1), new Map())),
    fontCounts: Object.fromEntries(plan.scenes.reduce((counts, scene) => counts.set(scene.typography.fontId, (counts.get(scene.typography.fontId) || 0) + 1), new Map())),
    gates: plan.gates,
    rejectIf: ["one-off-shot-patch", "unlicensed-font-promoted", "baked-copy-promoted", "unverified-evidence-promoted", "family-chosen-by-hxx-id"],
  };
  fs.mkdirSync(artifactDir, {recursive: true});
  fs.mkdirSync(publicDir, {recursive: true});
  writeJson(path.join(artifactDir, "system-plan.json"), plan);
  writeJson(path.join(publicDir, "system-plan.json"), plan);
  writeJson(path.join(artifactDir, "report.json"), report);
  writeJson(path.join(publicDir, "report.json"), report);
  console.log(JSON.stringify({status: report.status, phaseId, summary: report.summary, familyCounts: report.familyCounts, fontCounts: report.fontCounts, currentAuthorityUnchanged: report.source.currentAuthorityUnchanged, publicPlan: `/generated/system-line/${phaseId}/system-plan.json`}, null, 2));
}

try { build(); } catch (error) { console.error(error); process.exitCode = 1; }
