#!/usr/bin/env node
// Objective visual rejection only. No media writer, ImageGen, or Resolve mutation.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const reviewDir = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/static-package-review-v7");
const manifestPath = path.join(reviewDir, "manifest.json");
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const manifestSha256 = sha(manifestBytes);
const contactSheetSha256 = sha(fs.readFileSync(path.join(reviewDir, "contact-sheet.png")));

const rows = [
  ["ED-07","OVERLAY_ALPHA","same torn-paper title template; semantic object absent","icon-atlas-interface-language","single semantic pixel object + transparent local mask"],
  ["ED-08","OVERLAY_ALPHA","same torn-paper title template; AI claim needs a distinct object","retro-computer-window","one diagnostic object, no HUD"],
  ["ED-09","OVERLAY_ALPHA","same torn-paper title template; contrast relation is not visualized","one-bit-character-object","two-item contrast object, one focal relation"],
  ["ED-10","FULLSCREEN_PACKAGE","blank paper and one line; high-completion waste draft is not the visual actor","dithered-editorial-poster","discarded draft / revision residue as primary actor"],
  ["ED-12","FULLSCREEN_PACKAGE","five empty cards read as generic comparison dashboard","retro-computer-window","one connected comparison field, not cards"],
  ["ED-13","OVERLAY_ALPHA","same torn-paper title template; oral contrast needs an image relationship","pixel-type-actor","one paired semantic object on transparent local mask"],
  ["ED-14","FULLSCREEN_PACKAGE","evidence actor is under-hierarchized and palette is warm by default","icon-atlas-interface-language","verified source page as dominant evidence actor"],
  ["ED-16","FULLSCREEN_PACKAGE","three-card horizontal layout is generic","scanline-crt-signal","one diagnostic interface with three checkpoints"],
  ["ED-17","FULLSCREEN_PACKAGE","reuses the same machine workflow image as ED-19/31","isometric-machine-collage","three-step causal movement with distinct topology"],
  ["ED-19","FULLSCREEN_PACKAGE","reuses the same machine workflow image as ED-17/31","modular-pixel-infographic","four-stage editorial system, not cards"],
  ["ED-31","FULLSCREEN_PACKAGE","reuses the same machine workflow image; template-like","one-bit-character-object","paper-ribbon causal transformation, not machine cards"],
  ["ED-33","OVERLAY_ALPHA","same torn-paper title template; semantic object absent","pixel-type-actor","single semantic pixel object + transparent local mask"],
  ["ED-34","OVERLAY_ALPHA","same torn-paper title template; directional claim needs an object anchor","icon-atlas-interface-language","one directional semantic object, no floating accessories"],
];
const repairMatrix = rows.map(([shotId, route, issue, primaryFamily, compositionSystem]) => ({shotId, route, visualVerdict:"VISUAL_REJECTED", issue, currentFingerprint: route === "OVERLAY_ALPHA" ? "torn-paper-title-atlas|warm-paper|rectangle-text" : ["ED-17","ED-19","ED-31"].includes(shotId) ? "workflow-machines|warm-paper|horizontal-process" : "warm-paper|blue-black|generic-panel", proposedV8:{primaryFamily, compositionSystem, paletteSystem:"neutral-white/cool-gray/charcoal + cobalt accent", typography:"Fusion Pixel for key phrase/verdict; support font for explanation"}, holdFrameCompositeProof: route === "OVERLAY_ALPHA" ? "REQUIRED_SEPARATE_COMPATIBILITY_PROOF" : "NOT_APPLICABLE_TO_CLEAN_PACKAGE", productionAssetContainsBasePixels:false}));
const now = new Date().toISOString();
const body = {contract:"A1ObjectiveVisualRejectionAndV8RepairMatrix/v1", status:"VISUAL_REPAIR_REQUIRED", current:true, reviewArtifact:"static-package-review-v7", rejectedArtifacts:["static-package-review-v7","canonical-package-export-v1"], manifestSha256, contactSheetSha256, shotCount:13, visualVerdict:"VISUAL_REJECTED", hardFailures:["OVERLAY_TEMPLATE_REPETITION_AND_MISSING_HOLD_FRAME_COMPATIBILITY","ED17_ED19_ED31_SHARED_WORKFLOW_FINGERPRINT","ED10_SEMANTIC_ACTOR_MISSING","ED12_GENERIC_FIVE_CARD_COMPARISON","ED16_GENERIC_THREE_CARD_LAYOUT","FILM_WIDE_WARM_PARCHMENT_BIAS_WITHOUT_SEMANTIC_REASON","FUSION_PIXEL_PRESENT_BUT_HIERARCHY_AND_TYPESCALE_IMMATURE"], visualStandard:{profile:"minimal-retro-pixel-editorial-v1",defaultCanvas:"neutral-white/cool-gray/charcoal",accentPolicy:"one-accent",imageGenLed:true,minimumFullscreenPrimaryFamilies:4,minimumFullscreenCompositionSystems:3}, canaryShotIds:["ED-13","ED-10","ED-31"], nextAction:"PREPARE_V8_VISUAL_CANARY", userVisualApproval:"NOT_APPROVED", productionWired:false, finalFilm:false, resolveInsertAuthorized:false, assemblyStatus:"NOT_CREATED", mediaGenerationPerformed:false, imageGenerationPerformed:false, resolveProjectMutationPerformed:false, repairMatrix, reviewedAt:now};
const report = {...body, auditSha256:sha(Buffer.from(JSON.stringify(body)))};

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const history = [...(Array.isArray(current.production.staticPackageReview?.history) ? current.production.staticPackageReview.history : []), ...(current.production.staticPackageReview ? [current.production.staticPackageReview] : [])];
  next.production.staticPackageReview = {...report, history, productionArtifact:false, packagingDeliverable:false};
  if (current.production.canonicalPackageExport) next.production.canonicalPackageExport = {...current.production.canonicalPackageExport, current:false, status:"HISTORY_VISUAL_REJECTED_V7", productionArtifact:false, packagingDeliverable:false};
  next.production.objectiveVisualGate = {...(current.production.objectiveVisualGate || {}), current:false, status:"VISUAL_REPAIR_REQUIRED", userVisualApproval:"NOT_APPROVED"};
  next.production.packagingDeliverySourceProjection = {...(current.production.packagingDeliverySourceProjection || {}), status:"VISUAL_REPAIR_REQUIRED", productionReadyShotCount:0, productionAdmissionAllowed:false, visualRepairMatrixSha256:report.auditSha256, shots:repairMatrix.map((item)=>({shotId:item.shotId,route:item.route,status:"VISUAL_REPAIR_REQUIRED",productionReady:false,referenceOnly:true}))};
  next.production.formalPackagingTypographyAdmission = {...(current.production.formalPackagingTypographyAdmission || {}), actualPixelCoverage:{status:"PENDING_AUTHORIZED_V8_CANARY",coveredNodeCount:0,totalNodeCount:28,priorV7ProofPreserved:true}, productionAdmissionAllowed:false};
  next.production.productionWired = false; next.production.aeLevelProven = false;
  const event = createProductionEvent({workspace:current, action:"record-static-package-v7-visual-rejection", targetId:"STATIC_PACKAGE_REVIEW_V7", payload:{auditSha256:report.auditSha256,status:report.status,mediaGenerationPerformed:false,resolveProjectMutationPerformed:false}});
  return {...persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next, now), {event, expectedWorkspaceSha256:current.workspaceSha256, commitId:`static-package-v7-visual-rejection-${now.replace(/[-:.TZ]/gu,"").slice(0,14)}`, files:{"static-package-review-v7/visual-rejection-audit.json":report,"static-package-review-v8/v8-repair-matrix.json":{contract:"A1V8VisualRepairMatrix/v1",status:"CANARY_REQUIRED",sourceAuditSha256:report.auditSha256,canaryShotIds:report.canaryShotIds,shots:repairMatrix}}}), report};
});
console.log(JSON.stringify({status:result.report.status,auditSha256:result.report.auditSha256,manifestSha256,contactSheetSha256,shotCount:13,canaryShotIds:result.report.canaryShotIds,workspaceSha256:result.workspaceSha256,transitionSha256:result.transitionSha256,mediaGenerationPerformed:false,imageGenerationPerformed:false,resolveProjectMutationPerformed:false},null,2));
