#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const rendererRoot = path.join(root, "remotion-renderer");
const pub = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");

const DURATION = 170; // lock ends 80, hold 90f = 3000ms
const LOCK_START = 74;
const LOCK_DURATION = 6; // lock done at 80; hold 70f = 2333ms
const jobs = [
  {shotId: "ED-07", comp: "ED07TitleOverlay", tag: "ed07-title-depth-v1",
   title: {x: 96, y: 185, w: 432, h: 53}},
  {shotId: "ED-31", comp: "ED31TitleOverlay", tag: "ed31-title-depth-v1",
   title: {x: 111, y: 121, w: 547, h: 120}},
];

const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");

// shared public dir staging all shots before bundling
const stageRoot = path.join(root, "work/presenter-title-depth-v1/_stage");
fs.rmSync(stageRoot, {recursive: true, force: true});
for (const job of jobs) {
  const jpub = path.join(stageRoot, job.shotId);
  fs.mkdirSync(jpub, {recursive: true});
  const low = job.shotId.toLowerCase();
  const copy = [["presenter-depth-overlay-current-v1/assets/" + job.shotId + "/" + low + "-clean-base.jpg", "clean.jpg"],
                ["presenter-depth-overlay-current-v1/assets/" + job.shotId + "/" + low + "-title-overlay.png", "title.png"],
                ["presenter-light-overlay-system-v2/frames/" + job.shotId + ".png", "bound.png"]];
  for (const [src, dst] of copy) fs.copyFileSync(path.join(pub, src), path.join(jpub, dst));
}

const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/presenter-title-overlay-index.tsx"), publicDir: stageRoot, rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});

try {
  for (const job of jobs) {
    const jobRoot = path.join(root, "work/presenter-title-depth-v1", job.shotId);
    fs.rmSync(jobRoot, {recursive: true, force: true});
    fs.mkdirSync(jobRoot, {recursive: true});
    const jpub = path.join(stageRoot, job.shotId);

    const props = {
      cleanBaseSrc: `${job.shotId}/clean.jpg`,
      titleSrc: `${job.shotId}/title.png`,
      boundSrc: `${job.shotId}/bound.png`,
      titleX: job.title.x, titleY: job.title.y, titleW: job.title.w, titleH: job.title.h,
      durationFrames: DURATION, lockStart: LOCK_START, lockDuration: LOCK_DURATION,
    };
    const composition = await selectComposition({serveUrl, id: job.comp, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    const output = path.join(jobRoot, "review.mp4");
    await renderMedia({serveUrl, composition, inputProps: props, codec: "h264", outputLocation: output, scale: .5, crf: 16, concurrency: 2, puppeteerInstance: browser, logLevel: "warn"});
    for (const f of [0, 14, 30, 45, 60, 80, DURATION - 1])
      await renderStill({serveUrl, composition, inputProps: props, output: path.join(jobRoot, `frame-${f}.png`), frame: f, scale: .5, puppeteerInstance: browser, logLevel: "warn"});
    const final = await sharp(path.join(jobRoot, `frame-${DURATION - 1}.png`)).removeAlpha().raw().toBuffer();
    const reference = await sharp(path.join(jpub, "bound.png")).resize(960, 540).removeAlpha().raw().toBuffer();
    const mae = final.reduce((s, v, i) => s + Math.abs(v - reference[i]), 0) / final.length;
    execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"], {stdio: "pipe"});
    const bytes = fs.readFileSync(output);
    const holdMs = (DURATION - (LOCK_START + LOCK_DURATION)) / 30 * 1000;
    const receipt = {contract: "A1PresenterTitleDepthReceipt/v1", status: (mae <= 2.5 && holdMs >= 3000) ? "READY_FOR_USER_REVIEW" : "GATE_FAIL",
      shotId: job.shotId, video: {path: path.relative(root, output), sha256: hash(bytes), bytes: bytes.length, width: 960, height: 540, fps: 30},
      validation: {decoded: true, finalFrameMeanAbsoluteError: mae, threshold: 2.5, resultHoldMs: holdMs},
      productionAdmission: false, createdAt: new Date().toISOString()};
    fs.writeFileSync(path.join(jobRoot, "receipt.json"), JSON.stringify(receipt, null, 2));
    console.log(job.shotId, JSON.stringify({status: receipt.status, mae, holdMs}));
  }
} finally { await browser.close({silent: true}); }
