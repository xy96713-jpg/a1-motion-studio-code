#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";
import {discoverArticleScreenTargets} from "./lib/discover-article-screen-targets-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const url = process.argv[2];
const id = process.argv[3] || "blind-article-v1";
const output = path.resolve(root, process.argv[4] || `work/screen-recording-maturity-test-v1/blind-test-v1/${id}-scenario.json`);
if (!url) throw new Error("usage:build-auto-article-screen-scenario-v1 <url> <id> [output]");

const browser = await chromium.launch({headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
await page.goto(url, {waitUntil: "networkidle", timeout: 90000});
const discovered = await page.evaluate(discoverArticleScreenTargets);
await browser.close();
if (!discovered || !discovered.headings.length || discovered.bodyParagraphs.length < 1) throw new Error(`AUTO_ARTICLE_DISCOVERY_INSUFFICIENT:${JSON.stringify(discovered)}`);
if ((discovered.confidence?.route || 0) < .62) throw new Error(`AUTO_ARTICLE_DISCOVERY_CONFIDENCE_TOO_LOW:${JSON.stringify(discovered.confidence)}`);

const hero = discovered.headings[0];
const primary = discovered.bodyParagraphs[0];
const evidence = discovered.bodyParagraphs[Math.min(discovered.bodyParagraphs.length - 1, Math.max(1, Math.floor(discovered.bodyParagraphs.length * 0.45)))];
const image = discovered.images[0];
const scrollTargets = [{name: "blind-primary", row: primary, targetKind: "TEXT"}, ...(evidence !== primary ? [{name: "blind-evidence", row: evidence, targetKind: "TEXT"}] : []), ...(image ? [{name: "blind-image", row: image, targetKind: "REGION"}] : [])]
  .sort((a, b) => a.row.top - b.row.top);
const operations = [
  {atMs: 700, type: "observe", name: "blind-hero", selector: hero.selector, index: hero.index, targetKind: "TEXT"},
  ...scrollTargets.map((target, index) => ({atMs: [3500, 8500, 13500][index], type: "scroll", name: target.name, selector: target.row.selector, index: target.row.index, targetKind: target.targetKind, durationMs: index === 0 ? 1000 : 1100})),
];
const scenario = {
  contract: "A1GenericBrowserScreenScenario/v1", id, productId: "blind-live-article", productCategory: "unseen-article", projectRoot: root, url, width: 1920, height: 1080, durationMs: scrollTargets.length === 1 ? 10000 : 18000, readySelector: discovered.rootSelector, operations, primaryEvent: "blind-primary",
  directorPlan: {contract: "A1ScreenDirectorBrain/v1", sequence: "AUTO_DISCOVERED_ARTICLE", autoDiscovered: true, beats: [{id: "hero", technique: "ESTABLISH_WIDE", event: "blind-hero"}, {id: "primary", technique: "SEMANTIC_PUSH", event: "blind-primary"}, ...(evidence !== primary ? [{id: "evidence", technique: "EVIDENCE_UNDERLINE", event: "blind-evidence"}] : []), ...(image ? [{id: "image", technique: "DETAIL_DOLLY_IN_OUT", event: "blind-image"}] : [])], cameraBeats: [], skippedEffects: image ? [] : [{effect: "DETAIL_DOLLY_IN_OUT", reason: "NO_VERIFIED_SOURCE_IMAGE"}]},
  discovery: {contract: "A1AutoArticleDiscovery/v1", title: discovered.title, rootSelector: discovered.rootSelector, rootCandidates: discovered.rootCandidates, bodyRange: discovered.bodyRange, confidence: discovered.confidence, ambiguities: discovered.ambiguities, counts: {headings: discovered.headings.length, paragraphs: discovered.paragraphs.length, bodyParagraphs: discovered.bodyParagraphs.length, eligibleImages: discovered.images.length}, selected: {hero, primary, evidence, image}, orderedTargetNames: scrollTargets.map((target) => target.name)},
};
scenario.discovery.discoverySha256 = crypto.createHash("sha256").update(JSON.stringify(scenario.discovery)).digest("hex");
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(scenario, null, 2)}\n`);
console.log(JSON.stringify({status: "READY_FOR_BLIND_CAPTURE", output: path.relative(root, output), url, title: discovered.title, counts: scenario.discovery.counts, selected: scenario.discovery.selected, discoverySha256: scenario.discovery.discoverySha256}, null, 2));
