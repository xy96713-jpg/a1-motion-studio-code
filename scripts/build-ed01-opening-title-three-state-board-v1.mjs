#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const titleSource = path.join(root, "work/style-research/hanzi-font-imagegen-v1/03-high-contrast-editorial.png");
const presenterSource = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/presenter-light-overlay-system-v2/frames/ED-01.png");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/ed01-opening-title-three-state-v1");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const label = (title, subtitle) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect y="982" width="1920" height="98" fill="#080c10"/><rect y="982" width="12" height="98" fill="#315cff"/><text x="34" y="1022" fill="#f4f2eb" font-family="monospace" font-size="24" font-weight="700">${title}</text><text x="34" y="1054" fill="#9aa9b8" font-family="monospace" font-size="17">${subtitle}</text></svg>`);

async function main() {
  if (!fs.existsSync(titleSource) || !fs.existsSync(presenterSource)) throw new Error("ed01-opening-title-input-missing");
  fs.mkdirSync(outputRoot, {recursive: true});
  const titleFrame = await sharp(titleSource).resize(1920, 1080, {fit: "cover", position: "north"}).png().toBuffer();
  const presenterFrame = await sharp(presenterSource).resize(1920, 1080, {fit: "cover"}).png().toBuffer();

  const stateA = await sharp(titleFrame).composite([{input: label("A · FULLSCREEN GENERATED GLYPH TITLE", "身份建立 · 字形是唯一主角 · 生成图仅作 review styleframe")}]).png({compressionLevel: 9}).toBuffer();

  const panelLeft = await sharp(titleFrame).extract({left: 0, top: 0, width: 760, height: 982}).png().toBuffer();
  const panelCenter = await sharp(titleFrame).extract({left: 760, top: 0, width: 410, height: 982}).png().toBuffer();
  const transitionMarks = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect x="742" y="0" width="18" height="982" fill="#315cff"/><rect x="1148" y="0" width="10" height="982" fill="#315cff"/><path d="M760 482H1180" stroke="#315cff" stroke-width="5" stroke-dasharray="18 12"/><rect x="1168" y="470" width="24" height="24" fill="#315cff"/></svg>`);
  const stateB = await sharp(presenterFrame).composite([
    {input: panelLeft, left: 0, top: 0},
    {input: panelCenter, left: 820, top: 0},
    {input: transitionMarks},
    {input: label("B · GLYPH EXTRACTION → PRESENTER REVEAL", "一次 CRT 语义动作：标题被选择、抽取并让出口播主体")},
  ]).png({compressionLevel: 9}).toBuffer();

  const stateC = await sharp(presenterFrame).composite([{input: label("C · PRESENTER LIGHT OVERLAY", "进入口播 · 人物保持主角 · 只保留小标题或结构线")}]).png({compressionLevel: 9}).toBuffer();

  const states = [
    {id: "A", file: "state-a-fullscreen-title.png", pixels: stateA, semanticAction: "IDENTITY_ESTABLISHES"},
    {id: "B", file: "state-b-title-extract-reveal.png", pixels: stateB, semanticAction: "SELECT_EXTRACT_REVEAL"},
    {id: "C", file: "state-c-presenter-light-overlay.png", pixels: stateC, semanticAction: "PRESENTER_CONTINUES"},
  ];
  for (const state of states) fs.writeFileSync(path.join(outputRoot, state.file), state.pixels);
  const tiles = await Promise.all(states.map((state) => sharp(state.pixels).resize(640, 360, {fit: "cover"}).png().toBuffer()));
  const board = await sharp({create: {width: 1920, height: 360, channels: 4, background: "#05080b"}}).composite(tiles.map((input, index) => ({input, left: index * 640, top: 0}))).png({compressionLevel: 9}).toBuffer();
  const boardFile = path.join(outputRoot, "ED-01-opening-title-three-state-board.png");
  fs.writeFileSync(boardFile, board);
  const report = {
    contract: "A1ED01OpeningTitleThreeStateBoard/v1",
    status: "READY_FOR_USER_STATIC_STATE_REVIEW",
    shotId: "ED-01",
    route: "FULLSCREEN_GENERATED_HERO_TITLE_TO_PRESENTER_LIGHT_OVERLAY",
    states: states.map(({pixels, ...state}) => ({...state, sha256: sha256(pixels)})),
    board: {file: path.relative(root, boardFile), sha256: sha256(board), width: 1920, height: 360},
    motionPlan: {durationSeconds: 2, sequence: ["0.00-1.35 FULLSCREEN_HOLD", "1.35-1.75 SELECT_EXTRACT_REVEAL", "1.75-2.00 PRESENTER_SETTLE"], rendered: false},
    textPolicy: {generatedGlyphIsStyleframeOnly: true, exactFormalCopyMustBeLocallyBoundBeforeProduction: true},
    boundaries: {currentAuthorityChanged: false, productionAdmitted: false, assemblyCreated: false, motionRendered: false, fullFilmRendered: false},
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify({...report, reportSha256: sha256(Buffer.from(JSON.stringify(report)))}, null, 2)}\n`);
  console.log(JSON.stringify({status: report.status, board: report.board, motionRendered: false, currentAuthorityChanged: false}, null, 2));
}

await main();
