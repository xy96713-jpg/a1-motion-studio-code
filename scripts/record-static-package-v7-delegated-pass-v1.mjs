#!/usr/bin/env node
// Hash-bound delegated system visual pass. It never signs PACKAGE_EXPORT and
// never runs a media writer.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench,recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState,readProjectWorkspace,withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {auditMediaEntrypointAuthorization,assertMediaEntrypointAuthorizationAudit} from "../apps/studio-next/src/lib/a1-media-entrypoint-authorization-v1.mjs";
import {assertApprovedStaticReviewManifest,APPROVED_STATIC_REVIEW_CONTACT_SHEET_SHA256,APPROVED_STATIC_REVIEW_MANIFEST_SHA256} from "../apps/studio-next/src/lib/a1-package-export-contract-v1.mjs";

const root=path.resolve(import.meta.dirname,".."); const appRoot=path.join(root,"apps/studio-next");
const sha=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const manifestPath=path.join(appRoot,"public/generated/system-line/editorial-asset-workbench-v1/static-package-review-v7/manifest.json");
const manifestBytes=fs.readFileSync(manifestPath); const manifest=JSON.parse(manifestBytes.toString("utf8"));
assertApprovedStaticReviewManifest(manifest,sha(manifestBytes));
if(sha(manifestBytes)!==APPROVED_STATIC_REVIEW_MANIFEST_SHA256||manifest.contactSheet.sha256!==APPROVED_STATIC_REVIEW_CONTACT_SHEET_SHA256) throw new Error("delegated-static-pass-v7-hash-binding-invalid");
for(const output of manifest.outputs){const file=path.join(appRoot,"public",output.outputPath.replace(/^\/+/,""));const bytes=fs.readFileSync(file);if(sha(bytes)!==output.sha256)throw new Error(`delegated-static-pass-output-sha-mismatch:${output.shotId}`);}

const result=withProjectLock(appRoot,()=>{
  const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot)); const now=new Date().toISOString();
  const registry=assertMediaEntrypointAuthorizationAudit(auditMediaEntrypointAuthorization({projectRoot:root}));
  if(registry.activeProductionWriterCount!==1) throw new Error("delegated-static-pass-package-export-writer-not-registered");
  const oldProjection=current.production.packagingDeliverySourceProjection || {};
  const shots=(oldProjection.shots||[]).map((shot)=>{const output=manifest.outputs.find((item)=>item.shotId===shot.shotId);if(!output)throw new Error(`delegated-static-pass-shot-missing:${shot.shotId}`);const binding={id:`static-review-v7-${shot.shotId}`,role:"PACKAGE_ASSET",sourceKind:"REVIEWED_STATIC_PACKAGE_PNG",actualSha256:output.sha256,sha256:output.sha256,manifestSha256:sha(manifestBytes),productionReady:true,containsBaseFootage:false,containsPresenterPixels:false,containsMicrophonePixels:false,containsBoomPixels:false,containsAudio:false,containsCaptions:false};return {...shot,status:"SOURCE_ELIGIBLE",eligiblePixelSourceBindings:[binding],unresolvedRequiredMaterials:[],counts:{...(shot.counts||{}),eligiblePixelSourceBindings:1,unresolvedRequiredMaterials:0},productionReady:true};});
  if(shots.length!==13)throw new Error("delegated-static-pass-thirteen-source-projections-required");
  const nodeProofs=manifest.outputs.flatMap((output)=>output.nodePixelProofs.map((proof)=>({shotId:output.shotId,...proof})));
  const alphaProofs=manifest.actualPixelQa.overlayComponentAlphaStats;
  const body={contract:"A1DelegatedObjectiveStaticPackageReview/v1",status:"SYSTEM_VISUAL_APPROVED_DELEGATED",current:true,reviewArtifact:"static-package-review-v7",manifestSha256:sha(manifestBytes),contactSheetSha256:manifest.contactSheet.sha256,implementationSha256:manifest.implementation.implementationSha256,shotCount:13,shotProofs:manifest.outputs.map((output)=>({shotId:output.shotId,route:output.route,sha256:output.sha256,bytes:output.bytes,actualOutputAlphaRange:output.actualOutputAlphaRange})),nodeProofCount:nodeProofs.length,nodeProofs,alphaComponentProofs:alphaProofs,productionArtifact:false,packagingDeliverable:false,externalReleaseAllowed:false,finalFilmRenderAllowed:false,resolveInsertAllowed:false,productionWired:false,assemblyStatus:"NOT_CREATED",userVisualApproval:"NOT_APPROVED",reviewedAt:now};
  const report={...body,auditSha256:sha(Buffer.from(JSON.stringify(body)))};
  const next=structuredClone(current);
  next.production.staticPackageReview={...report,history:[...(Array.isArray(current.production.staticPackageReview?.history)?current.production.staticPackageReview.history:[]),...(current.production.staticPackageReview?[current.production.staticPackageReview]:[])]};
  next.production.packagingDeliverySourceProjection={...oldProjection,status:"PASS",productionReadyShotCount:13,shots,productionAdmissionAllowed:false,sourceReviewManifestSha256:sha(manifestBytes)};
  next.production.formalPackagingTypographyAdmission={...current.production.formalPackagingTypographyAdmission,actualPixelCoverage:{status:"PASS_DELEGATED_SYSTEM_VISUAL_REVIEW",coveredNodeCount:28,totalNodeCount:28,manifestSha256:sha(manifestBytes),nodeProofCount:nodeProofs.length,proofMethod:"CURRENT_STATIC_REVIEW_V7_ACTUAL_NODE_PIXEL_MASKS"},productionAdmissionAllowed:false};
  next.production.mediaEntrypointRegistry=registry;
  next.production.packagingContractArchitectureAudit={...(current.production.packagingContractArchitectureAudit||{}),status:"PASS",codeContractReviewClosed:true,productionWriterImplemented:true,packageExportWriterStatus:"STATIC_REVIEW_APPROVED_PACKAGE_EXPORT_IMPLEMENTED",glyphOutlineCoverage:"28/28",actualPixelCoverage:"28/28_DELEGATED_STATIC_REVIEW_V7",routeSummary:"6_OVERLAY_ALPHA_7_FULLSCREEN_PACKAGE",blockers:["PACKAGE_EXPORT_NOT_AUTHORIZED","UNBOUND_RESOLVE_TIMELINE","RESOLVE_INSERT_NOT_AUTHORIZED"],updatedAt:now};
  next.production.productionWired=false; next.production.aeLevelProven=false;
  const event=createProductionEvent({workspace:current,action:"record-static-package-v7-delegated-pass",targetId:"STATIC_PACKAGE_REVIEW_V7",payload:{auditSha256:report.auditSha256,manifestSha256:report.manifestSha256,contactSheetSha256:report.contactSheetSha256,status:report.status}});
  const saved=persistProjectState(appRoot,recalculateEditorialAssetWorkbench(next,now),{event,expectedWorkspaceSha256:current.workspaceSha256,commitId:`static-package-v7-delegated-pass-${now.replace(/[-:.TZ]/gu,"").slice(0,14)}`,files:{"static-package-review-v7/delegated-pass-audit.json":report}});
  return {...saved,report};
});
console.log(JSON.stringify({status:result.report.status,auditSha256:result.report.auditSha256,manifestSha256:result.report.manifestSha256,contactSheetSha256:result.report.contactSheetSha256,workspaceSha256:result.workspaceSha256,transitionSha256:result.transitionSha256,mediaGenerationPerformed:false,packageExportAuthorizationIssued:false,resolveProjectMutationPerformed:false},null,2));
