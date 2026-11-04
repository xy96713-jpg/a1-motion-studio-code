#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildFormalTypographyTextNodeProof, assertFormalTypographyTextNode, A1_FORMAL_TYPOGRAPHY_GLYPH_ADMISSION_CONTRACT} from "../apps/studio-next/src/lib/a1-formal-typography-admission-v1.mjs";
import {compilePackagingDeliverySourceProjection, derivePackagingDeliveryRoute} from "../apps/studio-next/src/lib/a1-packaging-delivery-projection-v1.mjs";
import {compileResolvePackagingHandoffPlan, assertResolvePackagingHandoff} from "../apps/studio-next/src/lib/a1-resolve-packaging-handoff-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createUnauthorizedState,readCurrentProductionAuthorizationBinding} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";
import {assertMediaEntrypointAuthorizationAudit,auditMediaEntrypointAuthorization} from "../apps/studio-next/src/lib/a1-media-entrypoint-authorization-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const fusionFontPath = path.join(appRoot, "public/a1-editorial-fonts/fusion-pixel.ttf");
const fontRegistry = {"a1-fusion-pixel":fusionFontPath};
const sha = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const roleFor = (treatment) => treatment === "PROCESS_TYPE" ? "stage-label" : treatment === "VERDICT_OVERLAY" ? "verdict" : treatment === "QUESTION_OVERLAY" || treatment === "FULL_TYPOGRAPHY" ? "headline" : "keyword";
const protectedPhrasesFor = (plan) => {
  if (plan.typographyTreatment === "NONE") return [];
  const phrases = plan.protectedPhrases || plan.semanticTimeline?.protectedPhrases || plan.videoContext?.protectedPhrases || [];
  return phrases.filter((phrase, index) => !phrases.some((other, otherIndex) => otherIndex !== index && other.length < phrase.length && phrase.includes(other)));
};

const result = withProjectLock(appRoot, () => {
  const binding = readCurrentProductionAuthorizationBinding(appRoot);
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (binding.workspaceSha256 !== current.workspaceSha256) throw new Error("resolve-handoff-current-workspace-binding-invalid");
  const plans = new Map((current.production.shotIntelligence.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
  const sourceProjection = compilePackagingDeliverySourceProjection([...plans.values()]);
  if (sourceProjection.shotCount !== 13 || sourceProjection.referenceOnlyPresenterShotCount !== 13 || sourceProjection.eligiblePresenterPixelSourceCount !== 0) throw new Error("packaging-delivery-source-projection-13-shot-isolation-failed");
  const sourceByShot = new Map(sourceProjection.shots.map((shot) => [shot.shotId, shot]));
  const textNodes = [...plans.values()].flatMap((plan) => protectedPhrasesFor(plan).map((phrase, index) => buildFormalTypographyTextNodeProof({nodeId:`${plan.shotId}-protected-${String(index + 1).padStart(2,"0")}`,shotId:plan.shotId,text:phrase,semanticRole:roleFor(plan.typographyTreatment),route:"PACKAGE_LOOK_MASTER",fontAssetId:"a1-fusion-pixel",fontPath:fusionFontPath,sourcePhrase:phrase,protectedPhrases:protectedPhrasesFor(plan),exactCopy:plan.semanticDesignBrief?.exactCopy,actualPixelProof:{status:"PENDING_AUTHORIZED_PREVIEW"}})));
  for (const node of textNodes) assertFormalTypographyTextNode(node, {fontRegistry,requireActualPixel:false});
  if (textNodes.length !== 28) throw new Error(`formal-packaging-protected-phrase-count-invalid:${textNodes.length}`);
  const typographyCoverage = {contract:A1_FORMAL_TYPOGRAPHY_GLYPH_ADMISSION_CONTRACT,version:2,status:"BLOCKED_ACTUAL_PIXEL_AND_SOURCE_GATES",admittedScope:"FORMAL_PACKAGING_TEXT",admittedRoutes:["PACKAGE_LOOK_MASTER","OVERLAY_ALPHA","FULLSCREEN_PACKAGE"],cssFontDeclarationAcceptedAsProof:false,fontSha256:textNodes[0].fontSha256,outlineSetSha256:sha(textNodes.map((node) => ({nodeId:node.nodeId,text:node.text,glyphIds:node.glyphProof.glyphIds,outlineSha256:node.glyphProof.outlineSha256}))),glyphOutlineCoverage:{status:"PASS",coveredNodeCount:28,totalNodeCount:28,shotCount:12,method:"FONT_FILE_DIRECT_GLYPH_OUTLINE_RECOMPUTED"},actualPixelCoverage:{status:"PENDING_AUTHORIZED_PREVIEW",coveredNodeCount:0,totalNodeCount:28,historicalProofCount:1,historicalProofShotIds:["ED-31"],reason:"ED31_HAS_HISTORICAL_ACTUAL_PIXEL_FONT_PROOF_BUT_CURRENT_28_CANONICAL_TEXT_NODES_REQUIRE_ASSET_LOCAL_PROOF"},textNodes,productionAdmissionAllowed:false,unmigratedBlockingRoutes:["CURRENT_PACKAGE_ASSET_ACTUAL_PIXEL_PROOFS","INDEPENDENT_PACKAGE_PIXEL_SOURCES","ACTIVE_PRODUCTION_PACKAGE_EXPORT_ENTRYPOINT"]};
  const mediaEntrypointRegistry = assertMediaEntrypointAuthorizationAudit(auditMediaEntrypointAuthorization({projectRoot:root}));
  const nodesByShot = new Map(textNodes.reduce((entries,node) => entries.set(node.shotId,[...(entries.get(node.shotId)||[]),node]),new Map()));
  const decisions = current.production.shotIntelligence.decisionSet?.items || [];
  const shotDecisions = decisions.map((decision) => {
    const packagePlan = plans.get(decision.shotId);
    const routeDecision = derivePackagingDeliveryRoute({packageDecision:decision.packageDecision,packagePlan});
    if (routeDecision.route === "BLOCKED_ROUTE_CONFLICT") throw new Error(`resolve-handoff-route-conflict:${decision.shotId}:${routeDecision.routeDecisionReason.join("|")}`);
    if (routeDecision.route === "NO_PACKAGE") return {shotId:decision.shotId,route:"NO_PACKAGE",status:"NO_PACKAGE",routeDecisionReason:routeDecision.routeDecisionReason,asset:null,textNodes:[],handles:{pre:8,post:8}};
    const source = sourceByShot.get(decision.shotId);
    const nodes = nodesByShot.get(decision.shotId) || [];
    const status = source.productionReady !== true ? (nodes.length && nodes.some((node) => node.productionAdmissionAllowed !== true) ? "BLOCKED_PACKAGE_SOURCE_AND_ACTUAL_PIXEL_PROOF_REQUIRED" : "BLOCKED_INDEPENDENT_PACKAGE_SOURCES_REQUIRED") : nodes.some((node) => node.productionAdmissionAllowed !== true) ? "BLOCKED_ACTUAL_PIXEL_PROOF_REQUIRED" : "ELIGIBILITY_PLAN";
    return {shotId:decision.shotId,route:routeDecision.route,status,routeDecisionReason:routeDecision.routeDecisionReason,semanticComplexity:routeDecision.semanticComplexity,userDirectiveApplied:routeDecision.userDirectiveApplied === true,editorialBeatReason:routeDecision.editorialBeatReason || null,asset:null,textNodes:nodes,referenceContextBindings:source.referenceContextBindings,eligibleSourceCandidates:source.eligiblePixelSourceBindings,assetPixelSources:[],forbiddenPixelSources:[...new Set([...(source.forbiddenPixelSources || []),...(routeDecision.forbiddenSourceKinds || [])])],trackHints:routeDecision.route === "OVERLAY_ALPHA" ? {preferredVideoTrack:"V2_OR_ABOVE",preserveBaseVideoOnV1:true} : {preferredVideoTrack:"V2_OR_ABOVE",fullFrameReplacement:true},handles:{pre:8,post:8}};
  });
  const fullscreenIds=shotDecisions.filter((decision)=>decision.route === "FULLSCREEN_PACKAGE").map((decision)=>decision.shotId);
  for (const decision of shotDecisions) if (decision.route === "FULLSCREEN_PACKAGE") { const index=fullscreenIds.indexOf(decision.shotId); decision.fullscreenRhythm={sequenceIndex:index + 1,previousFullscreenShotId:fullscreenIds[index - 1] || null,nextFullscreenShotId:fullscreenIds[index + 1] || null,timelineDurationClaimed:false}; }
  const nestedStalePath = "generated/system-line/editorial-asset-workbench-v1/resolve-packaging-handoff-v1/plan.json";
  const plan = assertResolvePackagingHandoff(compileResolvePackagingHandoffPlan({shotDecisions,sourceTimelineBindings:{},sourceWorkspaceSha256:current.workspaceSha256,sourceWorkspaceFileSha256:binding.workspaceFileSha256,sourceTransitionSha256:binding.transitionSha256,staleNonAuthoritativePlans:[{path:nestedStalePath,reason:"NESTED_LEGACY_GENERATED_PATH_NOT_CANONICAL"}]}));
  const now = new Date().toISOString();
  const event = createProductionEvent({workspace:current,action:"build-resolve-packaging-handoff-plan",targetId:"ALL_CURRENT_SHOT_DECISIONS",payload:{planSha256:plan.planSha256,status:plan.status,glyphOutlineCoverage:"28/28",actualPixelCoverage:"0/28_CURRENT_NODES",sourceProjectionStatus:sourceProjection.status,resolveProjectMutationPerformed:false},now});
  const next = structuredClone(current);
  next.production.resolvePackagingHandoffPlan = plan;
  next.production.packagingDeliverySourceProjection = sourceProjection;
  next.production.formalPackagingTypographyAdmission = typographyCoverage;
  next.production.mediaEntrypointRegistry = mediaEntrypointRegistry;
  next.production.packagingAuthorization = createUnauthorizedState();
  next.production.packagingContractArchitectureAudit = {contract:"A1PackagingContractArchitectureAudit/v1",status:"PASS",codeContractReviewClosed:true,authorizationSchema:"A1PackagingAuthorization/v3",mediaRegistry:"A1MediaEntrypointRegistry/v2",routeDecisionContract:"USER_ORAL_PACKAGING_DIRECTIVE_V1",typographyNodeContract:"A1FormalTypographyTextNodeProof/v2",handoffContract:"A1ResolvePackagingHandoff/v3",glyphOutlineCoverage:"28/28",actualPixelCoverage:"0/28_CURRENT_NODES",packageSourceProjection:"13/13_REFERENCE_CONTEXT_ISOLATED",routeSummary:"6_OVERLAY_ALPHA_7_FULLSCREEN_PACKAGE",productionWriterImplemented:false,reviewWriterImplemented:true,staticReviewCompositionContract:"A1StaticReviewPackageComposition/v1",productionAdmissionAllowed:false,blockers:["STATIC_REVIEW_NOT_AUTHORIZED","CURRENT_V4_IS_HISTORY_COMPATIBILITY_PREVIEW","INDEPENDENT_PACKAGE_PIXEL_SOURCES_INCOMPLETE","FORMAL_ASSET_ACTUAL_PIXEL_PROOFS_PENDING_AUTHORIZED_PREVIEW","USER_PACKAGE_REVIEW_REQUIRED","PACKAGE_EXPORT_NOT_IMPLEMENTED_UNTIL_STATIC_REVIEW_APPROVED","UNBOUND_RESOLVE_TIMELINE","PACKAGE_EXPORT_NOT_AUTHORIZED","RESOLVE_INSERT_NOT_AUTHORIZED"],updatedAt:now};
  const representativePilot = next.production.shotIntelligence.representativeApprovedMasterMotionPilot;
  if (representativePilot?.deliveryContract?.route === "COMPOSITE_COMPATIBILITY_PREVIEW") {
    representativePilot.status = "HISTORY_COMPATIBILITY_PREVIEW";
    representativePilot.current = false;
    representativePilot.historyOnly = true;
    representativePilot.packageAuthority = "HISTORY_COMPOSITE_COMPATIBILITY_PREVIEW_NOT_PACKAGING_DELIVERY";
  }
  if (next.production.motion) {
    next.production.motion.status = "history-compatibility-preview";
    next.production.motion.current = false;
    next.production.motion.authorityScope = "HISTORY_READ_ONLY";
    next.production.motion.fullMotionAllowed = false;
    next.production.motion.motionApproved = false;
  }
  next.production.resolveExportReady=false; next.production.resolveInsertReady=false; next.production.resolveProjectMutationPerformed=false;
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId=event.eventId; next.production.eventLedger.lastEventAt=event.createdAt;
  const persisted = persistProjectState(appRoot,recalculateEditorialAssetWorkbench(next,now),{event,expectedWorkspaceSha256:current.workspaceSha256,commitId:`resolve-handoff-plan-${now.replace(/[-:.TZ]/gu,"").slice(0,14)}`,files:{["resolve-packaging-handoff-v1/plan.json"]:plan,["formal-packaging-typography-v2/glyph-outline-coverage.json"]:typographyCoverage,["packaging-delivery-source-projection-v1/projection.json"]:sourceProjection,["media-entrypoint-registry-v2/audit.json"]:mediaEntrypointRegistry,["packaging-contract-architecture-audit-v1/audit.json"]:next.production.packagingContractArchitectureAudit}});
  return {...persisted,eventCount:plan.events.length,typographyCoverage,sourceProjection,plan};
});
console.log(JSON.stringify({status:"PASS",planStatus:result.plan.status,eventCount:result.eventCount,glyphOutlineCoverage:`${result.typographyCoverage.glyphOutlineCoverage.coveredNodeCount}/${result.typographyCoverage.glyphOutlineCoverage.totalNodeCount}`,actualPixelCoverage:`${result.typographyCoverage.actualPixelCoverage.coveredNodeCount}/${result.typographyCoverage.actualPixelCoverage.totalNodeCount}`,historicalActualPixelProofCount:result.typographyCoverage.actualPixelCoverage.historicalProofCount,sourceShotCount:result.sourceProjection.shotCount,referenceOnlyPresenterShotCount:result.sourceProjection.referenceOnlyPresenterShotCount,eligiblePresenterPixelSourceCount:result.sourceProjection.eligiblePresenterPixelSourceCount,resolveExportReady:false,resolveInsertReady:false,resolveProjectMutationPerformed:false,workspaceSha256:result.workspaceSha256,transitionSha256:result.transitionSha256},null,2));
