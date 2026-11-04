#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "shot-01-vibe-coding-workbench-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const plan = JSON.parse(fs.readFileSync(path.join(publicDir, "render-plan.json"), "utf8"));
const build = JSON.parse(fs.readFileSync(path.join(publicDir, "build-report.json"), "utf8"));
const render = JSON.parse(fs.readFileSync(path.join(publicDir, "render-report.json"), "utf8"));
const componentPath = path.join(root, "remotion-renderer/src/Shot01VibeCodingWorkbenchV1.tsx");
const component = fs.readFileSync(componentPath, "utf8");
const authorityPath = path.join(root, "remotion-renderer/src/generated/editorialDocumentaryPilotProps.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const failures = [];
const check = (id, value) => { if (!value) failures.push(id); };

check("true-first-beat", plan.sourceBeatId === "H01-B01" && plan.sourceText === "Hi，我用 vibe coding 做了一款智能写作工作台。");
check("exact-source-window", plan.sourceWindowMs?.[0] === 0 && plan.sourceWindowMs?.[1] === 3353 && plan.durationInFrames === 101);
check("source-bound", build.source?.materialSha256 === plan.sourceMaterial.sha256 && build.source?.audioSha256 === plan.audio.sha256);
check("independent-topology", plan.primaryActor === "vibe-coding-type-mask" && plan.topology === "type-mask-to-real-workbench-sentence");
check("causal-beats", plan.beats?.map((beat) => beat.id).join(",") === "spoken-entry,type-mask-open,workbench-lock,sentence-hold");
check("word-actors", component.includes("HeroWord") && component.includes("plan.copy.heroWords[0]") && component.includes("plan.copy.heroWords[1]"));
check("real-material-reveal", component.includes("plan.sourceMaterial.assetUri") && component.includes("backgroundClip: \"text\"") && component.includes("clipPath"));
check("no-rejected-primitives", !/SELECTED SENTENCE|LOCAL PATCH|REAL ACTION|SOURCE-BOUND|target-reticle|generic-bottom-strip/u.test(component));
check("audio-included", component.includes("<Audio") && render.video?.audioIncluded === true);
check("duration", render.remotion?.durationInFrames === 101 && render.video?.durationSec > 3.3 && render.video?.durationSec < 3.4);
check("render-artifacts", [render.video, render.contactSheet, render.reviewStrip].every((artifact) => { const file = path.join(publicDir, path.basename(artifact.publicUrl)); return fs.existsSync(file) && shaFile(file) === artifact.sha256; }));
check("proof-frames", render.proofFrames?.length === 6 && render.proofFrames.every((frame) => { const file = path.join(publicDir, "proof-frames", `${frame.id}.png`); return fs.existsSync(file) && shaFile(file) === frame.sha256; }));
check("authority-unchanged", build.currentAuthority?.unchanged === true && render.currentAuthority?.unchanged === true && shaFile(authorityPath) === render.currentAuthority.sha256After);
check("shot-02-locked", plan.gates?.shot02DesignAllowed === false && render.gates?.shot02DesignAllowed === false && render.gates?.h47ExpansionAllowed === false);

const report = {
  contract: "A1Shot01VibeCodingWorkbenchAuditReport/v1",
  phaseId,
  status: failures.length ? "FAIL" : "READY_FOR_USER_SHOT01_REVIEW",
  failures,
  source: build.source,
  design: {visualJob: plan.visualJob, primaryActor: plan.primaryActor, handoffActor: plan.handoffActor, topology: plan.topology, beatCount: plan.beats.length, forbiddenPrimitives: plan.forbiddenPrimitives},
  artifacts: {video: render.video, contactSheet: render.contactSheet, reviewStrip: render.reviewStrip},
  deprecatedCandidate: {phaseId: "shot-01-selection-rewrite-v1", reason: "WRONG_SOURCE_BEAT_H01_B02_CONTENT"},
  truthBoundary: {shotSpecificDesign: true, userApproved: false, systemFamilyPromoted: false, currentAuthorityUnchanged: render.currentAuthority.unchanged},
  gates: {userShot01Approval: "PENDING", shot02DesignAllowed: false, familyAbstractionAllowed: false, rendererAdoptionAllowed: false, h47ExpansionAllowed: false, nextAction: "show only the true H01-B01 shot to the user and wait for approval or one concrete revision note"},
};
writeJson(path.join(publicDir, "audit-report.json"), report);
writeJson(path.join(artifactDir, "audit-report.json"), report);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
