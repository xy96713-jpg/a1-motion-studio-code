#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const input = path.resolve(root, process.argv[2] || "");
const output = path.resolve(root, process.argv[3] || "");
if (!input || !output || !fs.existsSync(input)) throw new Error("usage:build-live-article-cap-shim-v1 <live-capture-report.json> <output-dir>");
const live = JSON.parse(fs.readFileSync(input, "utf8"));
const shaValue = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sourcePath = path.relative(root, path.resolve(root, live.output.path));
const beats = [
  {id: "live-hero-establish", targetEvent: "hero_hold", startMs: 3400, endMs: 9300, amount: 1.04, glideSpeed: 0.35},
  {id: "live-image-evidence", targetEvent: "image_evidence_one", startMs: 21200, endMs: 22800, amount: 1.08, glideSpeed: 0.4},
  {id: "live-closing-result", targetEvent: "closing_section", startMs: 51200, endMs: 52800, amount: 1.06, glideSpeed: 0.35},
];
const report = {
  contract: "A1GenericBrowserScreenProof/v1",
  status: live.status === "READY_FOR_CAP_REVIEW" ? "READY_FOR_CAP_REVIEW" : "FAIL",
  scenarioId: "noaa-live-article-fresh-cap-shim-v1",
  productId: "noaa-live-article-fresh",
  productCategory: "article-webpage",
  scenarioSha256: shaValue({contract: "A1LiveArticleCapShimScenario/v1", liveReportSha256: live.reportSha256, beats}),
  runtimeId: "GENERIC_BROWSER_CAPTURE_V1",
  captureBackend: live.captureBackend,
  captureScope: live.captureScope,
  headedWindowCreated: false,
  frontmostApplicationMutation: false,
  cursorPixelPolicy: "SOURCE_VIDEO_CURSOR_HIDDEN_TELEMETRY_ONLY",
  url: live.url,
  directorPlan: {
    contract: "A1ScreenDirectorBrain/v1",
    sequence: "ARTICLE_SCROLL_EVIDENCE_HOLD",
    beats: beats.map((beat) => ({id: beat.id, function: "scroll-follow", technique: "SCROLL_ANCHOR_FOLLOW", event: beat.targetEvent})),
    cameraBeats: beats,
  },
  project: {root: live.project.root, gitHead: null, gitStateSha256: null, unchanged: true},
  events: live.events,
  cursorTelemetry: live.cursorTelemetry,
  domTargets: live.domTargets,
  clickTargetProof: [],
  geometryTruth: live.geometryTruth,
  captureSync: {source: "LIVE_BROWSER_PAGE", syncPass: true, rawDurationMs: live.output.rawDurationMs || live.output.durationMs, pageWallDurationMs: live.output.durationMs},
  primaryTarget: live.domTargets.find((item) => item.event === "image_evidence_one") || live.domTargets[0] || null,
  output: {...live.output, path: sourcePath},
  evidence: live.evidence,
  boundary: {reviewOnly: true, targetProjectMutation: false, currentStoryboardMutationPerformed: false, productionAdmission: false},
  generatedAt: new Date().toISOString(),
};
report.reportSha256 = shaValue(report);
fs.mkdirSync(output, {recursive: true});
const reportPath = path.join(output, "capture-report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({reportPath: path.relative(root, reportPath), scenarioId: report.scenarioId, status: report.status, cameraBeatCount: beats.length, source: sourcePath}, null, 2));
