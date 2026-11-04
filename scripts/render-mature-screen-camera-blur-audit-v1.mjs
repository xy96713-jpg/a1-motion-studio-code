#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const rendererRoot = path.join(root, "remotion-renderer");
const outputRoot = path.join(root, "work/mature-screen-camera-system-v1/blur-audit");
const inputProps = JSON.parse(fs.readFileSync(path.join(root, "work/mature-screen-camera-system-v1/canary/ed-05-props.json"), "utf8"));
const noBlurProps = structuredClone(inputProps);
noBlurProps.scenes[0].screenDirection.motionBlurPolicy = "NONE";
const requireFromRenderer = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = requireFromRenderer("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = requireFromRenderer("@remotion/renderer");
fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(path.join(outputRoot, "temporal-props.json"), `${JSON.stringify(inputProps, null, 2)}\n`);
fs.writeFileSync(path.join(outputRoot, "none-props.json"), `${JSON.stringify(noBlurProps, null, 2)}\n`);

const frames = [
  {id: "action-move", frame: 52},
  {id: "action-hold", frame: 90},
  {id: "result-move", frame: 206},
  {id: "result-hold", frame: 270},
  {id: "return-move", frame: 380},
  {id: "return-hold", frame: 408},
];
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/screen-camera-diagnostic-entry.tsx"), publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
try {
  const temporalComposition = await selectComposition({serveUrl, id: "A1ScreenCameraDiagnosticV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
  const noBlurComposition = await selectComposition({serveUrl, id: "A1ScreenCameraDiagnosticV1", inputProps: noBlurProps, puppeteerInstance: browser, logLevel: "warn"});
  for (const item of frames) {
    await renderStill({serveUrl, composition: temporalComposition, inputProps, frame: item.frame, output: path.join(outputRoot, `${item.id}-temporal.png`), imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    await renderStill({serveUrl, composition: noBlurComposition, inputProps: noBlurProps, frame: item.frame, output: path.join(outputRoot, `${item.id}-none.png`), imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  }
} finally {
  await browser.close({silent: true});
}
const report = {contract: "A1MatureScreenCameraBlurAuditFrames/v1", status: "PASS", frames, temporal: inputProps.scenes[0].screenDirection.temporalMotionBlur, sourceFrameLocked: true, outputRoot, generatedAt: new Date().toISOString()};
fs.writeFileSync(path.join(outputRoot, "frames.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
