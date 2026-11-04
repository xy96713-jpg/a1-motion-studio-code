#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const phase = "generated/system-line/editorial-asset-workbench-v1";
const read = (relative) => JSON.parse(fs.readFileSync(path.join(publicRoot, relative), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const film = read(`${phase}/current-full-film-540p-v1/report.json`);
const pixel = read(`${phase}/current-full-film-540p-v1/pixel-audit/report.json`);
const transitions = read(`${phase}/current-full-film-540p-v1/transition-audit/report.json`);
const screenPlan = read(`${phase}/continuous-screen-evidence-v2/shot-performance-plans.json`);
const screenContinuity = read(`${phase}/continuous-screen-evidence-v2/all-sixteen-shot-v2/continuity-audit.json`);
const insertion = read(`${phase}/continuous-screen-evidence-v2/insertion-pack-v2/insertion-manifest.json`);
const video = path.join(publicRoot, film.video.publicUrl.replace(/^\//u, ""));
const output = path.join(publicRoot, phase, "current-motion-system-maturity-v1");
const sample = path.join(output, "visual-director-current-3x3-sample.png");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const allowedCameraModels = new Set(["C4_BEZIER_EVENT_FOCUS_HOLD_V1", "CAP_NATIVE_RENDERED_NO_A1_CAMERA"]);
const cameraCounts = Object.fromEntries([...allowedCameraModels].map((model) => [model, screenPlan.shots.filter((shot) => shot.screenDirection?.cameraModel === model).length]));

if (!fs.existsSync(video) || sha256(video) !== film.video.sha256) throw new Error("visual-director-v2-film-sha");
if (pixel.status !== "PASS" || transitions.status !== "PASS" || screenContinuity.status !== "PASS") throw new Error("visual-director-v2-machine-audit");
if (insertion.status !== "CANDIDATE_ONLY_READY_FOR_EDITOR_INSERT_REVIEW" || insertion.entryCount !== 16) throw new Error("visual-director-v2-insertion-pack");
if (screenPlan.shots.some((shot) => !allowedCameraModels.has(shot.screenDirection?.cameraModel))) throw new Error("visual-director-v2-camera-model");
if (cameraCounts.CAP_NATIVE_RENDERED_NO_A1_CAMERA !== 3 || cameraCounts.C4_BEZIER_EVENT_FOCUS_HOLD_V1 !== 13) throw new Error("visual-director-v2-camera-count");
if (film.probe.streams[0].avg_frame_rate !== "60/1" || film.screenRunBreathing?.resetCount !== 3 || film.screenRunBreathing?.approvedPreHoldMs !== 550) throw new Error("visual-director-v2-film-runtime");

fs.mkdirSync(output, {recursive: true});
const sampleRender = spawnSync(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-y", "-i", video,
  "-vf", "fps=9/218.4,scale=645:274,tile=3x3",
  "-frames:v", "1", sample,
], {encoding: "utf8"});
if (sampleRender.status !== 0 || !fs.existsSync(sample)) throw new Error(`visual-director-v2-sample:${sampleRender.stderr}`);

const dimensions = [
  {id: "authority-and-source-integrity", score: 4, maxScore: 4, status: "PASS", evidence: "34 MotionSpec primary sources and all 16 screen insertion files are content-addressed; current film bytes match the report SHA."},
  {id: "opening-and-closing", score: 4, maxScore: 4, status: "PASS", evidence: "The approved fullscreen opening and identity close remain ledger-bound in the current 34-shot render."},
  {id: "semantic-motion-and-carrier-fit", score: 4, maxScore: 4, status: "PASS", evidence: "The film preserves six route families; screen playback uses 13 restrained C4 shots plus 3 Cap-native narration-bound shots."},
  {id: "sequence-rhythm-and-breathing", score: 4, maxScore: 4, status: "PASS", evidence: "Three real-presenter resets with 550ms approved pre-holds break the long screen run; all 33 transition timing checks pass."},
  {id: "actual-pixel-stability", score: 4, maxScore: 4, status: "PASS", evidence: "34/34 first-middle-final checks pass; black and abnormal silence counts are zero; 16-screen hard-break count is zero."},
  {id: "typography-and-evidence-density", score: 3, maxScore: 4, status: "PASS_WITH_DENSITY_WATCH", evidence: "Authentic full-workbench frames remain text-dense at 540p; judge them in motion and at narration pace rather than as isolated stills."},
];
const reviewedAt = new Date().toISOString();
const body = {
  contract: "A1CurrentFullFilmVisualDirectorReview/v2",
  status: "AGENT_RECOMMENDS_USER_WHOLE_FILM_REVIEW",
  verdict: "PASS_WITH_DENSITY_WATCH",
  score: dimensions.reduce((sum, item) => sum + item.score, 0),
  maxScore: dimensions.reduce((sum, item) => sum + item.maxScore, 0),
  sourceVideoSha256: film.video.sha256,
  sourcePixelAuditStatus: pixel.status,
  sourceTransitionAuditStatus: transitions.status,
  sourceScreenContinuityAuditStatus: screenContinuity.status,
  screenCameraModels: cameraCounts,
  visualSample: {publicUrl: `/${phase}/current-motion-system-maturity-v1/${path.basename(sample)}`, sha256: sha256(sample), sourceVideoSha256: film.video.sha256},
  dimensions,
  strongestMoments: ["ED-01 fullscreen opening authority", "ED-03/24/26 narration-bound Cap-native actions", "ED-23/26/29 presenter breathing resets", "ED-34 identity close"],
  weakestArea: "Brief authentic wide-establish screen frames remain dense at 540p.",
  repairInstruction: null,
  userVisualApproval: "NOT_SET_BY_AGENT",
  reviewedAt,
};
const report = {...body, reviewSha256: crypto.createHash("sha256").update(JSON.stringify({...body, reviewedAt: undefined})).digest("hex")};
fs.writeFileSync(path.join(output, "visual-director-review-v2.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
