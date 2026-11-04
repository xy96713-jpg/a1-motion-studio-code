#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as fontkit from "fontkit";
import sharp from "sharp";
import {typographyEffectCatalog} from "../apps/studio-next/src/lib/a1-typography-effect-authority-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "work/semantic-typography-effect-vocabulary-v1");
const specimenDir = path.join(outputDir, "specimens");
const sans = fontkit.openSync(path.join(root, "apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf"));
const serif = fontkit.openSync(path.join(root, "apps/studio-next/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf"));
const pixel = fontkit.openSync(path.join(root, "apps/studio-next/public/a1-editorial-fonts/fusion-pixel.ttf"));
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const escapeXml = (value) => String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
fs.mkdirSync(specimenDir, {recursive: true});

function glyphPaths(font, copy, options = {}) {
  const run = font.layout(copy);
  const size = Number(options.size || 148);
  const scale = size / font.unitsPerEm;
  const tracking = Number(options.tracking || 0);
  const baseScaleX = Number(options.scaleX || 1);
  const advances = run.glyphs.map((glyph, index) => (run.positions[index]?.xAdvance || glyph.advanceWidth || font.unitsPerEm) * scale * baseScaleX + tracking);
  const totalWidth = advances.reduce((sum, value) => sum + value, 0) - tracking;
  let cursor = Number(options.centerX || 320) - totalWidth / 2;
  const baseline = Number(options.baseline || 228);
  return run.glyphs.map((glyph, index) => {
    const transform = options.transforms?.[index] || {};
    const sx = scale * baseScaleX * Number(transform.scaleX || 1);
    const sy = -scale * Number(transform.scaleY || 1);
    const x = cursor + Number(transform.x || 0);
    const y = baseline + Number(transform.y || 0);
    const rotate = Number(transform.rotate || 0);
    const skew = Number(transform.skew || 0);
    cursor += advances[index];
    return `<path d="${glyph.path.toSVG()}" transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) rotate(${rotate}) skewX(${skew}) scale(${sx.toFixed(6)} ${sy.toFixed(6)})"/>`;
  }).join("");
}

function group(font, copy, options = {}) {
  return `<g fill="${options.fill || "#111315"}"${options.opacity == null ? "" : ` opacity="${options.opacity}"`}>${glyphPaths(font, copy, options)}</g>`;
}

function specimenSvg(effectId) {
  const copy = "字效系统";
  const black = "#111315";
  const cobalt = "#245cff";
  const red = "#ff4b42";
  const lime = "#c8ff36";
  if (effectId === "CLEAN_EDITORIAL") return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${group(sans, copy, {size: 148, fill: black})}</svg>`;
  if (effectId === "EVA_COMPRESS") return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${group(serif, copy, {size: 190, scaleX: .66, fill: "#f6f6f1"})}</svg>`;
  if (effectId === "AXIS_RESPONSIVE") return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${group(sans, copy, {size: 150, fill: black, transforms: [{scaleX:.82,y:6},{scaleX:1.16,y:-8},{scaleX:.9,y:4},{scaleX:1.08,y:-3}]})}</svg>`;
  if (effectId === "SPLICE_REASSEMBLE") {
    const base = group(sans, copy, {size: 154, fill: black});
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><g id="splice-glyph">${base}</g><clipPath id="splice-a"><path d="M0 0H640V170H0Z"/></clipPath><clipPath id="splice-b"><path d="M0 170H640V225H0Z"/></clipPath><clipPath id="splice-c"><path d="M0 225H640V360H0Z"/></clipPath></defs><use href="#splice-glyph" clip-path="url(#splice-a)" transform="translate(-18 0)"/><use href="#splice-glyph" clip-path="url(#splice-b)" transform="translate(22 0)" fill="${red}"/><use href="#splice-glyph" clip-path="url(#splice-c)" transform="translate(-8 0)"/></svg>`;
  }
  if (effectId === "PRINT_REGISTRATION") {
    const paths = glyphPaths(sans, copy, {size: 150});
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><g fill="${red}" opacity=".72" transform="translate(-7 2)">${paths}</g><g fill="${cobalt}" opacity=".66" transform="translate(7 -2)">${paths}</g><g fill="${black}">${paths}</g></svg>`;
  }
  if (effectId === "LOCAL_GRADIENT") {
    const first = group(sans, "局部", {size: 150, centerX: 170, fill: "url(#local-gradient)"});
    const second = group(sans, "渐变", {size: 110, centerX: 478, fill: black});
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="local-gradient" x1="90" y1="120" x2="360" y2="260" gradientUnits="userSpaceOnUse"><stop stop-color="${cobalt}"/><stop offset="1" stop-color="${lime}"/></linearGradient></defs>${first}${second}</svg>`;
  }
  if (effectId === "BASELINE_CASCADE") return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${group(sans, copy, {size: 142, fill: black, transforms: [{y:-48,scaleX:1.08},{y:-16},{y:18,scaleX:.94},{y:52,scaleX:.88}]})}</svg>`;
  if (effectId === "DIRECTIONAL_SHEAR") return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${group(sans, copy, {size: 152, fill: cobalt, transforms: [{skew:-9,x:-18},{skew:-6,x:-6},{skew:5,x:8},{skew:9,x:18}]})}</svg>`;
  if (effectId === "COUNTERFORM_REVEAL") {
    const paths = glyphPaths(sans, copy, {size: 154});
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="counter-reveal" x1="0" y1="110" x2="0" y2="290" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${black}"/><stop offset=".34" stop-color="${black}"/><stop offset=".35" stop-color="${red}"/><stop offset=".64" stop-color="${red}"/><stop offset=".65" stop-color="${black}"/><stop offset="1" stop-color="${black}"/></linearGradient></defs><g fill="url(#counter-reveal)">${paths}</g></svg>`;
  }
  if (effectId === "PIXEL_TRACKING_LOCK") return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${group(pixel, "状态锁定", {size: 108, tracking: 8, fill: lime})}</svg>`;
  throw new Error(`unknown-effect:${effectId}`);
}

const catalog = typographyEffectCatalog();
const specimens = [];
const cells = [];
for (const [index, effect] of catalog.entries()) {
  const svg = specimenSvg(effect.id);
  const svgFile = path.join(specimenDir, `${effect.id}.svg`);
  const pngFile = path.join(specimenDir, `${effect.id}.png`);
  fs.writeFileSync(svgFile, svg, "utf8");
  await sharp(Buffer.from(svg)).png().toFile(pngFile);
  const {data, info} = await sharp(pngFile).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let transparentPixels = 0; let visiblePixels = 0;
  for (let offset = 3; offset < data.length; offset += info.channels) { if (data[offset] === 0) transparentPixels += 1; else visiblePixels += 1; }
  const formalPass = info.width === 640 && info.height === 360 && transparentPixels > 0 && visiblePixels > 0 && !/<rect\b/gu.test(svg.replace(/<clipPath[\s\S]*?<\/clipPath>/gu, ""));
  specimens.push({effectId: effect.id, label: effect.label, intensity: effect.intensity, expressive: effect.expressive, svg: path.relative(root, svgFile), svgSha256: sha(Buffer.from(svg)), png: path.relative(root, pngFile), pngSha256: sha(fs.readFileSync(pngFile)), transparentPixels, visiblePixels, formalPass});
  const specimenBuffer = await sharp(pngFile).resize(360, 203, {fit:"fill"}).png().toBuffer();
  const labelSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="384" height="360"><text x="18" y="28" fill="#f1f1ed" font-family="Arial" font-size="13" font-weight="700">${escapeXml(effect.id)}</text><text x="18" y="48" fill="#d2d2cd" font-family="Arial" font-size="11">${escapeXml(effect.label)}  ${effect.intensity}</text></svg>`);
  const cell = await sharp({create:{width:384,height:360,channels:4,background:{r:119,g:119,b:119,alpha:1}}}).composite([{input:labelSvg,left:0,top:0},{input:specimenBuffer,left:12,top:78}]).png().toBuffer();
  cells.push({input:cell,left:(index%5)*384,top:Math.floor(index/5)*360});
}

const contactSheet = path.join(outputDir, "typography-effect-vocabulary-contact-sheet.png");
await sharp({create:{width:1920,height:720,channels:4,background:{r:119,g:119,b:119,alpha:1}}}).composite(cells).png().toFile(contactSheet);
const manifest = {contract:"A1TypographyEffectVocabularyRender/v1",status:specimens.every((item)=>item.formalPass)?"PASS":"BLOCK",effectCount:specimens.length,outputMode:"TRANSPARENT_GLYPH_ASSET",reviewPlate:{kind:"NEUTRAL_MID_GRAY",reviewOnly:true,exportAllowed:false,productionAllowed:false},contactSheet:path.relative(root,contactSheet),contactSheetSha256:sha(fs.readFileSync(contactSheet)),specimens,productionAdmission:false};
fs.writeFileSync(path.join(outputDir,"render-manifest.json"),`${JSON.stringify(manifest,null,2)}\n`,"utf8");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line/typography-director-v2/effect-vocabulary");
fs.mkdirSync(publicDir, {recursive:true});
fs.copyFileSync(contactSheet, path.join(publicDir, "typography-effect-vocabulary-contact-sheet.png"));
fs.writeFileSync(path.join(publicDir, "render-manifest.json"), `${JSON.stringify(manifest,null,2)}\n`, "utf8");
console.log(JSON.stringify({status:manifest.status,effectCount:manifest.effectCount,contactSheet:manifest.contactSheet,contactSheetSha256:manifest.contactSheetSha256},null,2));
if(manifest.status!=="PASS")process.exitCode=1;
