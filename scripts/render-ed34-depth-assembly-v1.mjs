#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const rendererRoot = path.join(root, "remotion-renderer");
const layersRoot = path.join(root, "work/ed34-depth-assembly-v1/layers");
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");

const DURATION = 167; // 5560ms @30
const LOCK_START = 72;
const LOCK_DURATION = 5; // crossfade ends at 77; hold 90f = 3000ms
const bbox = JSON.parse(fs.readFileSync(path.join(layersRoot, "bbox.json"), "utf8"));
const jobRoot = path.join(root, "work/ed34-depth-assembly-v1/render");
fs.rmSync(jobRoot, {recursive: true, force: true});
fs.mkdirSync(path.join(jobRoot, "public"), {recursive: true});
const pub = path.join(jobRoot, "public");
const layerNames = ["base","source","title","blue-text","track","route","bracket","fingerprint","misc","slider","node"];
for (const n of layerNames) fs.copyFileSync(path.join(layersRoot, `${n}.png`), path.join(pub, `${n}.png`));
const props = {
  contract: "A1ED34DepthAssembly/v1",
  sourceImage: "source.png", baseImage: "base.png",
  durationInFrames: DURATION, lockStart: LOCK_START, lockDuration: LOCK_DURATION,
  layers: {
    title: {file: "title.png", bbox: bbox.title},
    blueText: {file: "blue-text.png", bbox: bbox["blue-text"]},
    track: {file: "track.png", bbox: bbox.track},
    route: {file: "route.png", bbox: bbox.route},
    bracket: {file: "bracket.png", bbox: bbox.bracket},
    fingerprint: {file: "fingerprint.png", bbox: bbox.fingerprint},
    slider: {file: "slider.png", bbox: bbox.slider},
    node: {file: "node.png", bbox: bbox.node},
    misc: {file: "misc.png", bbox: bbox.misc},
  },
};
fs.writeFileSync(path.join(jobRoot, "props.json"), JSON.stringify(props, null, 2));

const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/ed34-depth-assembly-index.tsx"), publicDir: pub, rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
try {
  const composition = await selectComposition({serveUrl, id: "A1ED34DepthAssembly", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  const output = path.join(jobRoot, "review.mp4");
  await renderMedia({serveUrl, composition, inputProps: props, codec: "h264", outputLocation: output, scale: .5, crf: 16, concurrency: 2, puppeteerInstance: browser, logLevel: "warn"});
  for (const f of [0, 20, 45, 70, 95, 115, 130, LOCK_START + LOCK_DURATION, DURATION - 1])
    await renderStill({serveUrl, composition, inputProps: props, output: path.join(jobRoot, `frame-${f}.png`), frame: f, scale: .5, puppeteerInstance: browser, logLevel: "warn"});
  const final = await sharp(path.join(jobRoot, `frame-${DURATION - 1}.png`)).removeAlpha().raw().toBuffer();
  const reference = await sharp(fs.readFileSync(path.join(pub, "source.png"))).resize(960, 540).removeAlpha().raw().toBuffer();
  const mae = final.reduce((s, v, i) => s + Math.abs(v - reference[i]), 0) / final.length;
  execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"], {stdio: "pipe"});
  const bytes = fs.readFileSync(output);
  const receipt = {contract: "A1ED34DepthAssemblyReceipt/v1", status: mae <= 2.5 ? "READY_FOR_USER_REVIEW" : "FINAL_PARITY_FAIL", shotId: "ED-34",
    video: {path: path.relative(root, output), sha256: hash(bytes), bytes: bytes.length, width: 960, height: 540, fps: 30},
    validation: {decoded: true, finalFrameMeanAbsoluteError: mae, threshold: 2.5, resultHoldMs: (DURATION - (LOCK_START + LOCK_DURATION)) / 30 * 1000},
    productionAdmission: false, createdAt: new Date().toISOString()};
  fs.writeFileSync(path.join(jobRoot, "receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({status: receipt.status, mae, holdMs: receipt.validation.resultHoldMs, jobRoot}, null, 2));
} finally { await browser.close({silent: true}); }
