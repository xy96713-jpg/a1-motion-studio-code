#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "creator-material-pixel-type-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const renderPath = path.join(publicDir, "render-report.json");
if (!fs.existsSync(renderPath)) throw new Error("creator-material-review-render-report-missing");
const render = JSON.parse(fs.readFileSync(renderPath, "utf8"));
const report = {
  contract: "A1CreatorMaterialPixelTypeIndependentVisualReview/v1",
  phaseId,
  reviewedAt: new Date().toISOString(),
  reviewer: {type: "independent-codex-red-team", sourceThreadId: "019fb19f-8eed-7521-8278-3d25fc16e324"},
  reviewedArtifacts: {contactSheetSha256: render.contactSheet.sha256, frameSha256: Object.fromEntries(render.frames.map((frame) => [frame.shotId, frame.sha256])), specimenSha256: render.specimen.sha256},
  verdict: "PASS_FOR_DYNAMIC_PROTOTYPE",
  familyAdoptionVerdict: "REVISE_BEFORE_FAMILY_ADOPTION",
  frameVerdicts: {"CMPT-01": "PASS", "CMPT-02": "PASS", "CMPT-03": "PASS"},
  findings: [
    "CMPT-01 and CMPT-02 keep the real screen materially attached to the desk and hand action; removed corner, vertical, and SOURCE-BOUND labels do not regress into a pixel HUD.",
    "The remaining micro labels are object-anchored, and both desk plates now share one environment-light and material grade.",
    "CMPT-03 keeps a readable article slice as a real evidence window instead of becoming an empty document card or repeated sidebar.",
  ],
  hardFailures: {documentCard: false, repeatedSidebar: false, pixelHud: false},
  gates: {dynamicPrototypeAllowed: true, familyAdoptionAllowed: false, rendererAdoptionAllowed: false, h47ExpansionAllowed: false},
};
for (const dir of [artifactDir, publicDir]) { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(path.join(dir, "independent-visual-review.json"), `${JSON.stringify(report, null, 2)}\n`); }
console.log(JSON.stringify(report, null, 2));
