#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runRoot = path.resolve(root, process.argv[2] || "work/background-cap-production-v1/runs/2026-08-28T02-59-09-957Z");
const failures = [];
const results = [];
const shotIds = fs.readdirSync(runRoot).filter((name) => /^ed-\d+\.cap$/u.test(name)).map((name) => name.slice(0,-4).toUpperCase()).sort((a,b)=>Number(a.slice(3))-Number(b.slice(3)));
for (const shotId of shotIds) {
  const slug = shotId.toLowerCase();
  const configPath = path.join(runRoot, `${slug}.cap/project-config.json`);
  const receiptPath = path.join(runRoot, `${slug}.cap/a1-background-receipt.json`);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const zooms = config.timeline?.zoomSegments || [];
  const shotFailures = [];
  if (zooms.length > 1) shotFailures.push(`ZOOM_COUNT:${zooms.length}`);
  if (zooms.some((zoom) => zoom.amount < 1.14)) shotFailures.push("ZOOM_AMOUNT_TOO_LOW_TO_READ");
  if (zooms.some((zoom) => zoom.amount > 1.18)) shotFailures.push("ZOOM_AMOUNT_TOO_HIGH");
  if (zooms.some((zoom) => zoom.instantAnimation !== false)) shotFailures.push("INSTANT_ZOOM_FORBIDDEN");
  if (zooms.some((zoom, index) => index > 0 && zoom.start < zooms[index - 1].end + .8)) shotFailures.push("ADJACENT_ZOOM_GAP_TOO_SHORT");
  if (Number(receipt.cameraPolicy?.resultHoldSeconds || 0) < .8) shotFailures.push("RESULT_HOLD_TOO_SHORT");
  if (Number(config.cursor?.size || 0) > 105) shotFailures.push("CURSOR_TOO_LARGE");
  if (Number(config.cursor?.motionBlur || 0) > .25) shotFailures.push("CURSOR_BLUR_TOO_HIGH");
  if (Number(config.cursor?.rotationAmount || 0) > .08) shotFailures.push("CURSOR_ROTATION_TOO_HIGH");
  if (Number(config.screenMovementSpring?.stiffness || 0) > 170) shotFailures.push("CAMERA_SPRING_TOO_STIFF");
  const storyboardRoot=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1"),setupPath=path.join(storyboardRoot,`${shotId}-setup.png`),resultPath=path.join(storyboardRoot,`${shotId}-result.png`);
  const intentionalFullscreenThemeTransition = receipt.directorFamily?.id === "FULLSCREEN_RESULT_TRANSITION";
  let setupLuma=null,resultLuma=null,lumaDelta=null;
  if(fs.existsSync(setupPath)&&fs.existsSync(resultPath)){const [setupStats,resultStats]=await Promise.all([sharp(setupPath).stats(),sharp(resultPath).stats()]);setupLuma=setupStats.channels.slice(0,3).reduce((sum,item)=>sum+item.mean,0)/765;resultLuma=resultStats.channels.slice(0,3).reduce((sum,item)=>sum+item.mean,0)/765;lumaDelta=Math.abs(setupLuma-resultLuma);if(lumaDelta>.32&&!intentionalFullscreenThemeTransition)shotFailures.push(`PAGE_THEME_JUMP:${lumaDelta.toFixed(3)}`);if(intentionalFullscreenThemeTransition&&lumaDelta<.32)shotFailures.push(`FULLSCREEN_THEME_TRANSITION_MISSING:${lumaDelta.toFixed(3)}`);}
  failures.push(...shotFailures.map((failure) => `${shotId}:${failure}`));
  results.push({id: shotId, status: shotFailures.length ? "FAIL" : "PASS", zoomCount: zooms.length, zoomAmount: zooms[0]?.amount || 1, resultHoldSeconds: receipt.cameraPolicy?.resultHoldSeconds, cursorSize: config.cursor?.size, cursorMotionBlur: config.cursor?.motionBlur, cameraSpring: config.screenMovementSpring,intentionalFullscreenThemeTransition,setupLuma,resultLuma,lumaDelta, failures: shotFailures});
}
const report = {contract: "A1BackgroundCapCalmMotionAudit/v1", status: failures.length ? "FAIL" : "PASS", runRoot: path.relative(root, runRoot), requirements: {maximumZoomsPerShot: 1, minimumZoomAmount: 1.14, maximumZoomAmount: 1.18, minimumResultHoldSeconds: .8, maximumCursorSize: 105, maximumCursorMotionBlur: .25, maximumCursorRotation: .08, maximumCameraSpringStiffness: 170,maximumPageThemeLumaDelta:.32}, fixtures: results, failures};
const outputPath = path.join(runRoot, "calm-motion-audit.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({...report, outputPath: path.relative(root, outputPath)}, null, 2));
if (failures.length) process.exitCode = 1;
