#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-carrier-rhythm-static-board-v1/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const surfacePath = path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx");
const surface = fs.readFileSync(surfacePath, "utf8");
const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(`whole-film-carrier-rhythm-static-board-v1:${message}`); };
assert(manifest.contract === "A1WholeFilmCarrierRhythmStaticBoard/v1", "contract");
assert(manifest.summary.shotCount === 34 && manifest.summary.canaryFrameCount === 20 && manifest.summary.timelineExactPresenterFrameCount === 7 && manifest.summary.presenterCardCount === 3 && manifest.summary.unchangedCurrentFrameCount === 7, "frame-counts");
assert(manifest.checks.exactThirtyFourShotOrder && manifest.checks.exactCurrentSemanticWindows, "semantic-order");
assert(manifest.checks.allScreenEvidencePreserved && manifest.checks.allFramesActual960x540, "pixel-evidence");
assert(manifest.checks.longestCarrierFamilyRunAtMostTwo, "carrier-run");
assert(manifest.checks.generatedFormalTextAdded === false && manifest.checks.presenterFaceRegenerated === false, "generation-boundary");
assert(manifest.boundary.candidateOnly && !manifest.boundary.motionProduced && manifest.boundary.userVisualApproval === "NOT_APPROVED", "boundary");
const boardFile = path.join(root, manifest.output.path);
assert(fs.existsSync(boardFile) && sha256File(boardFile) === manifest.output.sha256, "board-sha");
const metadata = await sharp(boardFile).metadata();
assert(metadata.width === manifest.output.width && metadata.height === manifest.output.height, "board-size");
assert(/^[a-f0-9]{64}$/u.test(manifest.sourceBindings.workspace.sha256 || ""), "source-workspace-sha-invalid");
assert(/^[a-f0-9]{64}$/u.test(manifest.sourceBindings.phase.sha256 || ""), "source-phase-sha-invalid");
assert(surface.includes("whole-film-carrier-rhythm-static-board-v1/manifest.json") && surface.includes("data-a1-whole-film-carrier-board"), "surface");
console.log(JSON.stringify({status: "PASS", shotCount: 34, canaryFrameCount: 20, timelineExactPresenterFrameCount: 7, presenterCardCount: 3, unchangedCurrentFrameCount: 7, luminanceCounts: manifest.summary.luminanceCounts, longestSameLuminanceBucketRun: manifest.summary.longestSameLuminanceBucketRun, nearDuplicatePairCount: manifest.summary.nearDuplicatePairCount, boardSha256: manifest.output.sha256, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"}, null, 2));
