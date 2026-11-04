#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {persistGoldenFilmVisualSystemMaturityRun} from "./run-golden-film-visual-system-maturity-v1.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const runPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const workspace = readProjectWorkspace(appRoot);
const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
const next = structuredClone(run);
const binding = workspace.production.creatorPaletteShotBindingManifest;
const repair = workspace.production.incrementalRepairManifestAuthority;
next.inputHashes = {...next.inputHashes, bindingManifestSha256: binding?.manifestSha256 || null, repairManifestSha256: repair?.manifestSha256 || null, boardSha256: workspace.production.shotIntelligence.wholeFilmStaticBoard?.sha256 || null};
next.phases.PHASE_3.inputHashes = {...next.phases.PHASE_3.inputHashes, repairManifestSha256: repair?.manifestSha256 || null, bindingManifestSha256: binding?.manifestSha256 || null};
if (next.phases.PHASE_3.queuedJobIds?.length) next.phases.PHASE_3.currentWaveJobIds = [...next.phases.PHASE_3.queuedJobIds];
next.phases.PHASE_4.inputHashes = {...next.phases.PHASE_4.inputHashes, bindingManifestSha256: binding?.manifestSha256 || null, repairManifestSha256: repair?.manifestSha256 || null, boardSha256: workspace.production.shotIntelligence.wholeFilmStaticBoard?.sha256 || null};
next.phases.PHASE_4.deterministicPassCount = binding?.passCount || 0;
next.phases.PHASE_4.packageCount = binding?.packageShotCount || next.phases?.PHASE_0?.summary?.packageCount || 0;
const primitiveSwitchExhausted = next.overallStatus === "ED15_OVERLAY_PRIMITIVE_SWITCH_EXHAUSTED";
const taxonomyReauthorExhausted = next.overallStatus === "ED15_OVERLAY_TAXONOMY_REAUTHOR_EXHAUSTED";
next.phases.PHASE_4.failureReasons = binding?.passCount === binding?.packageShotCount ? [] : [taxonomyReauthorExhausted ? "ED15_OVERLAY_TAXONOMY_REAUTHOR_NO_PASS" : primitiveSwitchExhausted ? "ED15_OVERLAY_PRIMITIVE_SWITCH_NO_PASS" : "CURRENT_PACKAGE_BINDING_NOT_ALL_PASS"];
if (primitiveSwitchExhausted || taxonomyReauthorExhausted) next.phases.PHASE_4.nextAction = next.nextAction;
if (primitiveSwitchExhausted || taxonomyReauthorExhausted) {
  next.decisionContract = {...next.decisionContract, nextAction: next.nextAction};
  next.artDirectionContract = {...next.artDirectionContract, nextAction: next.nextAction};
  next.phases.PHASE_1 = {...next.phases.PHASE_1, nextAction: next.nextAction};
  next.phases.PHASE_2 = {...next.phases.PHASE_2, nextAction: next.nextAction};
}
next.generatedAt = new Date().toISOString();
next.maturityRunSha256 = sha256({...next, maturityRunSha256: undefined});
const persisted = persistGoldenFilmVisualSystemMaturityRun(next);
console.log(JSON.stringify({status: "PASS", maturityRunSha256: next.maturityRunSha256, bindingManifestSha256: binding?.manifestSha256, repairManifestSha256: repair?.manifestSha256, phase4PassCount: next.phases.PHASE_4.deterministicPassCount, persisted}, null, 2));
