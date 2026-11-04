#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const sourceBriefRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/style-lineage-static-board-v1/style-briefs");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/material-led-static-board-repair-v2");
const briefRoot = path.join(outputRoot, "style-briefs");
const imageRoot = path.join(outputRoot, "imagegen");
const auditor = process.env.A1_STYLE_BRIEF_AUDITOR || "/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/scripts/audit-style-brief.mjs";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));

const specs = [
  {
    shotId: "ED-07",
    semanticJob: "把直接让 AI 写完整篇的诱惑变成一个失控输出动作：少量输入进入机器，过长的空白全文纸卷冲出画面。",
    primaryFamily: "retro-computer-window",
    dominantActor: "runaway-full-manuscript-machine",
    composition: "small-input-left-to-runaway-scroll-right",
    fusionMode: "crt-character-machine",
    semanticAction: "a tiny input causes an uncontrollably long full manuscript to burst out",
    prompt: "Create one original 16:9 textless A1 Fusion Pixel editorial Look Master on a visibly shared 240x135 logical pixel grid, enlarged only with crisp nearest-neighbor square edges. One compact flat side-view writing machine receives three tiny blank pixel-paper slips; one absurdly long blank pixel manuscript ribbon bursts from the machine, loops once, and exits the right edge. The machine and ribbon are authored as hard low-resolution pixel silhouettes, not a photograph and not a pixelation filter. One actor, one action. Cool light-gray or charcoal field, off-white pixels, charcoal pixels, one restrained cobalt action color, asymmetric editorial hierarchy, 30% connected quiet field in the upper left for later local Chinese type. No people, no mascot, no photorealism, no 3D render, no paper texture, no halftone-only styling, no dashboard, no cards, no arrows, no letters, no numbers, no readable or pseudo text, no logo, no watermark.",
  },
  {
    shotId: "ED-08",
    semanticJob: "把 AI 输出看似完整却不像人话的感受变成一台语言机器吐出僵硬、无法自然抵达对话端的结构。",
    primaryFamily: "scanline-crt-signal",
    dominantActor: "rigid-language-output-machine",
    composition: "machine-output-ribbon-breaks-before-conversation",
    fusionMode: "crt-signal-break",
    semanticAction: "orderly language output shears into rigid blocks before it can become conversation",
    prompt: "Create one original 16:9 textless A1 Fusion Pixel editorial Look Master on a visibly shared 240x135 logical pixel grid, enlarged only with crisp nearest-neighbor square edges. A flat two-color pixel language device on the left emits one clean band of blank line blocks. Halfway across the frame, one cobalt sync-break shears the band into rigid stair-step blocks so it cannot connect to one simple empty speech silhouette on the right. The signal break performs the meaning; it is not a full-frame glitch filter. One actor, one action, zero extra windows. Cool near-white field, charcoal pixels, one cobalt signal color, asymmetric editorial composition, upper-right quiet field for later local Chinese type. No people, no face, no mascot, no photorealism, no 3D, no paper collage, no generic game HUD, no dashboard, no letters, no numbers, no readable or pseudo text, no logo, no watermark.",
  },
  {
    shotId: "ED-09",
    semanticJob: "把中文看似通顺却看不懂、通篇没重点变成一张阅读路径在空白稿纸上逐渐打结且没有视觉重心的画面。",
    primaryFamily: "one-bit-character-object",
    dominantActor: "tangled-reading-path-manuscript",
    composition: "clear-entry-to-tangled-center-with-flat-emphasis",
    fusionMode: "NO_FUSION",
    semanticAction: "a clean reading route enters a manuscript and tangles while every line remains equally weighted",
    prompt: "Create one original 16:9 textless A1 Fusion Pixel editorial Look Master on a visibly shared 240x135 logical pixel grid, enlarged only with crisp nearest-neighbor square edges. One large one-bit pixel manuscript object fills the frame and contains only uniform blank horizontal pixel bars, never characters. One cobalt reading route enters cleanly from the left, then tangles into a tight impossible maze across the manuscript; all blank bars keep equal weight so no focal point appears. Hard authored pixel geometry, one object, one action, asymmetrical crop, cool near-white and charcoal field, one cobalt route, 25% quiet field at upper left for later local Chinese type. No CRT window, no people, no face, no photorealism, no 3D, no torn paper, no halftone-only styling, no UI, no cards, no letters, no numbers, no readable or pseudo text, no logo, no watermark.",
  },
  {
    shotId: "ED-19",
    semanticJob: "把 Codex 的幕后职责画成一台单线写作工作台：材料进入后依次经过整理、编排、风格库读取和收稿检查。",
    primaryFamily: "retro-computer-window",
    dominantActor: "single-line-backstage-writing-workbench",
    composition: "one-conveyor-four-distinct-unlabelled-functions",
    fusionMode: "crt-character-machine",
    semanticAction: "one backstage writing rail sorts, arranges, reads style samples and inspects the final manuscript",
    prompt: "Create one original 16:9 textless A1 Fusion Pixel editorial Look Master on a visibly shared 240x135 logical pixel grid, enlarged only with crisp nearest-neighbor square edges. Draw one flat orthographic early-computer backstage writing rail, not an isometric 3D machine: loose blank pixel papers enter one tray, pass through one visibly ordered grid, touch one compact archive drawer, and finish under one inspection lens. These functions belong to one continuous authored pixel machine and one cobalt route, never four cards. Charcoal field, off-white pixel objects, cool gray supports, one cobalt action color, asymmetric editorial hierarchy, generous upper-left quiet field for later local Chinese type. No people, no robot mascot, no photorealism, no 3D render, no floating panels, no dashboard, no labels, no letters, no numbers, no readable or pseudo text, no logo, no watermark.",
  },
];

fs.mkdirSync(briefRoot, {recursive: true});
fs.mkdirSync(imageRoot, {recursive: true});

const requests = specs.map((spec) => {
  const base = JSON.parse(fs.readFileSync(path.join(sourceBriefRoot, `${spec.shotId}.json`), "utf8"));
  const brief = {
    ...base,
    semanticJob: spec.semanticJob,
    styleProfile: {...base.styleProfile, maxVisibleActors: 2, maxSemanticTextBlocks: 1, maxCompositionClusters: 2, maxDecorativeMotifs: 0, minimumQuietFieldRatio: 0.24},
    variation: {...base.variation, primaryFamily: spec.primaryFamily, supportingFamilies: ["pixel-type-actor"], dominantActor: spec.dominantActor, composition: spec.composition, material: "textless-imagegen-substrate-plus-local-hash-bound-typography"},
    typography: {...base.typography, generatedFormalTextAllowed: false, exactCopyRequired: true},
    formalOutput: {...base.formalOutput, generatedTextForbidden: true, localTypographyBindingRequired: true, filterOnlyPixelStyleForbidden: true},
    pixelConstruction: {masterGrid: "240x135-logical", scaleMethod: "nearest-neighbor", sharedGridRequired: true, paperNoiseOrHalftoneAloneCannotProvePixelConstruction: true, formalTypographyKeptHighResolution: true},
    fusionContract: spec.fusionMode === "NO_FUSION" ? null : "A1CrtPixelEditorialFusionBrief/v1",
    fusionMode: spec.fusionMode,
    semanticAction: spec.semanticAction,
    primaryActor: spec.dominantActor,
    interfaceJobs: spec.fusionMode === "NO_FUSION" ? [] : [{element: spec.dominantActor, job: spec.semanticAction}],
    referenceBoundary: "abstract-grammar-only",
  };
  brief.fingerprint = [brief.variation.primaryFamily, brief.variation.surfaceLogic, brief.variation.dominantActor, brief.variation.composition, brief.variation.palette].join("|");
  const briefFile = path.join(briefRoot, `${spec.shotId}.json`);
  fs.writeFileSync(briefFile, `${JSON.stringify(brief, null, 2)}\n`);
  const audit = JSON.parse(execFileSync(process.execPath, [auditor, briefFile], {encoding: "utf8"}));
  const auditFile = path.join(briefRoot, `${spec.shotId}.audit.json`);
  fs.writeFileSync(auditFile, `${JSON.stringify(audit, null, 2)}\n`);
  if (audit.status !== "PASS") throw new Error(`style-brief-audit-failed:${spec.shotId}:${JSON.stringify(audit)}`);
  return {
    shotId: spec.shotId,
    semanticJob: spec.semanticJob,
    visualMaterialRoute: "ILLUSTRATION_LED",
    generatedTextAllowed: false,
    localTypographyRequired: true,
    styleBriefPath: path.relative(root, briefFile),
    styleBriefSha256: fileSha256(briefFile),
    styleBriefAuditPath: path.relative(root, auditFile),
    styleBriefAuditSha256: fileSha256(auditFile),
    outputPath: path.relative(root, path.join(imageRoot, `${spec.shotId}.png`)),
    prompt: spec.prompt,
  };
});

const requestPack = {
  contract: "A1MaterialLedStaticBoardRepairRequestPack/v2",
  status: "READY_FOR_BOUNDED_IMAGEGEN",
  currentBoardDisposition: "USER_VISUAL_FEEDBACK_REPAIR_REQUIRED",
  targetShotIds: ["ED-07", "ED-08", "ED-09", "ED-16", "ED-17", "ED-19"],
  imagegenShotIds: requests.map((item) => item.shotId),
  deterministicObjectShotIds: ["ED-16", "ED-17"],
  generationConcurrencyLimit: 2,
  generationCountPlanned: requests.length,
  formalTextGenerated: false,
  pixelConstructionRequired: true,
  priorAttemptDisposition: "V1_CONCEPT_ONLY_VISUAL_REJECTED_FILTER_ONLY_PIXEL_AND_ABSTRACT_3D_DRIFT",
  requests,
  frozenBoundaries: {layers: true, motion: true, resolve: true, finalRender: true, userVisualApproval: "NOT_APPROVED"},
};
const body = {...requestPack, requestPackSha256: sha256(JSON.stringify(requestPack))};
fs.writeFileSync(path.join(outputRoot, "request-pack.json"), `${JSON.stringify(body, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: body.status, requestPackSha256: body.requestPackSha256, outputRoot, requests: requests.map(({shotId, styleBriefSha256, outputPath}) => ({shotId, styleBriefSha256, outputPath}))}, null, 2)}\n`);
