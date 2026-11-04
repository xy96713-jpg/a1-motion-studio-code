#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "shot-01-selection-rewrite-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const plan = JSON.parse(fs.readFileSync(path.join(publicDir, "render-plan.json"), "utf8"));
const build = JSON.parse(fs.readFileSync(path.join(publicDir, "build-report.json"), "utf8"));
const render = JSON.parse(fs.readFileSync(path.join(publicDir, "render-report.json"), "utf8"));
const componentPath = path.join(root, "remotion-renderer/src/Shot01SelectionRewriteV1.tsx");
const component = fs.readFileSync(componentPath, "utf8");
const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const failures = [];
const check = (id, value) => { if (!value) failures.push(id); };

check("source-beat", plan.sourceBeatId === "H01-B01" && plan.sourceText === "划一下就能改");
check("source-bound", build.source?.assetSha256 === plan.sourceMaterial.sha256 && plan.sourceMaterial.provenance.startsWith("Real current"));
check("single-primary-actor", plan.primaryActor === "real-selected-sentence" && plan.topology === "full-screen-source-to-inline-rewrite");
check("causal-beats", plan.beats?.map((beat) => beat.id).join(",") === "source-push,click-action,inline-rewrite,evidence-hold");
check("forbidden-primitives", ["detached-title", "hud-label", "annotation-line", "target-reticle", "desk-plate", "floating-card"].every((item) => plan.forbiddenPrimitives.includes(item)));
check("no-rejected-hud-copy", !/SELECTED SENTENCE|LOCAL PATCH|REAL ACTION|EVIDENCE PUSH|data-motion-actor-id/u.test(component));
check("inline-copy", component.includes("plan.copy.selectedOriginal") && component.includes("plan.copy.rewritten") && component.includes("plan.copy.action"));
check("duration", render.remotion?.durationInFrames === 166 && render.video?.durationSec > 5 && render.video?.durationSec < 6);
check("render-artifacts", [render.video, render.contactSheet, render.reviewStrip].every((artifact) => { const file = path.join(publicDir, path.basename(artifact.publicUrl)); return fs.existsSync(file) && shaFile(file) === artifact.sha256; }));
check("proof-frames", render.proofFrames?.length === 6 && render.proofFrames.every((frame) => { const file = path.join(publicDir, "proof-frames", `${frame.id}.png`); return fs.existsSync(file) && shaFile(file) === frame.sha256; }));
check("authority-unchanged", build.currentAuthority?.unchanged === true && render.currentAuthority?.unchanged === true && shaFile(authorityPath) === render.currentAuthority.sha256After);
check("shot-02-locked", plan.gates?.shot02DesignAllowed === false && render.gates?.shot02DesignAllowed === false && render.gates?.h47ExpansionAllowed === false);

const report = {
  contract: "A1Shot01SelectionRewriteAuditReport/v1",
  phaseId,
  status: failures.length ? "FAIL" : "READY_FOR_USER_SHOT01_REVIEW",
  failures,
  source: build.source,
  design: {visualJob: plan.visualJob, primaryActor: plan.primaryActor, topology: plan.topology, beatCount: plan.beats.length, forbiddenPrimitives: plan.forbiddenPrimitives},
  artifacts: {video: render.video, contactSheet: render.contactSheet, reviewStrip: render.reviewStrip},
  truthBoundary: {shotSpecificHandDirection: true, userApproved: false, systemFamilyPromoted: false, currentAuthorityUnchanged: render.currentAuthority.unchanged},
  gates: {userShot01Approval: "PENDING", shot02DesignAllowed: false, familyAbstractionAllowed: false, rendererAdoptionAllowed: false, h47ExpansionAllowed: false, nextAction: "show only shot 01 to the user and wait for approval or a concrete revision note"},
};
writeJson(path.join(publicDir, "audit-report.json"), report);
writeJson(path.join(artifactDir, "audit-report.json"), report);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
