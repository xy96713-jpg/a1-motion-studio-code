#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {buildStoryboardPixelConsistencyAudit, approvedCurrentDesignPixelBinding} from "../apps/studio-next/src/lib/a1-storyboard-pixel-consistency-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const current = buildStoryboardPixelConsistencyAudit(workspace, {now: "2026-08-15T00:00:00.000Z"});
assert.equal(current.contract, "A1StoryboardPixelConsistencyAudit/v1");
assert.equal(current.shotCount, workspace.article.shotCount);

const forged = structuredClone(workspace);
const ed01 = forged.production.creatorPackagingProjectOverrides.entries.find((item) => item.shotId === "ED-01");
ed01.packageDecision = "NO_PACKAGE";
ed01.reason = "explicit-user-presenter-clean";
delete ed01.userDirectiveEvidence;
const forgedAudit = buildStoryboardPixelConsistencyAudit(forged, {now: "2026-08-15T00:00:00.000Z"});
assert.ok(forgedAudit.items.find((item) => item.shotId === "ED-01").failures.includes("USER_OVERRIDE_EVIDENCE_INVALID"));

const titleMismatch = structuredClone(workspace);
const plan = titleMismatch.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-16");
const raw = titleMismatch.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === "ED-16" && item.artifact?.sha256 === plan.provisionalWholeFilmBoardSelection.artifact.sha256);
titleMismatch.production.canonicalCreatorPackagingSequence.decisions.find((item) => item.shotId === "ED-16").requiredFormalText = ["不存在的标题"];
raw.semanticPixelAudit.ocrText = "材料不够 角度不清 泛泛而谈";
const titleAudit = buildStoryboardPixelConsistencyAudit(titleMismatch, {now: "2026-08-15T00:00:00.000Z"});
assert.ok(titleAudit.items.find((item) => item.shotId === "ED-16").failures.includes("REQUIRED_FORMAL_TEXT_MISSING:不存在的标题"));

const hash = crypto.createHash("sha256").update("quoted user direction").digest("hex");
assert.equal(hash.length, 64);
console.log(JSON.stringify({contract: "A1StoryboardPixelConsistencyTest/v1", status: "PASS", currentStatus: current.status, checks: {unverifiedUserOverrideBlocked: true, requiredFormalTextMismatchBlocked: true, dynamicShotCount: true}}, null, 2));

const adopted={current:true,authoritativeOverride:true,route:"PACKAGE_LOOK_MASTER",presentationMode:"EXPLAINER",sourceText:"exact",versionId:"new",artifactSha256:"a".repeat(64),artifactPublicUrl:"/bound.png",designApproval:{status:"APPROVED",scope:"SINGLE_SHOT_STATIC_DIRECTION",candidateSha256:"a".repeat(64),userDirective:{quote:"confirmed"}},approvedDesignCandidate:{sha256:"a".repeat(64),publicUrl:"/bound.png",styleBriefSha256:"b".repeat(64)},motionDesignContract:{motionDesignSha256:"c".repeat(64)},motionReviewReceipt:{status:"READY_FOR_USER_REVIEW",productionAdmission:false,source:{versionId:"new",artifactSha256:"a".repeat(64),motionDesignSha256:"c".repeat(64)},validation:{decoded:true,finalFrameMatchesSource:true}}};
const adoptedTimeline={artifactSha256:adopted.artifactSha256,previewPublicUrl:adopted.artifactPublicUrl,route:adopted.route,sourceText:"exact"};
assert.equal(approvedCurrentDesignPixelBinding(adopted,adoptedTimeline,"exact"),true);
for(const patch of [{versionId:"old"},{artifactSha256:"d".repeat(64)},{designApproval:{...adopted.designApproval,status:"NOT_APPROVED"}},{motionReviewReceipt:{...adopted.motionReviewReceipt,validation:{decoded:true,finalFrameMatchesSource:false}}},{presentationMode:"FULLSCREEN_TYPOGRAPHY_TAKEOVER"}])assert.equal(approvedCurrentDesignPixelBinding({...adopted,...patch},adoptedTimeline,"exact"),false);
assert.equal(approvedCurrentDesignPixelBinding(adopted,adoptedTimeline,"changed copy"),false);

assert.equal(approvedCurrentDesignPixelBinding({...adopted,presentationMode:"FULLSCREEN_WORKBENCH_OPENING"},adoptedTimeline,"exact"),false);
assert.equal(approvedCurrentDesignPixelBinding({...adopted,presentationMode:"FULLSCREEN_WORKBENCH_OPENING",approvedDesignCandidate:{...adopted.approvedDesignCandidate,sourceKind:"IMAGEGEN_WITH_LOCAL_TYPOGRAPHY"}},adoptedTimeline,"exact"),true);
