import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const cacheDir = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/font-cache");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const fontBindings = [
  {id: "type-editorial-heavy", family: "A1 Source Han Heavy", source: path.join(cacheDir, "SourceHanSansCN-Heavy.otf"), outputName: "SourceHanSansCN-Heavy.otf"},
  {id: "type-slanted-display", family: "A1 Smiley Sans", source: path.join(cacheDir, "SmileySans-Oblique.otf"), outputName: "SmileySans-Oblique.otf"},
  {id: "type-condensed-impact", family: "A1 Source Han Serif Impact", source: path.join(root, "remotion-renderer/public/style-guides/experimental-editorial-tech-v1/fonts/SourceHanSerifCN/SourceHanSerifCN-Heavy.otf"), outputName: "SourceHanSerifCN-Heavy.otf"},
  {id: "type-pixel-correction", family: "A1 Fusion Pixel", source: path.join(cacheDir, "fusion-pixel.ttf"), outputName: "fusion-pixel.ttf"},
  {id: "type-human-accent", family: "A1 Ma Shan Zheng", source: "/Users/a1/Library/Fonts/MaShanZheng-Regular.ttf", outputName: "MaShanZheng-Regular.ttf"},
];

const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const corpus = [...new Set(Array.from([
  current.article.title,
  current.article.thesis,
  ...current.typographySystem.editableFontRoles.map((item) => item.sample),
  ...current.typographySystem.displayTreatments.map((item) => item.exactText),
  ...current.typographySystem.shotAssignments.map((item) => item.headlineText || ""),
].join("")).filter((character) => /[\p{Script=Han}A-Za-z0-9]/u.test(character)))];

fs.mkdirSync(cacheDir, {recursive: true});
const checks = fontBindings.map((binding) => {
  if (!fs.existsSync(binding.source)) throw new Error(`font-source-missing:${binding.id}`);
  const destination = path.join(cacheDir, binding.outputName);
  if (path.resolve(binding.source) !== path.resolve(destination)) fs.copyFileSync(binding.source, destination);
  const font = fontkit.openSync(destination);
  const missing = corpus.filter((character) => !font.hasGlyphForCodePoint(character.codePointAt(0)));
  if (missing.length) throw new Error(`font-cjk-coverage-failed:${binding.id}:${missing.slice(0, 20).join("")}`);
  const bytes = fs.readFileSync(destination);
  return {...binding, destination, publicUrl: `/generated/system-line/editorial-asset-workbench-v1/font-cache/${binding.outputName}`, sha256: sha256(bytes), glyphCountChecked: corpus.length, postscriptName: font.postscriptName};
});

const result = withProjectLock(appRoot, () => {
  const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(workspace);
  for (const check of checks) {
    const asset = next.library.assets.find((item) => item.id === check.id && item.route === "project-font");
    if (!asset) throw new Error(`font-asset-missing:${check.id}`);
    asset.assetUri = check.publicUrl;
    asset.sha256 = check.sha256;
    asset.status = "approved";
    asset.preview = {...asset.preview, kind: "font-specimen", fontFamily: check.family, publicUrl: check.publicUrl};
    asset.provenance = {sourceType: "project-local-font", sourceUri: check.source, license: "project-local documented font asset", reviewed: true};
    asset.review = {status: "approved", note: `已用 ${check.glyphCountChecked} 个当前文章中英文字符做真实字体覆盖检查；无浏览器静默回退。`, reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
    asset.review.approvedContentSha256 = editorialAssetContentSha256(asset);
  }
  for (const role of next.typographySystem.editableFontRoles) {
    const binding = checks.find((item) => item.id === role.id);
    if (binding) role.family = binding.family;
  }
  for (const role of next.visualBible.typographyRoles || []) {
    const binding = checks.find((item) => item.id === role.id);
    if (binding) role.family = binding.family;
  }
  const event = createProductionEvent({workspace, action: "cjk-font-bindings-repaired", payload: {fontCount: checks.length, corpusGlyphCount: corpus.length, checks: checks.map(({id, family, sha256: hash, glyphCountChecked, postscriptName}) => ({id, family, sha256: hash, glyphCountChecked, postscriptName}))}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next);
  persistProjectState(appRoot, recalculated, {event, files: {"cjk-font-coverage-report.json": {contract: "A1CjkFontCoverageReport/v1", status: "PASS", corpusGlyphCount: corpus.length, checks: checks.map(({id, family, publicUrl, sha256: hash, glyphCountChecked, postscriptName}) => ({id, family, publicUrl, sha256: hash, glyphCountChecked, postscriptName})), checkedAt: event.createdAt}}});
  return recalculated;
});

console.log(JSON.stringify({status: "PASS", fontCount: checks.length, corpusGlyphCount: corpus.length, typographyGate: result.stages.find((stage) => stage.id === "typography-board")?.gate}, null, 2));
