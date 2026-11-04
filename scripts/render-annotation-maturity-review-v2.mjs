#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const rendererRoot = path.join(root, "remotion-renderer");
const oldRoot = path.join(root, "work/screen-recording-maturity-test-v1/annotation-batch-v1/render");
const outRoot = path.join(root, "work/screen-recording-maturity-test-v1/annotation-batch-v1/render-v2");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const pixelMae = async (leftPath, rightPath) => {
  const left = await sharp(leftPath).removeAlpha().raw().toBuffer();
  const right = await sharp(rightPath).removeAlpha().raw().toBuffer();
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length;
};
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));
const decode = (file) => { execFileSync(ffmpeg, ["-v", "error", "-i", file, "-f", "null", "-"]); return true; };

const buildProps = (base) => {
  const props = structuredClone(base);
  const {scene} = props;
  const highlight = props.arrow.from;
  const rejection = props.arrow.to;
  const phrase = props.handoff.from;
  const privacy = props.privacy.target;
  const pose = (rect, scale) => {
    const half = 0.5 / scale;
    const clamp = (value) => Math.min(1 - half, Math.max(half, value));
    return {x: clamp(rect.x + rect.width / 2), y: clamp(rect.y + rect.height / 2), scale};
  };
  props.arrow = {...props.arrow, startMs: 2700, endMs: 3500, label: "错误结论 · 删除"};
  props.handoff = {...props.handoff, startMs: 6800, endMs: 7800};
  props.privacy = {...props.privacy, startMs: 7800, endMs: 9200};
  props.steps = {...props.steps, startMs: 9200, endMs: 10000};
  props.phases = [
    {id: "HIGHLIGHT_WASH", startMs: 0, endMs: 2400, label: "保留来源证据", detail: "先让观众看清依据"},
    {id: "DECISION_CONNECTOR", startMs: 2400, endMs: 3800, label: "做出判断", detail: "从来源证据指向错误结论"},
    {id: "REJECTION_STRIKE", startMs: 3800, endMs: 5100, label: "删除错误结论", detail: "红色删除线只落在目标短语"},
    {id: "SHORT_PHRASE_CIRCLE", startMs: 5100, endMs: 6700, label: "保留可验证结果", detail: "单次圈选，不再叠加其他标记"},
    {id: "FOCUS_HANDOFF", startMs: 6700, endMs: 7800, label: "交接到敏感字段", detail: "降低背景，不遮住上下文"},
    {id: "PRIVACY_BLUR", startMs: 7800, endMs: 9200, label: "遮挡测试账号", detail: "只处理已验证的字段区域"},
    {id: "STEP_MARKERS", startMs: 9200, endMs: 10000, label: "回看处理顺序", detail: "编号对应真实目标"},
  ];
  scene.cameraTrack = [
    {atMs: 0, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
    {atMs: 700, x: 0.5, y: 0.5, scale: 1, easingToNext: "cinematic-in-out"},
    {atMs: 1150, ...pose(highlight, 1.16), easingToNext: "hold"},
    {atMs: 2200, ...pose(highlight, 1.16), easingToNext: "restore"},
    {atMs: 2700, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
    {atMs: 3500, x: 0.5, y: 0.5, scale: 1, easingToNext: "cinematic-in-out"},
    {atMs: 4000, ...pose(rejection, 1.16), easingToNext: "hold"},
    {atMs: 4900, ...pose(rejection, 1.16), easingToNext: "glide"},
    {atMs: 5350, ...pose(phrase, 1.16), easingToNext: "hold"},
    {atMs: 6500, ...pose(phrase, 1.16), easingToNext: "restore"},
    {atMs: 7000, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
    {atMs: 7800, x: 0.5, y: 0.5, scale: 1, easingToNext: "cinematic-in-out"},
    {atMs: 8300, ...pose(privacy, 1.16), easingToNext: "hold"},
    {atMs: 9000, ...pose(privacy, 1.16), easingToNext: "restore"},
    {atMs: 9500, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
    {atMs: 10000, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
  ];
  scene.screenDirection.attentionTrack = [
    {beat: "highlight-real-source", startMs: 1150, endMs: 2200, region: highlight, lineRects: props.scene.screenDirection.attentionTrack[0].lineRects, treatment: "SOURCE_BOUND_HIGHLIGHT_WASH", colorRole: "AMBER_WARNING"},
    {beat: "rejection-real-source", startMs: 4200, endMs: 4900, region: rejection, lineRects: props.scene.screenDirection.attentionTrack[1].lineRects, treatment: "SOURCE_BOUND_STRIKETHROUGH", colorRole: "RED_REJECT"},
    {beat: "short-phrase-real-source", startMs: 5500, endMs: 6500, region: phrase, lineRects: props.scene.screenDirection.attentionTrack[2].lineRects, treatment: "SOURCE_BOUND_CIRCLE", colorRole: "TEAL_EVIDENCE"},
  ];
  return props;
};

const render = async (renderMedia, serveUrl, browser, composition, props, outputLocation) => renderMedia({serveUrl, composition, inputProps: props, outputLocation, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});

async function main() {
  const base = JSON.parse(fs.readFileSync(path.join(oldRoot, "props.json"), "utf8"));
  const props = buildProps(base);
  const cleanProps = {...props, showPhaseLabels: false};
  await fsp.mkdir(outRoot, {recursive: true});
  await fsp.writeFile(path.join(outRoot, "props.json"), `${JSON.stringify(props, null, 2)}\n`);
  const require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler");
  const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/AnnotationMaturityReviewEntry.tsx"), publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const cleanVideo = path.join(outRoot, "annotation-clean-1280x720-60fps.mp4");
  const reviewVideo = path.join(outRoot, "annotation-review-1280x720-60fps.mp4");
  const sampleTimes = {highlight: 1700, arrow: 3150, strike: 4500, circle: 6000, handoff: 7300, privacy: 8500, steps: 9700};
  const pixelMaeByEffect = {};
  try {
    const reviewComposition = await selectComposition({serveUrl, id: "A1AnnotationMaturityReviewV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    const cleanComposition = await selectComposition({serveUrl, id: "A1AnnotationMaturityReviewV1", inputProps: cleanProps, puppeteerInstance: browser, logLevel: "warn"});
    await render(renderMedia, serveUrl, browser, cleanComposition, cleanProps, cleanVideo);
    await render(renderMedia, serveUrl, browser, reviewComposition, props, reviewVideo);
    for (const [id, atMs] of Object.entries(sampleTimes)) {
      await renderStill({serveUrl, composition: reviewComposition, inputProps: props, frame: Math.round(atMs / 1000 * 60), output: path.join(outRoot, `${id}.png`), imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const absentProps = id === "arrow" ? {...cleanProps, showArrow: false} : id === "handoff" ? {...cleanProps, showHandoff: false} : id === "privacy" ? {...cleanProps, showPrivacy: false} : id === "steps" ? {...cleanProps, showSteps: false} : {...cleanProps, scene: {...cleanProps.scene, screenDirection: {...cleanProps.scene.screenDirection, attentionTrack: []}}};
      const absentComposition = await selectComposition({serveUrl, id: "A1AnnotationMaturityReviewV1", inputProps: absentProps, puppeteerInstance: browser, logLevel: "warn"});
      const absentPath = path.join(outRoot, `${id}-absent.png`);
      await renderStill({serveUrl, composition: absentComposition, inputProps: absentProps, frame: Math.round(atMs / 1000 * 60), output: absentPath, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      pixelMaeByEffect[id] = await pixelMae(path.join(outRoot, `${id}.png`), absentPath);
    }
  } finally {
    await browser.close({silent: true});
  }
  const cleanProbe = probe(cleanVideo);
  const reviewProbe = probe(reviewVideo);
  const cleanStream = cleanProbe.streams.find((item) => item.codec_type === "video");
  const reviewStream = reviewProbe.streams.find((item) => item.codec_type === "video");
  const failures = [];
  if (cleanStream.width !== 1280 || cleanStream.height !== 720 || cleanStream.r_frame_rate !== "60/1" || Number(cleanStream.nb_read_frames) !== 600 || !decode(cleanVideo)) failures.push("CLEAN_MEDIA");
  if (reviewStream.width !== 1280 || reviewStream.height !== 720 || reviewStream.r_frame_rate !== "60/1" || Number(reviewStream.nb_read_frames) !== 600 || !decode(reviewVideo)) failures.push("REVIEW_MEDIA");
  if (Object.values(pixelMaeByEffect).some((value) => value < 0.015)) failures.push("PIXEL_EFFECT");
  const prior = JSON.parse(fs.readFileSync(path.join(oldRoot, "audit-report.json"), "utf8"));
  const audit = {...prior, status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", outputs: {...prior.outputs, clean: {...prior.outputs.clean, path: path.relative(root, cleanVideo), sha256: sha(cleanVideo), frameCount: Number(cleanStream.nb_read_frames)}, review: {...prior.outputs.review, path: path.relative(root, reviewVideo), sha256: sha(reviewVideo), frameCount: Number(reviewStream.nb_read_frames)}}, actualPixelMae: pixelMaeByEffect, checks: {...prior.checks, fullDecode: failures.length === 0, allEffectsPixelVisible: Object.values(pixelMaeByEffect).every((value) => value >= 0.015)}, failures, renderRevision: "v2-director-arrow-rail"};
  audit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
  await fsp.writeFile(path.join(outRoot, "audit-report.json"), `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify({status: audit.status, output: path.relative(root, outRoot), reviewVideo: path.relative(root, reviewVideo), pixelMae: pixelMaeByEffect, failures}, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
