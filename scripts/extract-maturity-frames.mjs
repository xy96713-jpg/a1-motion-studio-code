#!/usr/bin/env node
import {createRequire} from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(process.cwd(), "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer");

const root = process.cwd();
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const propsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const outDir = "/tmp/maturity-frames";
fs.mkdirSync(outDir, {recursive: true});

const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));

// 6552 frames total. Pick frames mid-scene where content is visible
const targets = [
  {frame: 120, label: "scene1-entry"},
  {frame: 200, label: "scene1-mid"},
  {frame: 350, label: "scene2-entry"},
  {frame: 600, label: "scene3-mid"},
  {frame: 1000, label: "scene5-mid"},
  {frame: 1500, label: "scene8-mid"},
  {frame: 2000, label: "scene12-mid"},
  {frame: 2500, label: "scene16-mid"},
  {frame: 3000, label: "scene20-mid"},
  {frame: 3500, label: "scene25-mid"},
  {frame: 4000, label: "scene30-mid"},
  {frame: 4500, label: "scene35-mid"},
  {frame: 5000, label: "scene38-mid"},
  {frame: 5500, label: "scene42-mid"},
  {frame: 6000, label: "scene45-mid"},
  {frame: 6400, label: "scene47-exit"},
];

const bundled = await bundle({entryPoint, webpackOverride: (c) => c});
const browser = await openBrowser("chrome");

try {
  const comp = await selectComposition({serveUrl: bundled, id: "A1SystemLineHFullTimelineReview", inputProps: props});
  console.log(`Composition: ${comp.id}, ${comp.durationInFrames} frames, ${comp.width}x${comp.height}`);
  for (const t of targets) {
    if (t.frame >= comp.durationInFrames) { console.log(`skip ${t.label}: frame ${t.frame} >= ${comp.durationInFrames}`); continue; }
    const outPath = path.join(outDir, `${t.label}.png`);
    await renderStill({
      serveUrl: bundled,
      composition: comp,
      frame: t.frame,
      output: outPath,
      browser,
      inputProps: props,
    });
    console.log(`✓ ${t.label} @ frame ${t.frame}`);
  }
} finally {
  await browser.close({});
}
console.log("Done.");
