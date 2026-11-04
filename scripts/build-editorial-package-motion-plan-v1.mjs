#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertApprovalOwnershipDecision, classifyApprovalOwnership} from "../apps/studio-next/src/lib/a1-approval-ownership-policy-v1.mjs";
import {assertEditorialPackageMotionPlan, compileEditorialPackageMotionPlan} from "../apps/studio-next/src/lib/a1-editorial-package-motion-plan-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const candidateRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/editorial-shot-director-v1/candidate-v3");
const staticManifestFile = path.join(candidateRoot, "manifest.json");
const representativeMotionFile = path.join(candidateRoot, "representative-motion-v1/manifest.json");
const outputFile = path.join(candidateRoot, "full-film-motion-plan-v1.json");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const staticCandidate = JSON.parse(fs.readFileSync(staticManifestFile, "utf8"));
const representativeMotion = JSON.parse(fs.readFileSync(representativeMotionFile, "utf8"));
assert(representativeMotion.status === "AGENT_REPRESENTATIVE_MOTION_ACTUAL_PIXEL_PASS", "full-motion-plan-representative-proof-not-pass");
const validatedPresenterGrammars = representativeMotion.shots.filter((shot) => shot.actualPixelReview === "PASS").map((shot) => shot.grammar);
const authorizationDecision = assertApprovalOwnershipDecision(classifyApprovalOwnership("COMPILE_FULL_FILM_MOTION_PLAN"));
const plan = assertEditorialPackageMotionPlan(compileEditorialPackageMotionPlan({staticCandidate, validatedPresenterGrammars, authorizationDecision}));
plan.sourceFiles = {
  staticCandidateFileSha256: sha256File(staticManifestFile),
  representativeMotionFileSha256: sha256File(representativeMotionFile),
  representativeMotionManifestSha256: representativeMotion.manifestSha256,
};
const {planSha256: priorSha, ...bodyWithSource} = plan;
plan.planSha256 = crypto.createHash("sha256").update(JSON.stringify(bodyWithSource)).digest("hex");
fs.writeFileSync(outputFile, `${JSON.stringify(plan, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: plan.status, planSha256: plan.planSha256, priorCompilerSha256: priorSha, outputFile: path.relative(root, outputFile), audit: plan.audit, globalPolicy: plan.globalPolicy}, null, 2)}\n`);
