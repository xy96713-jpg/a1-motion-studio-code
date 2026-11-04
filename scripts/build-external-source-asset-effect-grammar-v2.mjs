#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {assertExternalSourceAssetEffectGrammar, compileExternalSourceAssetEffectGrammar} from "../apps/studio-next/src/lib/a1-external-source-asset-effect-grammar-v2.mjs";

const root = process.cwd();
const outputRoot = path.join(root, "work/external-source-asset-effect-grammar-v2");
const chapingRoot = path.join(outputRoot, "chaping-sequences");
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");
const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const ensureDir = (dir) => fs.mkdirSync(dir, {recursive: true});
const publicRoot = path.join(root, "apps/studio-next/public");
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));

const hupoEffects = {
  "H-R01": ["SOURCE_PRESERVE"],
  "H-R02": ["SOURCE_PRESERVE"],
  "H-R03": ["SOURCE_PRESERVE", "LABEL_ANCHOR"],
  "H-R04": ["SOURCE_PRESERVE"],
  "H-R05": ["SOURCE_PRESERVE", "LABEL_ANCHOR"],
  "H-R06": ["SOURCE_PRESERVE", "LABEL_ANCHOR"],
  "H-R07": ["SOURCE_PRESERVE"],
  "H-R08": ["CLEAN_CUTOUT", "CONTACT_SHADOW", "LABEL_ANCHOR"],
  "H-R09": ["NO_EXTERNAL_ASSET_EFFECT"],
  "H-R10": ["CLEAN_CUTOUT", "CONTACT_SHADOW"],
};

const crossCreatorEffects = {
  "fern:F-R01": ["SOURCE_PRESERVE", "PAPER_EDGE"],
  "fern:F-R02": ["SOURCE_PRESERVE"],
  "fern:F-R03": ["SOURCE_PRESERVE", "LABEL_ANCHOR"],
  "fern:F-R04": ["SOURCE_PRESERVE"],
  "vox:V-R01": ["SOURCE_PRESERVE", "PAPER_EDGE"],
  "vox:V-R02": ["SOURCE_PRESERVE"],
  "vox:V-R03": ["SOURCE_PRESERVE", "PAPER_EDGE", "LABEL_ANCHOR"],
  "vox:V-R04": ["SOURCE_PRESERVE", "LABEL_ANCHOR"],
  "cleo-abram:A-R01": ["SOURCE_PRESERVE"],
  "cleo-abram:A-R02": ["SOURCE_PRESERVE"],
  "cleo-abram:A-R03": ["SOURCE_PRESERVE", "LABEL_ANCHOR"],
  "cleo-abram:A-R04": ["SOURCE_PRESERVE"],
};

const magnatesEffects = {
  "magnates-cold-open": ["SOURCE_PRESERVE"],
  "magnates-archive-build": ["SOURCE_PRESERVE", "PAPER_EDGE", "LABEL_ANCHOR"],
  "magnates-brand-object-macro": ["SOURCE_PRESERVE", "OBJECT_PLANE_ANCHOR"],
  "magnates-expansion-map": ["SOURCE_PRESERVE", "LABEL_ANCHOR"],
};

const atestEffects = {
  "intro-credit-language": ["SOURCE_PRESERVE", "PAPER_EDGE", "LABEL_ANCHOR"],
  "first-evidence-rhythm": ["SOURCE_PRESERVE", "CLEAN_CUTOUT", "CONTRAST_STROKE", "LABEL_ANCHOR"],
  "presenter-hero-title": ["NO_EXTERNAL_ASSET_EFFECT"],
  "chapter-wash-money": ["SOURCE_PRESERVE", "OBJECT_PLANE_ANCHOR"],
  "explanation-infographic": ["SOURCE_PRESERVE", "LABEL_ANCHOR"],
  "foreground-conclusion-card": ["CLEAN_CUTOUT", "CONTRAST_STROKE", "CONTACT_SHADOW", "LABEL_ANCHOR"],
  "prop-and-legal-income": ["CLEAN_CUTOUT", "CONTRAST_STROKE", "CONTACT_SHADOW", "LABEL_ANCHOR", "OBJECT_PLANE_ANCHOR"],
  "evidence-highlight": ["SOURCE_PRESERVE", "CLEAN_CUTOUT", "CONTRAST_STROKE", "LABEL_ANCHOR"],
  "warning-chapter": ["SOURCE_PRESERVE", "PAPER_EDGE"],
};

const chapingSpecs = [
  {id: "chaping-headphone-pixel-avatar", video: "/Users/a1/Documents/Codex/声音/independent-visual-director/20260812-chapingjun-style-study/source/BV1hFEWzjEUd-video.mp4", center: 75, sourceClass: "ILLUSTRATION_OR_AVATAR", effects: ["SOURCE_PRESERVE", "LABEL_ANCHOR"]},
  {id: "chaping-rare-earth-historical-comparison", video: "/Users/a1/Documents/Codex/声音/independent-visual-director/20260812-chapingjun-style-study/source/BV1CmGAzcEde-video.mp4", center: 195, sourceClass: "ARCHIVE_PHOTO", effects: ["SOURCE_PRESERVE", "PAPER_EDGE", "LABEL_ANCHOR"]},
  {id: "chaping-chip-document-company-links", video: "/Users/a1/Documents/Codex/声音/independent-visual-director/20260812-chapingjun-style-study/source/BV18rgBzNEYb-video.mp4", center: 30, sourceClass: "DOCUMENT_EVIDENCE", effects: ["SOURCE_PRESERVE", "LABEL_ANCHOR"]},
  {id: "chaping-chip-official-photo-wafer", video: "/Users/a1/Documents/Codex/声音/independent-visual-director/20260812-chapingjun-style-study/source/BV18rgBzNEYb-video.mp4", center: 495, sourceClass: "OFFICIAL_PHOTO", effects: ["SOURCE_PRESERVE", "LABEL_ANCHOR"]},
];

function inferSourceClass(sequence = {}) {
  const flow = (sequence.mediumFlow || []).join(" ");
  const topology = `${sequence.topology || ""} ${sequence.label || ""}`;
  if (/document|archive|proof|evidence/iu.test(`${flow} ${topology}`)) return "DOCUMENT_OR_ARCHIVE";
  if (/presenter|host|human/iu.test(`${flow} ${topology}`)) return "REAL_PERSON_FOOTAGE";
  if (/physical-object|object|macro/iu.test(`${flow} ${topology}`)) return "PHYSICAL_OBJECT";
  if (/screen|interface/iu.test(`${flow} ${topology}`)) return "REAL_SCREEN_OR_SCENE";
  return "EXPLAINER_OR_TYPE";
}

function corpusFrames(sequence) {
  return (sequence.frames || []).map((frame) => {
    const file = frame.publicUrl ? publicFile(frame.publicUrl) : null;
    return {timeSeconds: frame.timeSeconds ?? frame.index, path: file ? path.relative(root, file) : null, sha256: frame.sha256 || (file && fs.existsSync(file) ? shaFile(file) : null)};
  });
}

function corpusEvent({source, sequence, effects, evidenceTier, evidenceWeight}) {
  return {
    id: `${source.id}:${sequence.id}`,
    creatorId: source.id,
    creator: source.creator,
    sequenceId: sequence.id,
    label: sequence.label || sequence.id,
    sourceClass: inferSourceClass(sequence),
    effects,
    evidenceTier,
    evidenceWeight,
    frameEvidence: corpusFrames(sequence),
    observation: (sequence.transferableRules || sequence.transferableGrammar || []).join("; ") || sequence.narrativeJob || sequence.semanticRole,
    reviewOnly: true,
    productionAssetAllowed: false,
  };
}

function extractFrame(video, seconds, output) {
  ensureDir(path.dirname(output));
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", String(seconds), "-i", video, "-frames:v", "1", "-q:v", "2", "-y", output]);
}

async function buildChapingEvent(spec) {
  if (!fs.existsSync(spec.video)) throw new Error(`chaping-source-video-missing:${spec.id}`);
  const times = [spec.center - 1.5, spec.center - 0.5, spec.center + 0.5, spec.center + 1.5];
  const frames = [];
  for (let index = 0; index < times.length; index += 1) {
    const file = path.join(chapingRoot, spec.id, `${String(index + 1).padStart(2, "0")}-${String(times[index]).replace(".", "p")}s.jpg`);
    extractFrame(spec.video, times[index], file);
    const metadata = await sharp(file).metadata();
    frames.push({timeSeconds: times[index], path: path.relative(root, file), sha256: shaFile(file), width: metadata.width, height: metadata.height, file});
  }
  const tiles = await Promise.all(frames.map((frame) => sharp(frame.file).resize(480, 270, {fit: "cover"}).jpeg({quality: 91}).toBuffer()));
  const sheet = path.join(chapingRoot, spec.id, "sequence.jpg");
  await sharp({create: {width: 1920, height: 270, channels: 3, background: "#111"}}).composite(tiles.map((input, index) => ({input, left: index * 480, top: 0}))).jpeg({quality: 91}).toFile(sheet);
  return {
    id: `chaping:${spec.id}`,
    creatorId: "chapingjun",
    creator: "差评君",
    sequenceId: spec.id,
    label: spec.id,
    sourceClass: spec.sourceClass,
    effects: spec.effects,
    evidenceTier: "CONTINUOUS_360P",
    evidenceWeight: 0.6,
    frameEvidence: frames.map(({file, ...frame}) => frame),
    sequenceSheet: {path: path.relative(root, sheet), sha256: shaFile(sheet)},
    observation: "The source material remains recognizable; local labels or edges support a single explanatory task instead of replacing the shot background.",
    reviewOnly: true,
    productionAssetAllowed: false,
  };
}

async function buildContactSheet(events) {
  const tileWidth = 384;
  const tileHeight = 216;
  const labelHeight = 48;
  const columns = 5;
  const rows = Math.ceil(events.length / columns);
  const composites = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const frame = event.frameEvidence[Math.floor(event.frameEvidence.length / 2)];
    const file = path.join(root, frame.path);
    const image = await sharp(file).resize(tileWidth, tileHeight, {fit: "cover"}).jpeg({quality: 86}).toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#111315"/><text x="12" y="19" fill="#d7ff45" font-family="Arial,sans-serif" font-size="12" font-weight="700">${event.creatorId} · ${event.sequenceId}</text><text x="12" y="37" fill="#f3efe4" font-family="Arial,sans-serif" font-size="11">${event.effects.join(" + ")}</text></svg>`);
    const x = (index % columns) * tileWidth;
    const y = Math.floor(index / columns) * (tileHeight + labelHeight);
    composites.push({input: image, left: x, top: y});
    composites.push({input: label, left: x, top: y + tileHeight});
  }
  const file = path.join(outputRoot, "event-contact-sheet.jpg");
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#090b0c"}}).composite(composites).jpeg({quality: 88}).toFile(file);
  return {path: path.relative(root, file), sha256: shaFile(file), width: columns * tileWidth, height: rows * (tileHeight + labelHeight)};
}

async function main() {
  ensureDir(outputRoot);
  ensureDir(chapingRoot);
  const v2 = readJson(path.join(publicRoot, "generated/system-line/reference-sequence-corpus-v2/corpus.json"));
  const v3 = readJson(path.join(publicRoot, "generated/system-line/reference-sequence-corpus-v3/corpus.json"));
  const v1 = readJson(path.join(publicRoot, "generated/system-line/reference-sequence-corpus-v1/corpus.json"));
  const atest = readJson(path.join(root, "work/bv1xzmu6te1x-typography-study-20260915/motion-sequence-manifest.json"));
  const events = [];

  const hupo = v2.sources.find((source) => source.id === "hupo");
  for (const sequence of hupo.sequences) events.push(corpusEvent({source: hupo, sequence, effects: hupoEffects[sequence.id], evidenceTier: "CONTINUOUS_540P", evidenceWeight: 0.75}));
  for (const sourceId of ["fern", "vox", "cleo-abram"]) {
    const source = v3.sources.find((item) => item.id === sourceId);
    for (const sequence of source.sequences) events.push(corpusEvent({source, sequence, effects: crossCreatorEffects[`${sourceId}:${sequence.id}`], evidenceTier: "CONTINUOUS_1080P", evidenceWeight: 1}));
  }
  const magnates = v1.sources.find((source) => source.id === "magnates-media");
  for (const sequence of magnates.sequences) events.push(corpusEvent({source: magnates, sequence, effects: magnatesEffects[sequence.id], evidenceTier: "STRUCTURE_ONLY_STORYBOARD", evidenceWeight: 0.4}));

  for (const event of atest.events) {
    events.push({
      id: `atest:${event.eventId}`,
      creatorId: "atest",
      creator: "阿Test正经比比",
      sequenceId: event.eventId,
      label: event.eventId,
      sourceClass: /evidence/iu.test(event.eventId) ? "DOCUMENT_EVIDENCE" : /prop|conclusion/iu.test(event.eventId) ? "PERSON_OR_PROP_COMPOSITE" : "EDITORIAL_SEQUENCE",
      effects: atestEffects[event.eventId],
      evidenceTier: "CONTINUOUS_480P",
      evidenceWeight: 0.65,
      frameEvidence: event.frames.map((frame) => ({timeSeconds: frame.time, path: path.relative(root, frame.file), sha256: shaFile(frame.file)})),
      sequenceSheet: {path: path.relative(root, event.sheet), sha256: shaFile(event.sheet)},
      observation: "Source identity and local attachment carry the beat; full-frame styling remains a downstream composition decision.",
      reviewOnly: true,
      productionAssetAllowed: false,
    });
  }
  for (const spec of chapingSpecs) events.push(await buildChapingEvent(spec));
  if (events.length !== 39) throw new Error(`effect-grammar-event-count:${events.length}`);
  if (events.some((event) => event.creatorId === "covacut")) throw new Error("excluded-reference-leaked-into-effect-grammar");
  const grammar = compileExternalSourceAssetEffectGrammar(events);
  assertExternalSourceAssetEffectGrammar(grammar);
  const contactSheet = await buildContactSheet(events);
  const eventSet = {contract: "A1ExternalSourceAssetEffectEventSet/v2", status: "PASS", eventCount: events.length, creatorIds: [...new Set(events.map((event) => event.creatorId))], events};
  fs.writeFileSync(path.join(outputRoot, "events.json"), jsonText(eventSet));
  fs.writeFileSync(path.join(outputRoot, "grammar.json"), jsonText(grammar));
  fs.writeFileSync(path.join(outputRoot, "frequency.json"), jsonText({contract: "A1ExternalSourceAssetEffectFrequency/v2", status: "PASS", eventCount: events.length, frequency: grammar.frequency}));
  const blindReviewPath = path.join(outputRoot, "blind-test/actual-pixel-review.json");
  const blindReview = fs.existsSync(blindReviewPath) ? readJson(blindReviewPath) : null;
  const phaseStatus = blindReview?.status === "PASS_WITH_SOURCE_LIMITS" ? "complete" : "RESEARCH_AND_GRAMMAR_PASS_BLIND_TEST_PENDING";
  fs.writeFileSync(path.join(outputRoot, "phase.json"), jsonText({contract: "A1SystemCapabilityPhase/v1", id: "external-source-asset-effect-grammar-v2", status: phaseStatus, genres: ["evidence-explainer", "business-documentary", "technology-explainer"], visibleCheckpoint: contactSheet, frozenRegressions: ["source-provenance", "evidence-preserve-only", "transparent-asset-scope", "no-production-admission"], execution: {weight: "medium", riskTags: ["local-reference-analysis", "deterministic-image-render"], writeScope: ["work/external-source-asset-effect-grammar-v2", "apps/studio-next/src/lib/a1-external-source-asset-effect-v1.mjs"], verificationCost: "focused", requiresExplicitApproval: true, approvalState: "granted", approvalEvidence: "user-execute-directive-2026-09-17"}}));
  fs.writeFileSync(path.join(outputRoot, "REPORT.md"), `# External source asset effect grammar v2\n\n- Status: **RESEARCH AND GRAMMAR PASS**\n- Events: **${events.length}**\n- Creators: **${grammar.evidence.creatorCount}**\n- Excluded source: **covacut**\n- Default document/scene route: **SOURCE_PRESERVE**\n- Default isolated person/prop route: **CLEAN_CUTOUT**\n- Conditional: contrast stroke, contact shadow, source-bound anchors\n- Rare: monochrome print, halftone echo, paper edge\n- Full-frame background/title-card generation in the asset-effect stage: **FORBIDDEN**\n\nBlind-test admission remains pending.\n`);
  console.log(JSON.stringify({status: grammar.status, eventCount: events.length, creatorIds: grammar.evidence.creatorIds, contactSheet, topEffects: Object.entries(grammar.frequency).sort((a, b) => b[1].weightedCount - a[1].weightedCount).map(([effect, value]) => ({effect, ...value})).slice(0, 8)}, null, 2));
}

await main();
