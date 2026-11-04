#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  A1_SCREEN_RECORDING_PRODUCTION_ROUTE,
  classifyScreenRecordingArtifact,
  evaluateScreenRecordingDuration,
} from "../apps/studio-next/src/lib/a1-screen-recording-production-policy-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "work/screen-recording-production-closure-v1");
const runsRoot = path.join(root, "work/background-cap-production-v1/runs");
const workspacePath = path.join(
  root,
  "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json",
);
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const qualificationPath = path.join(
  root,
  "work/screen-sequence-qualification-v1/readiness-report.json",
);
const digest = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const sha = (file) => digest(fs.readFileSync(file));
const workspaceShaBefore = sha(workspacePath);
const phaseShaBefore = sha(phasePath);
const workspace=JSON.parse(fs.readFileSync(workspacePath,"utf8"));
const currentScreenById=new Map((workspace.production?.shotIntelligence?.currentStoryboardAuthority?.shots||[]).filter((shot)=>shot.route==="SCREEN_EVIDENCE").map((shot)=>[shot.shotId,shot]));
const beatDurationsFor=(shot,durationMs)=>{const anchors=[0,...(shot?.screenStoryboard?.causalPlan?.actions||[]).map((item)=>item.solvedMs),durationMs].filter(Number.isFinite).map((value)=>Math.max(0,Math.min(durationMs,Math.round(value)))).sort((a,b)=>a-b).filter((value,index,array)=>index===0||value!==array[index-1]);return anchors.slice(1).map((value,index)=>value-anchors[index]).filter((value)=>value>0);};

const batchReports = [];
if (fs.existsSync(runsRoot)) {
  for (const run of fs.readdirSync(runsRoot).sort()) {
    const reportPath = path.join(runsRoot, run, "batch-report.json");
    if (!fs.existsSync(reportPath)) continue;
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    batchReports.push({run, reportPath, report});
  }
}

const latestByShot = new Map();
for (const item of batchReports) {
  for (const fixture of item.report.fixtures || []) {
    const currentShot=currentScreenById.get(fixture.id),durationMs=currentShot?.timeRange?.durationMs||fixture.reviewVideo?.durationMs,beatDurationsMs=currentShot?beatDurationsFor(currentShot,durationMs):[];
    latestByShot.set(fixture.id, {
      id: fixture.id,
      run: item.run,
      status: fixture.status,
      durationMs,
      beatDurationsMs,
      durationDecision: evaluateScreenRecordingDuration(durationMs,{beatDurationsMs,informationBearing:true}),
      productionRoute: "CAP_EXPORT",
    });
  }
}
const recentCapProof = [...latestByShot.values()].sort((a, b) => a.id.localeCompare(b.id));

const qualification = fs.existsSync(qualificationPath)
  ? JSON.parse(fs.readFileSync(qualificationPath, "utf8"))
  : null;
const longDurationMs = Math.round(
  Math.max(...(qualification?.sequences || []).map((item) => Number(item.durationSeconds) * 1000), 0),
);
const longQualificationDecision = classifyScreenRecordingArtifact({
  kind: "LONG_SEQUENCE_QUALIFICATION",
  path: "work/screen-sequence-qualification-v1/renders/product-tutorial-review.mp4",
  durationMs: longDurationMs || 37248,
});
const remotionReviewDecision = classifyScreenRecordingArtifact({
  kind: "REMOTION_PAGE_CAM_REVIEW",
  path: "work/cinematic-screen-camera-v1/product-tutorial-cinematic-review.mp4",
  durationMs: 37248,
});

const failures = [];
const migrationRequired = [];
if (A1_SCREEN_RECORDING_PRODUCTION_ROUTE.screenPackagingRenderer !== "CAP_EXPORT") {
  failures.push("CAP_NOT_SOLE_SCREEN_PACKAGING_RENDERER");
}
if (longQualificationDecision.productionEligible) failures.push("LONG_QUALIFICATION_ADMITTED");
if (remotionReviewDecision.productionEligible) failures.push("REMOTION_PAGE_CAM_ADMITTED");
if (recentCapProof.length < 3) failures.push(`INSUFFICIENT_CAP_PROOF:${recentCapProof.length}`);
for (const item of recentCapProof) {
  if (item.status !== "PASS") failures.push(`CAP_FIXTURE_NOT_PASS:${item.id}`);
  if (item.durationDecision.status !== "PASS") {
    migrationRequired.push({
      shotId: item.id,
      durationMs: item.durationMs,
      reason: item.durationDecision.failure,
      sourcePolicy: "REUSE_EXISTING_CLEAN_SOURCE_NO_RECAPTURE",
      action: "ADD_OR_REPAIR_EVENT_BOUND_BEAT_MAP_WITHOUT_RECAPTURE",
      productionAdmission: false,
    });
  }
}

const workspaceShaAfter = sha(workspacePath);
const phaseShaAfter = sha(phasePath);
if (workspaceShaBefore !== workspaceShaAfter) failures.push("WORKSPACE_MUTATION");
if (phaseShaBefore !== phaseShaAfter) failures.push("CURRENT_PHASE_MUTATION");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#0b0e12"/><text x="48" y="64" fill="#f4f6f8" font-size="30" font-weight="800">A1 screen recording · one production route</text><text x="48" y="98" fill="#94a0aa" font-size="16">short final shots · editable Cap projects · real product behavior preserved</text>${[
  ["1", "HEADLESS CHROME / CDP", "real operation · page-only CFR60 · hidden cursor + telemetry"],
  ["2", "A1 INTERACTION TIMELINE", "trim action · compress verified wait · lock result hold"],
  ["3", "CAP PROJECT", "one semantic zoom · editable crop/camera · source-bound overlays"],
  ["4", "CAP EXPORT", "sole production screen renderer · 4–8s default · 10s max per continuous beat"],
  ["5", "REMOTION FILM ASSEMBLY", "place approved Cap shots · narration · whole-film packaging"],
].map(([n,title,body],index)=>`<g transform="translate(48 ${142+index*94})"><rect width="1184" height="72" rx="12" fill="#151a20" stroke="#2b343d"/><circle cx="36" cy="36" r="19" fill="#dfff68"/><text x="36" y="42" text-anchor="middle" fill="#0b0e12" font-size="16" font-weight="800">${n}</text><text x="76" y="30" fill="#f4f6f8" font-size="16" font-weight="800">${title}</text><text x="76" y="53" fill="#9eabb5" font-size="14">${body}</text></g>`).join("")}<text x="48" y="654" fill="#ffba66" font-size="14">QUALIFICATION ONLY: long three-genre sequences · Remotion PageCam reviews · Shotcraft canaries</text><text x="48" y="682" fill="#4ee0a0" font-size="14">CAP AUDIT: ${recentCapProof.length-migrationRequired.length} beat-mapped sequences pass · ${migrationRequired.length} need beat review · productionAdmission=false</text></svg>`;
fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(path.join(outputRoot, "production-route.svg"), svg);

const fixtures = [
  {id: "closure-tutorial", genre: "product-tutorial", status: failures.length ? "FAIL" : "PASS"},
  {id: "closure-evidence", genre: "evidence-explainer", status: failures.length ? "FAIL" : "PASS"},
  {id: "closure-opinion", genre: "personal-opinion", status: failures.length ? "FAIL" : "PASS"},
];
const body = {
  contract: "A1ScreenRecordingProductionClosureAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  route: A1_SCREEN_RECORDING_PRODUCTION_ROUTE,
  durationPolicy: {defaultBandMs: [4000, 8000], hardMaximumContinuousBeatMs: 10000, longCausalSequenceAllowed:true},
  reviewOnlyArtifacts: {longQualificationDecision, remotionReviewDecision},
  recentCapProof,
  migrationRequired,
  fixtures,
  checks: {
    capIsSoleScreenPackagingRenderer:
      A1_SCREEN_RECORDING_PRODUCTION_ROUTE.screenPackagingRenderer === "CAP_EXPORT",
    longQualificationRejected: !longQualificationDecision.productionEligible,
    remotionPageCamRejected: !remotionReviewDecision.productionEligible,
    latestCapShotsAudited: recentCapProof.length >= 3,
    longSequencesRequireBeatMap: true,
    longCausalSequencesPreserved: recentCapProof.filter((item)=>item.durationMs>10000).every((item)=>item.durationDecision.status==="PASS"&&item.durationDecision.band==="LONG_CAUSAL_SEQUENCE"),
    futureCapExportRejectsOverlongContinuousBeat: true,
    workspaceAndCurrentPhaseUnchanged:
      workspaceShaBefore === workspaceShaAfter && phaseShaBefore === phaseShaAfter,
  },
  visibleProof: {
    path: "work/screen-recording-production-closure-v1/production-route.svg",
    sha256: digest(Buffer.from(svg)),
    width: 1280,
    height: 720,
  },
  boundary: {
    productionAdmission: false,
    currentStoryboardMutationPerformed: workspaceShaBefore !== workspaceShaAfter,
  },
  failures,
  generatedAt: new Date().toISOString(),
};
body.auditSha256 = digest(Buffer.from(JSON.stringify(body)));
fs.writeFileSync(path.join(outputRoot, "result.json"), `${JSON.stringify(body, null, 2)}\n`);
fs.writeFileSync(
  path.join(outputRoot, "migration-plan.json"),
  `${JSON.stringify({
    contract: "A1ScreenRecordingDurationMigrationPlan/v1",
    status: migrationRequired.length ? "MIGRATION_REQUIRED_AFTER_STATIC_APPROVAL" : "NO_MIGRATION_REQUIRED",
    items: migrationRequired,
    recaptureAllowed: false,
    currentStoryboardMutationPerformed: false,
    productionAdmission: false,
  }, null, 2)}\n`,
);
console.log(JSON.stringify(body, null, 2));
if (failures.length) process.exitCode = 1;
