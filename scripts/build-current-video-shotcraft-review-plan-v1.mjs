#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {compileVideoShotcraftReviewPlan, assertVideoShotcraftReviewPlan} from "../apps/studio-next/src/lib/a1-video-shotcraft-review-plan-v1.mjs";

const root = path.resolve(import.meta.dirname,"..");
const workspacePath = path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const dryRunPath = path.join(root,"work/video-shotcraft-current-storyboard-dry-run-v1/audit-report.json");
const outputRoot = path.join(root,"work/video-shotcraft-current-review-plan-v1");
const workspace = JSON.parse(fs.readFileSync(workspacePath,"utf8"));
const dryRunAudit = JSON.parse(fs.readFileSync(dryRunPath,"utf8"));
const authority = workspace.production?.shotIntelligence?.currentStoryboardAuthority;
const plan = assertVideoShotcraftReviewPlan(compileVideoShotcraftReviewPlan({authority,dryRunAudit,workspaceSha256:workspace.workspaceSha256}));
fs.mkdirSync(outputRoot,{recursive:true});
fs.writeFileSync(path.join(outputRoot,"review-plan.json"),`${JSON.stringify(plan,null,2)}\n`);
console.log(JSON.stringify({status:"PASS",contract:plan.contract,planSha256:plan.planSha256,summary:plan.summary,output:"work/video-shotcraft-current-review-plan-v1/review-plan.json",productionAdmission:false},null,2));
