#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "work/screen-recording-maturity-test-v1/annotation-decision-proof-v1");
const sourceDir = fs.readdirSync(sourceRoot).filter((name) => name.startsWith("annotation-decision-") && fs.existsSync(path.join(sourceRoot, name, "capture-report.json"))).sort().at(-1);
if (!sourceDir) throw new Error("DECISION_SOURCE_MISSING");
const runRoot = path.join(sourceRoot, sourceDir);
const reportPath = path.join(runRoot, "capture-report.json");
const decisionAuditPath = path.join(runRoot, "decision-audit.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const decisionAudit = JSON.parse(fs.readFileSync(decisionAuditPath, "utf8"));
const outputRoot = path.join(root, "work/screen-recording-maturity-test-v1/annotation-decision-proof-v1/render");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(rendererRoot, "public");
const publicRelativeRoot = "proof-only/screen-recording-maturity-test-v1/annotation-decision-proof-v1";
const publicOutputRoot = path.join(publicRoot, publicRelativeRoot);
const stagedVideo = path.join(publicOutputRoot, "clean-source.mp4");
const cleanVideo = path.join(outputRoot, "annotation-decision-clean-1280x720-60fps.mp4");
const reviewVideo = path.join(outputRoot, "annotation-decision-review-1280x720-60fps.mp4");
const propsPath = path.join(outputRoot, "props.json");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));
const decode = (file) => { execFileSync(ffmpeg, ["-v", "error", "-i", file, "-f", "null", "-"]); return true; };
const pixelMae = async (leftPath, rightPath) => { const left = await sharp(leftPath).removeAlpha().raw().toBuffer(); const right = await sharp(rightPath).removeAlpha().raw().toBuffer(); let total = 0; for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]); return total / left.length; };
const normalize = (rect, width, height) => ({x: rect.x / width, y: rect.y / height, width: rect.width / width, height: rect.height / height});
const clampCenter = (value, scale) => { const half = 0.5 / scale; return Math.min(1 - half, Math.max(half, value)); };
const pose = (rect, scale) => ({x: clampCenter(rect.x + rect.width / 2, scale), y: clampCenter(rect.y + rect.height / 2, scale), scale});

async function main() {
  const targets = Object.fromEntries(report.geometryTruth.targets.map((target) => [target.targetKey, target]));
  for (const key of ["source-evidence", "edited-state", "verified-result"]) if (!targets[key]?.lineRects?.length) throw new Error(`DECISION_TARGET_MISSING:${key}`);
  await fsp.mkdir(outputRoot, {recursive: true});
  await fsp.mkdir(publicOutputRoot, {recursive: true});
  await fsp.copyFile(report.output.path.startsWith("work/") ? path.join(root, report.output.path) : path.join(runRoot, "clean-source.mp4"), stagedVideo);
  const source = targets["source-evidence"].sourceRect;
  const edited = targets["edited-state"].sourceRect;
  const result = targets["verified-result"].sourceRect;
  const sourceLineRects = targets["source-evidence"].lineRects;
  const resultLineRects = targets["verified-result"].lineRects;
  const baseScene = {shotId: "annotation-decision", timelineStartMs: 0, timelineEndMs: 12000, durationMs: 12000, sourceActionId: "real-text-replace-and-save", sourceVideoUri: `${publicRelativeRoot}/clean-source.mp4`, sourceSegments: [{kind: "video", outputStartMs: 0, outputEndMs: 12000, sourceStartMs: 0, sourceEndMs: 12000, evidenceRole: "REAL_WORKBENCH_EDIT_AND_SAVE"}], screenDirection: {contract: "A1ScreenActionDirection/v1", grammar: "SOURCE_ACTION_DECISION_RESULT", cameraPath: "CINEMATIC_EASE_IN_OUT_RESTORE", motionBlurPolicy: "VELOCITY_CINEMATIC", clickFeedbackPolicy: "PRESS_ONLY", attentionTrack: [{beat: "source-evidence", startMs: 1100, endMs: 2350, region: source, lineRects: sourceLineRects, treatment: "SOURCE_BOUND_HIGHLIGHT_WASH", colorRole: "AMBER_WARNING"}, {beat: "verified-result", startMs: 6500, endMs: 8500, region: result, lineRects: resultLineRects, treatment: "SOURCE_BOUND_HIGHLIGHT_WASH", colorRole: "LIME_POSITIVE"}], cameraPerformance: {mode: "DIRECTED_SOURCE_ACTION"}}, pointerTrack: null, cameraTrack: [{atMs: 0, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"}, {atMs: 700, x: 0.5, y: 0.5, scale: 1, easingToNext: "cinematic-in-out"}, {atMs: 1200, ...pose(source, 1.18), easingToNext: "hold"}, {atMs: 2200, ...pose(source, 1.18), easingToNext: "restore"}, {atMs: 2700, x: 0.5, y: 0.5, scale: 1, easingToNext: "cinematic-in-out"}, {atMs: 3300, ...pose(edited, 1.16), easingToNext: "hold"}, {atMs: 4700, ...pose(edited, 1.16), easingToNext: "restore"}, {atMs: 5300, x: 0.5, y: 0.5, scale: 1, easingToNext: "cinematic-in-out"}, {atMs: 6100, ...pose(result, 1.18), easingToNext: "hold"}, {atMs: 8500, ...pose(result, 1.18), easingToNext: "restore"}, {atMs: 9100, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"}, {atMs: 12000, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"}], editCoverage: {mode: "REAL_TEXT_REPLACE_AND_SAVE", fullSourceActionShown: true}};
  const dummy = {x: 0.3, y: 0.3, width: 0.2, height: 0.05};
  const props = {contract: "A1AnnotationMaturityReview/v1", width: 1280, height: 720, fps: 60, durationMs: 12000, scene: baseScene, arrow: {startMs: 0, endMs: 0, from: dummy, to: dummy}, handoff: {startMs: 0, endMs: 0, from: dummy, to: dummy}, privacy: {startMs: 0, endMs: 0, target: dummy, blurredCropUri: ""}, steps: {startMs: 0, endMs: 0, targets: []}, phases: [], showPhaseLabels: false, showArrow: false, showHandoff: false, showPrivacy: false, showSteps: false};
  props.scene.pointerTrack = {contract: "A1CurveGradePointerTrack/v1", interpolation: "CUBIC_HERMITE_CONTINUOUS_TANGENT", waypoints: report.cursorTelemetry.moves.map((point) => ({tMs: point.tMs, x: point.x, y: point.y})), clicks: report.cursorTelemetry.clicks.filter((click) => click.down).map((click) => ({atMs: click.tMs, x: click.x, y: click.y, kind: "press"}))};
  props.scene.cameraTrack = [{atMs: 0, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"}, {atMs: 700, x: 0.5, y: 0.5, scale: 1, easingToNext: "cinematic-in-out"}, {atMs: 1200, ...pose(source, 1.14), easingToNext: "hold"}, {atMs: 2200, ...pose(source, 1.14), easingToNext: "restore"}, {atMs: 2700, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"}, {atMs: 5300, x: 0.5, y: 0.5, scale: 1, easingToNext: "cinematic-in-out"}, {atMs: 6100, ...pose(result, 1.1), easingToNext: "hold"}, {atMs: 9000, ...pose(result, 1.1), easingToNext: "restore"}, {atMs: 9600, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"}, {atMs: 12000, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"}];
  props.scene.screenDirection.attentionTrack = [...props.scene.screenDirection.attentionTrack, {beat: "edited-state", startMs: 3200, endMs: 4300, region: edited, lineRects: targets["edited-state"].lineRects, treatment: "SOURCE_BOUND_HIGHLIGHT_WASH", colorRole: "BLUE_EVIDENCE"}];
  const cleanProps = {...props, scene: {...props.scene, screenDirection: {...props.scene.screenDirection, attentionTrack: []}}};
  await fsp.writeFile(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  const require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler");
  const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/AnnotationMaturityReviewEntry.tsx"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const render = (composition, inputProps, outputLocation) => renderMedia({serveUrl, composition, inputProps, outputLocation, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  const sampleTimes = {source: 1700, edit: 4200, result: 7600};
  const mae = {};
  try {
    const composition = await selectComposition({serveUrl, id: "A1AnnotationMaturityReviewV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    const cleanComposition = await selectComposition({serveUrl, id: "A1AnnotationMaturityReviewV1", inputProps: cleanProps, puppeteerInstance: browser, logLevel: "warn"});
    await render(cleanComposition, cleanProps, cleanVideo);
    await render(composition, props, reviewVideo);
    for (const [id, atMs] of Object.entries(sampleTimes)) {
      const active = path.join(outputRoot, `${id}.png`);
      const absent = path.join(outputRoot, `${id}-absent.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame: Math.round(atMs / 1000 * 60), output: active, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      await renderStill({serveUrl, composition: cleanComposition, inputProps: cleanProps, frame: Math.round(atMs / 1000 * 60), output: absent, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      mae[id] = await pixelMae(active, absent);
    }
  } finally {
    await browser.close({silent: true});
  }
  const cleanProbe = probe(cleanVideo); const reviewProbe = probe(reviewVideo); const cleanStream = cleanProbe.streams.find((item) => item.codec_type === "video"); const reviewStream = reviewProbe.streams.find((item) => item.codec_type === "video");
  const failures = [];
  if (cleanStream.width !== 1280 || cleanStream.height !== 720 || cleanStream.r_frame_rate !== "60/1" || Number(cleanStream.nb_read_frames) !== 720 || !decode(cleanVideo)) failures.push("CLEAN_MEDIA");
  if (reviewStream.width !== 1280 || reviewStream.height !== 720 || reviewStream.r_frame_rate !== "60/1" || Number(reviewStream.nb_read_frames) !== 720 || !decode(reviewVideo)) failures.push("REVIEW_MEDIA");
  if (mae.source < 0.015 || mae.result < 0.015) failures.push("PIXEL_EFFECT");
  const audit = {contract: "A1AnnotationDecisionReview/v1", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", source: {captureReport: path.relative(root, reportPath), captureReportSha256: sha(reportPath), decisionAudit: path.relative(root, decisionAuditPath), decisionAuditSha256: sha(decisionAuditPath), sourceVideoSha256: report.output.sha256, persistedReadback: decisionAudit.persistedReadback}, output: {clean: {path: path.relative(root, cleanVideo), sha256: sha(cleanVideo), width: cleanStream.width, height: cleanStream.height, fps: cleanStream.r_frame_rate, frameCount: Number(cleanStream.nb_read_frames), fullDecodePass: true}, review: {path: path.relative(root, reviewVideo), sha256: sha(reviewVideo), width: reviewStream.width, height: reviewStream.height, fps: reviewStream.r_frame_rate, frameCount: Number(reviewStream.nb_read_frames), fullDecodePass: true}}, actualPixelMae: mae, beats: [{id: "source", purpose: "看清真实来源证据", startMs: 0, endMs: 2700}, {id: "decision", purpose: "真实替换并保存错误结论", startMs: 2700, endMs: 5300}, {id: "result", purpose: "停留在可验证结果", startMs: 5300, endMs: 12000}], failures, boundary: {reviewOnly: true, productionAdmission: false, currentStoryboardMutation: false}};
  audit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
  await fsp.writeFile(path.join(outputRoot, "audit-report.json"), `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify({status: audit.status, output: path.relative(root, outputRoot), reviewVideo: path.relative(root, reviewVideo), persistedReadback: decisionAudit.persistedReadback, mae, failures}, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
