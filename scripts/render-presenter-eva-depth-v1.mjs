#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const rr = path.join(root, "remotion-renderer");
const stage = path.join(root, "work/presenter-eva-depth-v1/_stage");
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const DURATION = 180, LOCK_START = 80, LOCK_DURATION = 6;
const jobs = [
  {shotId: "ED-31", comp: "ED31Eva"},
  {shotId: "ED-07", comp: "ED07Eva"},
];
const require = createRequire(path.join(rr, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const serveUrl = await bundle({entryPoint: path.join(rr, "src/eva-headline-index.tsx"), publicDir: stage, rootDir: rr, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
try {
  for (const j of jobs) {
    const out = path.join(root, "work/presenter-eva-depth-v1", j.shotId);
    fs.rmSync(out, {recursive: true, force: true}); fs.mkdirSync(out, {recursive: true});
    const composition = await selectComposition({serveUrl, id: j.comp, puppeteerInstance: browser, logLevel: "warn"});
    const mp4 = path.join(out, "review.mp4");
    await renderMedia({serveUrl, composition, codec: "h264", outputLocation: mp4, scale: .5, crf: 16, concurrency: 2, puppeteerInstance: browser, logLevel: "warn"});
    for (const f of [0, 18, 40, 62, 80, DURATION - 1])
      await renderStill({serveUrl, composition, output: path.join(out, `frame-${f}.png`), frame: f, scale: .5, puppeteerInstance: browser, logLevel: "warn"});
    const fin = await sharp(path.join(out, `frame-${DURATION - 1}.png`)).removeAlpha().raw().toBuffer();
    const ref = await sharp(path.join(stage, j.shotId, "target.png")).resize(960, 540).removeAlpha().raw().toBuffer();
    const mae = fin.reduce((s, v, i) => s + Math.abs(v - ref[i]), 0) / fin.length;
    execFileSync("ffmpeg", ["-v", "error", "-i", mp4, "-f", "null", "-"], {stdio: "pipe"});
    const bytes = fs.readFileSync(mp4);
    const holdMs = (DURATION - (LOCK_START + LOCK_DURATION)) / 30 * 1000;
    const receipt = {contract: "A1EvaHeadlineReceipt/v1", status: (mae <= 2.5 && holdMs >= 3000) ? "READY_FOR_USER_REVIEW" : "GATE_FAIL",
      shotId: j.shotId, video: {path: path.relative(root, mp4), sha256: hash(bytes), bytes: bytes.length, width: 960, height: 540, fps: 30},
      validation: {finalFrameMAE: mae, threshold: 2.5, resultHoldMs: holdMs}, typography: {font: "SourceHanSerifCN-Heavy", horizontalScale: 0.60, englishFont: "Times New Roman Bold", englishScaleX: 0.70, englishScaleY: 1.15, role: "EVA_HEADLINE/EVA_MECHANISM_CJK"},
      productionAdmission: false, createdAt: new Date().toISOString()};
    fs.writeFileSync(path.join(out, "receipt.json"), JSON.stringify(receipt, null, 2));
    console.log(j.shotId, JSON.stringify({status: receipt.status, mae, holdMs}));
  }
} finally { await browser.close({silent: true}); }
