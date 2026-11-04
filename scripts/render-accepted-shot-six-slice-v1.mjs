#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const phaseId = "accepted-shot-six-slice-v1";
const rendererRoot = path.join(root, "remotion-renderer");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const boardPath = path.join(publicDir, "candidate-board.json");
const authorityPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
if (board.status !== "CANDIDATE_PREVIEW_READY" || board.shots?.length !== 6) throw new Error(`accepted-shot-board-not-renderable:${board.status}`);
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const publicUrlFor = (file) => `/generated/system-line/${phaseId}/${path.relative(publicDir, file).split(path.sep).join("/")}`;

async function main() {
  fs.mkdirSync(publicDir, {recursive: true}); fs.mkdirSync(artifactDir, {recursive: true});
  const authorityBefore = shaFile(authorityPath);
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/system-line-h-frame-index.tsx"), publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const composition = await selectComposition({serveUrl, id: "A1AcceptedSixShotSlicePreview", inputProps: board, puppeteerInstance: browser, logLevel: "warn"});
    const renderDir = path.join(publicDir, "candidate-stills"); fs.mkdirSync(renderDir, {recursive: true});
    const rendered = [];
    for (const shot of board.shots) {
      const shotDir = path.join(renderDir, shot.shotId); fs.mkdirSync(shotDir, {recursive: true});
      for (const candidate of shot.candidates) {
        const output = path.join(shotDir, `${candidate.candidateId}.png`);
        const candidateProps = {...board, selectedShotId: shot.shotId, candidateId: candidate.candidateId};
        await renderStill({serveUrl, composition: {...composition, props: candidateProps}, inputProps: candidateProps, frame: 22, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
        const record = {shotId: shot.shotId, candidateId: candidate.candidateId, variant: candidate.variant, publicUrl: publicUrlFor(output), sha256: shaFile(output), width: 960, height: 540};
        candidate.still = {publicUrl: record.publicUrl, sha256: record.sha256, width: record.width, height: record.height};
        rendered.push(record);
      }
    }
    const tileW = 480, tileH = 270, labelH = 34;
    const tiles = [];
    for (const item of rendered) {
      const file = path.join(root, "apps/studio-next/public", item.publicUrl);
      const labelSvg = Buffer.from(`<svg width="${tileW}" height="${labelH}"><rect width="100%" height="100%" fill="#17181a"/><text x="10" y="22" fill="#ece8dc" font-family="monospace" font-size="13">${item.shotId} · ${item.variant}</text></svg>`);
      tiles.push(await sharp(file).resize(tileW, tileH).extend({top: labelH, bottom: 0, left: 0, right: 0, background: "#17181a"}).composite([{input: labelSvg, top: 0, left: 0}]).png().toBuffer());
    }
    const sheetW = tileW * 4, sheetH = (tileH + labelH) * 6;
    const sheetPath = path.join(publicDir, "candidate-board-contact-sheet.png");
    await sharp({create: {width: sheetW, height: sheetH, channels: 4, background: "#17181a"}}).composite(tiles.map((input, index) => ({input, left: (index % 4) * tileW, top: Math.floor(index / 4) * (tileH + labelH)}))).png().toFile(sheetPath);
    for (const shot of board.shots) {
      const shotItems = rendered.filter((item) => item.shotId === shot.shotId);
      const shotTiles = [];
      for (const item of shotItems) {
        const file = path.join(root, "apps/studio-next/public", item.publicUrl);
        shotTiles.push(await sharp(file).resize(tileW, tileH).png().toBuffer());
      }
      const shotSheet = path.join(publicDir, "candidate-stills", shot.shotId, "contact-sheet.png");
      await sharp({create: {width: tileW * 2, height: tileH * 2, channels: 4, background: "#17181a"}}).composite(shotTiles.map((input, index) => ({input, left: (index % 2) * tileW, top: Math.floor(index / 2) * tileH}))).png().toFile(shotSheet);
    }
    const boardWithoutHash = {...board}; delete boardWithoutHash.boardSha256;
    const nextBoardSha = sha(boardWithoutHash);
    board.boardSha256 = nextBoardSha;
    const ledgerPath = path.join(publicDir, "review-decisions.json"); const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")); ledger.boardSha256 = nextBoardSha;
    writeJson(boardPath, board); writeJson(ledgerPath, ledger); writeJson(path.join(root, "remotion-renderer/src/generated/acceptedShotSixSliceProps.json"), board);
    writeJson(path.join(artifactDir, "candidate-board.json"), board); writeJson(path.join(artifactDir, "review-decisions.json"), ledger);
    const authorityAfter = shaFile(authorityPath);
    const report = {contract: "A1AcceptedShotSixSliceRenderReport/v1", phaseId, status: "CANDIDATE_STILLS_RENDERED", candidatePreviewOnly: true, renderedCount: rendered.length, rendered, contactSheet: {publicUrl: publicUrlFor(sheetPath), sha256: shaFile(sheetPath), width: sheetW, height: sheetH}, currentAuthority: {sha256Before: authorityBefore, sha256After: authorityAfter, unchanged: authorityBefore === authorityAfter}, gates: {userReviewRequired: true, dynamicPrototypeAllowed: false, h47ExpansionAllowed: false, finalRenderAllowed: false}};
    writeJson(path.join(publicDir, "render-report.json"), report); writeJson(path.join(artifactDir, "render-report.json"), report);
    console.log(JSON.stringify({status: report.status, renderedCount: report.renderedCount, contactSheet: report.contactSheet, authorityUnchanged: report.currentAuthority.unchanged}, null, 2));
  } finally { await browser.close({silent: true}); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
