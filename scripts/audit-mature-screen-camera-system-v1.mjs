#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const phasePath = path.join(root, ".codex-artifacts/system-progress/current-phase.json");
const baselinePath = path.join(root, "work/mature-screen-camera-system-v1/baseline.json");
const canaryAuditPath = path.join(root, "work/mature-screen-camera-system-v1/canary/audit-report.json");
const waveAuditPath = path.join(root, "work/mature-screen-camera-system-v1/wave15/audit-report.json");
const blindPath = path.join(root, "work/mature-screen-camera-system-v1/blind-fixtures/report.json");
const resultPath = path.join(root, "work/mature-screen-camera-system-v1/result.json");
const systemPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const authorityAuditPath = path.join(root, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json");
const packagePath = path.join(root, "remotion-renderer/package.json");
const failures = [];
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const [id, file] of Object.entries({PHASE:phasePath,BASELINE:baselinePath,CANARY:canaryAuditPath,WAVE15:waveAuditPath,BLIND:blindPath,SYSTEM_PHASE:systemPhasePath,AUTHORITY:authorityAuditPath,PACKAGE:packagePath})) if (!fs.existsSync(file)) failures.push(`${id}_MISSING`);
const phase = fs.existsSync(phasePath) ? readJson(phasePath) : null;
const baseline = fs.existsSync(baselinePath) ? readJson(baselinePath) : null;
const canary = fs.existsSync(canaryAuditPath) ? readJson(canaryAuditPath) : null;
const wave = fs.existsSync(waveAuditPath) ? readJson(waveAuditPath) : null;
const blind = fs.existsSync(blindPath) ? readJson(blindPath) : null;
const systemPhase = fs.existsSync(systemPhasePath) ? readJson(systemPhasePath) : null;
const authority = fs.existsSync(authorityAuditPath) ? readJson(authorityAuditPath) : null;
const pkg = fs.existsSync(packagePath) ? readJson(packagePath) : null;
if (baseline?.status !== "FAIL") failures.push("BASELINE_NOT_FAILING");
if (canary?.status !== "PASS") failures.push("CANARY_NOT_PASS");
if (wave?.status !== "PASS" || wave?.shotCount !== 15 || wave?.decodedCount !== 15) failures.push("WAVE15_NOT_PASS");
if (blind?.status !== "PASS" || blind?.fixtures?.length !== 3) failures.push("BLIND_FIXTURES_NOT_PASS");
const expectedFixtures = new Set((phase?.generality?.blindFixtures || []).map((item) => item.id));
const actualFixtures = new Set((blind?.fixtures || []).map((item) => item.id));
if (expectedFixtures.size !== 3 || [...expectedFixtures].some((id) => !actualFixtures.has(id))) failures.push("BLIND_FIXTURE_COVERAGE");
if (pkg?.dependencies?.["@remotion/motion-blur"] !== pkg?.dependencies?.remotion) failures.push("REMOTION_VERSION_ALIGNMENT");
if (canary?.pixelRows?.filter((row) => row.kind === "hold").some((row) => !row.byteIdentical)) failures.push("HOLD_FRAME_NOT_IDENTICAL");
if (canary?.pixelRows?.filter((row) => row.kind === "move").some((row) => row.meanAbsPixelDiff < 5 || row.temporalSharpness >= row.noneSharpness * .95)) failures.push("TEMPORAL_BLUR_NOT_PROVEN");
if (wave?.motionBlur?.sourceFrameLocked !== true || wave?.motionBlur?.holdFramesByteIdentical !== true) failures.push("MOVEMENT_ONLY_BLUR_NOT_PROVEN");
if (systemPhase?.authority?.workspaceSha256 !== authority?.authority?.workspaceSha256) failures.push("CURRENT_AUTHORITY_SHA_MISMATCH");
if (systemPhase?.authority?.nextAction?.id !== "review-screen-storyboard-wave-15") failures.push("CURRENT_REVIEW_GATE_DRIFT");
if (authority?.status !== "PASS") failures.push("CURRENT_AUTHORITY_NOT_PASS");

const runtimeText = (phase?.generality?.runtimeFiles || []).map((file) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : "").join("\n");
for (const id of phase?.generality?.forbiddenFixtureIds || []) if (runtimeText.includes(id)) failures.push(`RUNTIME_FIXTURE_ID:${id}`);
for (const term of phase?.generality?.forbiddenTopicTerms || []) if (runtimeText.includes(term)) failures.push(`RUNTIME_TOPIC_TERM:${term}`);
const visibleArtifact = path.join(root, "work/mature-screen-camera-system-v1/mature-screen-camera-three-layout-review.mp4");
if (!fs.existsSync(visibleArtifact)) failures.push("VISIBLE_ARTIFACT_MISSING");
else {
  const probe = spawnSync("ffprobe", ["-v","error","-show_entries","stream=codec_name,width,height,r_frame_rate","-of","json",visibleArtifact], {encoding:"utf8"});
  if (probe.status !== 0) failures.push("VISIBLE_ARTIFACT_DECODE");
  else {const video=JSON.parse(probe.stdout).streams.find((stream)=>stream.width);if(video?.codec_name!=="h264"||video?.width!==960||video?.height!==540||video?.r_frame_rate!=="60/1")failures.push("VISIBLE_ARTIFACT_FORMAT");}
}
const result = {
  contract: "A1MatureScreenCameraSystemResult/v1",
  status: failures.length ? "FAIL" : "PASS",
  phaseId: phase?.phaseId || null,
  baseline: {path: baselinePath, status: baseline?.status || null, failures: baseline?.failures || []},
  fixtures: (blind?.fixtures || []).map((item) => ({id:item.id,genre:item.genre,status:item.status,outputPath:item.outputPath,outputSha256:item.outputSha256,summary:item.summary})),
  requirements: {
    namedCameraGrammar: canary?.status === "PASS",
    trueTemporalMotionBlur: canary?.pixelRows?.filter((row)=>row.kind==="move").every((row)=>row.meanAbsPixelDiff>=5&&row.temporalSharpness<row.noneSharpness*.95)===true,
    movementOnlyBlur: canary?.pixelRows?.filter((row)=>row.kind==="hold").every((row)=>row.byteIdentical)===true,
    sourceFrameLocked: canary?.renderer?.sourceFrameLocked===true,
    anchorDriftBounded: wave?.failures?.length===0,
    roiFullyVisible: wave?.failures?.length===0,
    readableHold: wave?.failures?.length===0,
    fifteenShotCoverage: wave?.shotCount===15&&wave?.decodedCount===15,
    threeLayoutBlindTest: blind?.fixtures?.length===3,
    runtimeFixtureIsolation: !failures.some((failure)=>failure.startsWith("RUNTIME_")),
    currentAuthorityPreserved: systemPhase?.authority?.workspaceSha256===authority?.authority?.workspaceSha256,
  },
  evidence: {
    canaryAudit:{path:canaryAuditPath,sha256:fs.existsSync(canaryAuditPath)?sha256File(canaryAuditPath):null},
    wave15Audit:{path:waveAuditPath,sha256:fs.existsSync(waveAuditPath)?sha256File(waveAuditPath):null},
    blindFixtureReport:{path:blindPath,sha256:fs.existsSync(blindPath)?sha256File(blindPath):null},
    visibleArtifact:{path:visibleArtifact,sha256:fs.existsSync(visibleArtifact)?sha256File(visibleArtifact):null},
    currentAuthority:{workspaceSha256:authority?.authority?.workspaceSha256||null,nextAction:authority?.nextAction||null},
  },
  boundary: {capabilityMatureCandidate:true,currentReviewWaveNotYetBound:true,productionAdmission:false,userVisualApproval:"NOT_APPROVED",nextAction:"USER_REVIEW_MATURE_WAVE15_THEN_FORMAL_BINDING"},
  failures,
  generatedAt:new Date().toISOString(),
};
fs.writeFileSync(resultPath, `${JSON.stringify(result,null,2)}\n`);
console.log(JSON.stringify(result,null,2));
if(result.status!=="PASS")process.exitCode=1;
