#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const planPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-carrier-rhythm-candidate-v1/plan.json");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(`whole-film-carrier-rhythm-candidate-v1:${message}`); };
assert(plan.contract === "A1WholeFilmCarrierRhythmCandidate/v1", "contract");
assert(plan.checks.allThirtyFourShotsCovered && plan.summary.shotCount === 34, "shot-count");
assert(plan.checks.allSixteenScreenEvidenceShotsPreserved && plan.summary.screenEvidenceShotCount === 16, "screen-evidence");
assert(plan.summary.fullscreenScreenCount === 9 && plan.summary.presenterScreenHybridCount === 5 && plan.summary.screenEvidenceCardCount === 2, "screen-carrier-mix");
assert(plan.checks.maximumCarrierRunPass && plan.summary.longestSameCarrierFamilyRun === 2, "carrier-run");
assert(plan.checks.exactlyTwoFullscreenTitleAnchors && plan.summary.fullscreenTitleCount === 2, "title-count");
assert(plan.policy.evidenceRequirementDoesNotImplyFullscreen === true, "evidence-policy");
assert(plan.boundary.candidateOnly && !plan.boundary.motionProduced && plan.boundary.userVisualApproval === "NOT_APPROVED", "boundary");
assert(/^[a-f0-9]{64}$/u.test(plan.sourceBindings.workspace.sha256 || ""), "source-workspace-sha-invalid");
assert(/^[a-f0-9]{64}$/u.test(plan.sourceBindings.phase.sha256 || ""), "source-phase-sha-invalid");
console.log(JSON.stringify({status: "PASS", summary: plan.summary, evidenceRequirementDoesNotImplyFullscreen: true, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"}, null, 2));
