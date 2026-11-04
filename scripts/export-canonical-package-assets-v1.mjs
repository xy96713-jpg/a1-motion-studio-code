#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {enforceMediaEntrypointAuthorization} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";
import {buildPackageExportImplementationBinding} from "../apps/studio-next/src/lib/a1-package-export-implementation-binding-v1.mjs";
import {assertApprovedStaticReviewManifest,assertUnboundResolvePackagingHandoff,buildCanonicalPackageExportManifest,buildUnboundResolvePackagingHandoff,writeAtomicWithoutOverwrite} from "../apps/studio-next/src/lib/a1-package-export-contract-v1.mjs";
import {preflightCanonicalPackageWriter} from "../apps/studio-next/src/lib/a1-canonical-package-writer-preflight-v1.mjs";
const sha=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const root=path.resolve(import.meta.dirname,".."); const appRoot=path.join(root,"apps/studio-next");
const implementation=buildPackageExportImplementationBinding(root);
const binding=enforceMediaEntrypointAuthorization({appRoot,stage:"PACKAGE_EXPORT",entrypointId:"system-line-canonical-package-export-v1",targetId:"CURRENT_SYSTEM_LINE_CANONICAL_PACKAGE_EXPORT",outputRoute:"ROUTE_DECISION_REQUIRED",implementationSha256:implementation.implementationSha256});
if(process.env.A1_EXECUTE_MEDIA_WRITER!=="1") throw new Error("canonical-package-export-writer-execution-intent-required");
const preflight=preflightCanonicalPackageWriter({workspace:binding.workspace,stage:"PACKAGE_EXPORT",registry:binding.workspace.production.mediaEntrypointRegistry,projectRoot:root});
if(preflight.status!=="READY_WHEN_PACKAGE_EXPORT_AUTHORIZED") throw new Error(`canonical-package-export-preflight-blocked:${preflight.blockers.join("|")}`);
const reviewManifestPath=path.join(appRoot,"public/generated/system-line/editorial-asset-workbench-v1/static-package-review-v7/manifest.json");
const reviewManifestBytes=fs.readFileSync(reviewManifestPath); const reviewManifest=JSON.parse(reviewManifestBytes.toString("utf8"));
assertApprovedStaticReviewManifest(reviewManifest,sha(reviewManifestBytes));
const outputRoot=path.join(appRoot,"public/generated/system-line/editorial-asset-workbench-v1/canonical-package-export-v1");
const outputs=[];
for(const reviewed of reviewManifest.outputs){
  const sourceFile=path.join(appRoot,"public",reviewed.outputPath.replace(/^\/+/,""));
  const sourceBytes=fs.readFileSync(sourceFile);
  if(sha(sourceBytes)!==reviewed.sha256) throw new Error(`canonical-package-export-source-sha-mismatch:${reviewed.shotId}`);
  const outputPath=path.join(outputRoot,`${reviewed.shotId}.png`); const writeDisposition=writeAtomicWithoutOverwrite(outputPath,sourceBytes);
  const outputBytes=fs.readFileSync(outputPath); if(sha(outputBytes)!==reviewed.sha256||outputBytes.length!==sourceBytes.length) throw new Error(`canonical-package-export-parity-failed:${reviewed.shotId}`);
  outputs.push({shotId:reviewed.shotId,route:reviewed.route,format:reviewed.route==="OVERLAY_ALPHA"?"RGBA":"OPAQUE",outputPath:`/generated/system-line/editorial-asset-workbench-v1/canonical-package-export-v1/${reviewed.shotId}.png`,sourceReviewOutputPath:reviewed.outputPath,sourceReviewOutputSha256:reviewed.sha256,sha256:sha(outputBytes),bytes:outputBytes.length,writeDisposition,routeDecisionReason:reviewed.routeDecisionReason||["approved-static-review-route"],visibleTextNodes:reviewed.visibleTextNodes,nodePixelProofs:reviewed.nodePixelProofs,bitmapCandidateId:reviewed.bitmapCandidateId||null,bitmapSha256:reviewed.bitmapSha256||null,containsBaseFootage:false,containsPresenterPixels:false,containsMicrophonePixels:false,containsBoomPixels:false,containsAudio:false,containsCaptions:false,resolveInsertEligible:true});
}
const exportedAt=new Date().toISOString();
const exportManifest=buildCanonicalPackageExportManifest({reviewManifestSha256:sha(reviewManifestBytes),contactSheetSha256:reviewManifest.contactSheet.sha256,implementationSha256:implementation.implementationSha256,workspaceSha256:binding.workspaceSha256,workspaceFileSha256:binding.workspaceFileSha256,transitionSha256:binding.transitionSha256,outputs,exportedAt});
const handoff=assertUnboundResolvePackagingHandoff(buildUnboundResolvePackagingHandoff({exportManifest,exportedAt}));
writeAtomicWithoutOverwrite(path.join(outputRoot,"manifest.json"),Buffer.from(`${JSON.stringify(exportManifest,null,2)}\n`));
writeAtomicWithoutOverwrite(path.join(outputRoot,"resolve-packaging-handoff.json"),Buffer.from(`${JSON.stringify(handoff,null,2)}\n`));
console.log(JSON.stringify({status:exportManifest.status,outputCount:outputs.length,manifestPath:`/generated/system-line/editorial-asset-workbench-v1/canonical-package-export-v1/manifest.json`,handoffPath:`/generated/system-line/editorial-asset-workbench-v1/canonical-package-export-v1/resolve-packaging-handoff.json`,mediaGenerationPerformed:true,baseFootageIncluded:false,resolveProjectMutationPerformed:false},null,2));
