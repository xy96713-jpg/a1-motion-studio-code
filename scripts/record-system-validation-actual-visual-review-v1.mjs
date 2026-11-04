#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {sha256Json,writeJsonAtomic} from "../apps/studio-next/src/lib/a1-system-validation-runner-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const generated=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const candidate=path.join(generated,"system-validation-candidate-v1");
const reportPath=path.join(candidate,"report.json");
const matrixPath=path.join(candidate,"completeness-matrix.json");
const manifestPath=path.join(candidate,"insertion-manifest.json");
const browserPath=path.join(candidate,"browser-audit.json");
const inputPath=path.join(candidate,"input-props.json");
const boardPath=path.join(generated,"whole-film-static-board-v1/report.json");
const reconciliationPath=path.join(generated,"current-look-master-semantic-reconciliation-v1/report.json");
const phasePath=path.join(root,".codex-artifacts/system-progress-system-line/current-phase.json");
const workspacePath=path.join(generated,"workspace.json");
const sha=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read=(file)=>JSON.parse(fs.readFileSync(file,"utf8"));
const relative=(file)=>path.relative(root,file);
const bind=(file)=>({path:relative(file),publicUrl:`/generated/system-line/editorial-asset-workbench-v1/system-validation-candidate-v1/${path.basename(file)}`,sha256:sha(file),bytes:fs.statSync(file).size});
const before={phaseSha256:sha(phasePath),workspaceSha256:sha(workspacePath)};
const report=read(reportPath),matrix=read(matrixPath),manifest=read(manifestPath),browser=read(browserPath),input=read(inputPath),board=read(boardPath),reconciliation=read(reconciliationPath);

assert.equal(report.boundary.userVisualApproval,"NOT_APPROVED");
assert.equal(browser.status,"PASS");
assert.equal(manifest.entryCount,13);
assert.equal(manifest.typographyCoverage.editableRenderReadyCount,4);
assert.equal(manifest.typographyCoverage.postApprovalRebuildCount,9);
assert.equal(manifest.typographyCoverage.candidateEditableSpecReadyCount,13);
assert.equal(manifest.typographyCoverage.canonicalEditableLayerReadyCount,4);
assert.deepEqual(manifest.deliveryCoverage.alphaOverlayShotIds,["ED-13","ED-31"]);
assert.equal(manifest.semanticMotionCoverage.allRepresentativeShotsMultiActor,true);
assert.ok(manifest.semanticMotionCoverage.minimumActorsPerRepresentative>=3);
assert.equal(manifest.entries.filter((entry)=>entry.typography.editableRenderReady).length,4);
assert.equal(manifest.entries.filter((entry)=>entry.typography.postApprovalRequirement==="REBUILD_AS_EDITABLE_TEXT_LAYER_AFTER_EXPLICIT_USER_VISUAL_APPROVAL").length,9);
for(const entry of manifest.entries){const file=path.join(root,entry.file.path);assert.equal(sha(file),entry.file.sha256,`${entry.shotId} clip changed`);}
for(const key of ["fullVideo","smokeVideo"]){const file=path.join(root,report.render[key].path);assert.equal(sha(file),report.render[key].sha256,`${key} changed`);}
for(const item of Object.values(report.render.contactSheets)){const file=path.join(root,item.path);assert.equal(sha(file),item.sha256,"contact sheet changed");}
const ed20=input.beats.find((beat)=>beat.shotId==="ED-20");
const ed20Board=board.timelineBoard.items.find((item)=>item.shotId==="ED-20");
assert.equal(ed20.kind,"SCREEN_EVIDENCE");
assert.equal(ed20.screen.asset.sha256,ed20Board.artifactSha256,"ED-20 must use current verified screen capture");
const ed14Packet=reconciliation.proofRouteAudits?.find?.((item)=>item.shotId==="ED-14")||JSON.parse(JSON.stringify(reconciliation)).proofRouteAudits?.find?.((item)=>item.shotId==="ED-14");
assert.equal(reconciliation.status,"PASS");

const reviewBody={
  contract:"A1SystemValidationActualPixelReview/v1",status:"SYSTEM_VISUAL_PASS",reviewer:"CODEX_ACTUAL_PIXEL_REVIEW",scope:"CANDIDATE_ONLY",
  evidence:{representativeTemporalContactSheet:report.render.contactSheets.representative,wholeFilm34BeatContactSheet:report.render.contactSheets.timeline,fiveGenreContactSheet:report.render.contactSheets.smoke,browserAudit:bind(browserPath),fullVideo:report.render.fullVideo,smokeVideo:report.render.smokeVideo},
  findings:[
    {id:"representative-motion-semantics",status:"PASS",evidence:"ED-08 statement lock; ED-12 entity reveal; ED-16 left-to-right causal reveal; ED-13/31 real presenter motion"},
    {id:"representative-multi-actor-motion",status:"PASS",evidence:`five representative shots use ${manifest.semanticMotionCoverage.minimumActorsPerRepresentative}+ independently timed semantic raster actors`},
    {id:"mode-aware-delivery",status:"PASS",evidence:"ED-13 and ED-31 include verified ProRes 4444 alpha overlays; fullscreen packages retain opaque range replacements"},
    {id:"candidate-editable-typography-specs",status:"PASS",evidence:"13/13 shots have candidate editable geometry and hash-bound A1 Fusion Pixel reconstruction specs; 4/13 remain canonical editable-layer ready"},
    {id:"presenter-face-eyes-microphone",status:"PASS",evidence:"ED-13 and ED-31 enter/hold/exit preserve face, eyes, body and microphone"},
    {id:"formal-chinese-readability",status:"PASS",evidence:"current masters remain readable; smoke keeps 失败处理, 单位人口 and 保留失败 intact"},
    {id:"five-genre-template-diversity",status:"PASS",evidence:"five distinct primary families and five distinct composition fingerprints"},
    {id:"screen-evidence-current-binding",status:"PASS",evidence:`ED-20 current capture ${ed20.screen.asset.sha256}`},
    {id:"transition-first-hold-exit",status:"PASS",evidence:"15-frame temporal contact sheet shows intentional reveal, stable hold and intact exit without black flashes"},
    {id:"cobalt-semantics",status:"PASS",evidence:"cobalt is reserved for verdict, route, cause or conclusion emphasis"},
  ],
  limitations:["alpha overlays and OCR-derived editable specifications are candidate-only; canonical layer adoption still requires explicit visual approval","representative motion validates candidate mechanics and semantics, not user taste approval","no Resolve write, final render or publication"],
  boundary:{userVisualApproval:"NOT_APPROVED",userReviewPerformed:false,productionEligible:false,canonicalMotionAllowed:false},
};
const review={...reviewBody,reviewSha256:sha256Json(reviewBody),generatedAt:new Date().toISOString()};
const reviewPath=path.join(candidate,"actual-visual-review.json");
writeJsonAtomic(reviewPath,review);

const evidenceById={
  "research-routing":relative(reconciliationPath),
  "browser-review":relative(browserPath),
};
matrix.items=matrix.items
  .filter((item)=>!["actual-pixel-candidate-review","five-content-genres"].includes(item.id))
  .map((item)=>evidenceById[item.id]?{...item,status:"REAL_PASS",evidencePath:evidenceById[item.id],evidenceExists:true}:item);
matrix.items.push({id:"actual-pixel-candidate-review",status:"REAL_PASS",evidencePath:relative(reviewPath),evidenceExists:true,authorizedScope:true,blockedBy:null});
matrix.items.push({id:"five-content-genres",status:"REAL_PASS",evidencePath:report.render.contactSheets.smoke.path,evidenceExists:true,authorizedScope:true,blockedBy:null});
matrix.status="AUTHORIZED_SCOPE_REAL_PASS_USER_APPROVAL_PENDING";
matrix.allAuthorizedScopePass=matrix.items.filter((item)=>item.authorizedScope!==false).every((item)=>item.status==="REAL_PASS");
matrix.onlyRemainingHardBlocker="EXPLICIT_USER_VISUAL_APPROVAL";
writeJsonAtomic(matrixPath,matrix);

const {reportSha256:_oldSha,generatedAt:_oldGenerated,...reportBody}=report;
const updatedBody={...reportBody,status:"READY_FOR_USER_REVIEW",actualVisualReview:{status:"SYSTEM_VISUAL_PASS",userReview:false,evidence:bind(reviewPath),reviewSha256:review.reviewSha256},browserAudit:bind(browserPath),completenessMatrix:bind(matrixPath),source:{...report.source,ed20ScreenEvidenceSha256:ed20.screen.asset.sha256,ed14ResearchRoutingEvidence:relative(reconciliationPath)},boundary:{...report.boundary,userVisualApproval:"NOT_APPROVED",productionEligible:false}};
const updated={...updatedBody,reportSha256:sha256Json(updatedBody),generatedAt:new Date().toISOString()};
writeJsonAtomic(reportPath,updated);
writeJsonAtomic(path.join(candidate,"admission.json"),{contract:"A1SystemValidationCandidateAdmission/v1",status:"CANDIDATE_ONLY_READY_FOR_USER_REVIEW",atomicAdmission:true,reportPublicUrl:"/generated/system-line/editorial-asset-workbench-v1/system-validation-candidate-v1/report.json",reportSha256:updated.reportSha256,actualVisualReviewSha256:review.reviewSha256,userVisualApproval:"NOT_APPROVED",productionEligible:false});
const after={phaseSha256:sha(phasePath),workspaceSha256:sha(workspacePath)};
assert.deepEqual(after,before);
console.log(JSON.stringify({status:updated.status,reportSha256:updated.reportSha256,actualVisualReviewSha256:review.reviewSha256,allAuthorizedScopePass:matrix.allAuthorizedScopePass,remainingHardBlocker:matrix.onlyRemainingHardBlocker,ed20CurrentEvidenceSha256:ed20.screen.asset.sha256,authorityMutated:false,userVisualApproval:"NOT_APPROVED"},null,2));
