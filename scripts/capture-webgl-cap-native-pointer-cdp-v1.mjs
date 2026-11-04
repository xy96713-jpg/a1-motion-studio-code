#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync, spawn, spawnSync} from "node:child_process";
import sharp from "sharp";
import {chromium} from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const cap = process.env.CAP_BIN || "/Applications/Cap.app/Contents/MacOS/cap-cli";
const url = "http://localhost:4276/reference-field";
const tag = process.env.A1_WEBGL_CDP_TAG || "v1";
const debugPort = Number(process.env.A1_WEBGL_CDP_PORT || 9223);
const profile = path.join(os.tmpdir(), `a1-webgl-cdp-${tag}`);
const outDir = path.join(root, `work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-cap-native-pointer-cdp-${tag}`);
const capProject = path.join(outDir, "webgl-native-pointer.cap");
const pageIdentity = path.join(outDir, "page-identity.png");
const windowIdentity = path.join(outDir, "window-identity.png");
const sessionPath = path.join(outDir, "capture-session.json");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (fn, timeoutMs = 20000, stepMs = 200) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await sleep(stepMs);
  }
  return null;
};
const probeImage = async (file) => sharp(file).metadata();
const normalizedMae = async (pagePath, capturePath, chromeTop) => {
  const pageMeta = await probeImage(pagePath);
  const capMeta = await probeImage(capturePath);
  const scale = Number(capMeta.width) / Number(pageMeta.width);
  const cropTop = Math.max(0, Math.round(chromeTop * scale));
  const cropHeight = Math.min(Number(capMeta.height) - cropTop, Math.round(Number(pageMeta.height) * scale));
  if (!pageMeta.width || !pageMeta.height || !capMeta.width || cropHeight <= 0) return 1;
  const left = await sharp(pagePath).removeAlpha().raw().toBuffer();
  const right = await sharp(capturePath).extract({left: 0, top: cropTop, width: Number(capMeta.width), height: cropHeight}).resize(Number(pageMeta.width), Number(pageMeta.height), {fit: "fill"}).removeAlpha().raw().toBuffer();
  if (left.length !== right.length) return 1;
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index] - right[index]);
  return sum / left.length / 255;
};
const targets = () => {
  const result = JSON.parse(execFileSync(cap, ["targets", "windows", "--json"], {encoding: "utf8"}));
  return Array.isArray(result) ? result : result.windows || [];
};

await fsp.mkdir(outDir, {recursive: true});
if (fs.existsSync(capProject)) throw new Error(`webgl-cdp-cap-project-exists:${capProject}`);
fs.rmSync(profile, {recursive: true, force: true});
const chromeArgs = ["-na", "Google Chrome", "--args", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", `--app=${url}`, "--window-size=1280,720", "--window-position=80,80", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", `--remote-debugging-port=${debugPort}`];
spawn("open", chromeArgs, {stdio: "ignore", detached: true}).unref();
let browser;
let captureTarget;
let stopped = false;
const plannedEvents = [];
try {
  await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok; } catch { return false; }
  }, 30000, 250) || (() => { throw new Error("webgl-cdp-remote-debugging-not-ready"); })();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => candidate.url().includes("localhost:4276/reference-field")) || pages[0];
  if (!page) throw new Error("webgl-cdp-page-missing");
  await page.emulateMedia({reducedMotion: "no-preference"});
  await page.reload({waitUntil: "networkidle", timeout: 90000});
  await page.waitForLoadState("domcontentloaded", {timeout: 30000}).catch(() => {});
  await page.waitForSelector('canvas[data-reference-field="flowmap"]', {state: "visible", timeout: 30000});
  await page.waitForFunction(() => document.querySelector('[data-reference-field-status]')?.getAttribute("data-mode") === "live", null, {timeout: 30000}).catch(() => {});
  const canvasBox = await page.locator('canvas[data-reference-field="flowmap"]').boundingBox();
  const geometry = await page.evaluate(() => ({outerHeight, innerHeight, innerWidth, devicePixelRatio, href: location.href, title: document.title, webgl: Boolean(document.querySelector('canvas[data-reference-field="flowmap"]')?.getContext("webgl2") || document.querySelector('canvas[data-reference-field="flowmap"]')?.getContext("webgl"))}));
  if (!canvasBox || !geometry.webgl) throw new Error(`webgl-cdp-identity-failed:${JSON.stringify({canvasBox, geometry})}`);
  await page.screenshot({path: pageIdentity});
  const chromeTop = Math.max(0, geometry.outerHeight - geometry.innerHeight);
  let candidate = null;
  let best = null;
  for (let attempt = 0; attempt < 30 && !candidate; attempt += 1) {
    for (const item of targets().filter((entry) => entry.ownerName === "Google Chrome" && Number(entry.bounds?.width) >= 1000 && Number(entry.bounds?.height) >= 500)) {
      const screenshotPath = path.join(outDir, `window-${item.id}.png`);
      try {
        execFileSync(cap, ["screenshot", "--window", String(item.id), "--path", screenshotPath, "--json"], {encoding: "utf8"});
        const mae = await normalizedMae(pageIdentity, screenshotPath, chromeTop);
        if (!best || mae < best.mae) best = {item, mae, screenshotPath};
        if (mae <= 0.14) { candidate = {item, mae, screenshotPath}; break; }
      } catch {}
    }
    if (!candidate) await sleep(300);
  }
  if (!candidate) throw new Error(`webgl-cdp-window-identity-failed:${JSON.stringify(best)}`);
  captureTarget = candidate.item;
  await fsp.copyFile(candidate.screenshotPath, windowIdentity);
  const point = (x, y, kind = "move", t0) => plannedEvents.push({tMs: Math.max(0, Math.round(performance.now() - t0)), x: Number(((x - canvasBox.x) / canvasBox.width).toFixed(6)), y: Number(((y - canvasBox.y) / canvasBox.height).toFixed(6)), kind});
  const startOutput = execFileSync(cap, ["record", "start", "--detach", "--window", String(captureTarget.id), "--fps", "60", "--duration", "9", "--path", capProject, "--json"], {encoding: "utf8"});
  const t0 = performance.now();
  plannedEvents.push({name: "capture_start", tMs: 0});
  const glide = async (x, y, durationMs, name) => {
    const prior = plannedEvents.filter((event) => event.kind === "move").at(-1) || {x: 0.82, y: 0.82};
    const fromX = canvasBox.x + prior.x * canvasBox.width;
    const fromY = canvasBox.y + prior.y * canvasBox.height;
    const steps = Math.max(18, Math.round(durationMs / 16));
    for (let index = 1; index <= steps; index += 1) {
      const u = index / steps;
      const eased = u * u * (3 - 2 * u);
      const px = fromX + (x - fromX) * eased;
      const py = fromY + (y - fromY) * eased;
      await page.mouse.move(px, py);
      point(px, py, "move", t0);
      await sleep(durationMs / steps);
    }
    plannedEvents.push({name, tMs: Math.max(0, Math.round(performance.now() - t0))});
  };
  await sleep(850);
  await glide(canvasBox.x + canvasBox.width * 0.48, canvasBox.y + canvasBox.height * 0.53, 900, "canvas_pointer_enter");
  await sleep(1200);
  const clickX = canvasBox.x + canvasBox.width * 0.48;
  const clickY = canvasBox.y + canvasBox.height * 0.53;
  await page.mouse.move(clickX, clickY);
  await page.mouse.down();
  point(clickX, clickY, "down", t0);
  plannedEvents.push({name: "canvas_pointer_down", tMs: Math.max(0, Math.round(performance.now() - t0)), x: 0.48, y: 0.53});
  await sleep(90);
  await page.mouse.up();
  point(clickX, clickY, "up", t0);
  plannedEvents.push({name: "canvas_pointer_up", tMs: Math.max(0, Math.round(performance.now() - t0)), x: 0.48, y: 0.53});
  await sleep(1550);
  await glide(canvasBox.x + canvasBox.width * 0.77, canvasBox.y + canvasBox.height * 0.34, 950, "canvas_pointer_retarget");
  await sleep(900);
  plannedEvents.push({name: "capture_end", tMs: Math.max(0, Math.round(performance.now() - t0))});
  await sleep(2100);
  execFileSync(cap, ["record", "stop", "--path", capProject, "--json"], {encoding: "utf8"});
  stopped = true;
  fs.writeFileSync(sessionPath, `${JSON.stringify({contract: "A1NativeCanvasCaptureSession/v1", url, captureTarget, identityMae: candidate.mae, pageGeometry: geometry, pageCanvasBox: canvasBox, startOutput: JSON.parse(startOutput), plannedEvents, sourcePageSha256: sha256(pageIdentity), windowIdentitySha256: sha256(windowIdentity)}, null, 2)}\n`);
} finally {
  if (!stopped && fs.existsSync(capProject)) {
    try { execFileSync(cap, ["record", "stop", "--path", capProject, "--json"], {encoding: "utf8"}); } catch {}
  }
  await browser?.close().catch(() => {});
  spawnSync("pkill", ["-TERM", "-f", profile], {stdio: "ignore"});
}
console.log(JSON.stringify({status: "CAPTURED", capProject: path.relative(root, capProject), session: path.relative(root, sessionPath), target: captureTarget}, null, 2));
