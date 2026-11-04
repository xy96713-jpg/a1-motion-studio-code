#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewDir = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/pixel-pop-pilot");
const variants = [
  {id: "v4a-mono-ink", background: "#0B0B0B", foreground: "#F3F0E8", muted: "#B8B5AE", input: "ed09-pixel-pop-v4a-mono-ink.png"},
  {id: "v4b-mono-paper", background: "#F3F0E8", foreground: "#0B0B0B", muted: "#676767", input: "ed09-pixel-pop-v4b-mono-paper.png"},
];
const fontPath = (relative) => path.join(root, "remotion-renderer/public", relative);
const imageData = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
const fontData = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
const fonts = {
  headline: fontData(fontPath("style-guides/experimental-editorial-tech-v1/fonts/system-candidates/NotoSansHans-Black.otf"), "font/otf"),
  support: fontData(fontPath("style-guides/experimental-editorial-tech-v1/fonts/SourceHanSansCN-Regular.otf"), "font/otf"),
  mono: fontData(fontPath("style-guides/experimental-editorial-tech-v1/fonts/IBMPlexMono-Medium.ttf"), "font/ttf"),
};
const html = (variant) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:PixelHeadline;src:url(${fonts.headline}) format('opentype');font-weight:900}
@font-face{font-family:PixelSupport;src:url(${fonts.support}) format('opentype');font-weight:400}
@font-face{font-family:PixelMono;src:url(${fonts.mono}) format('truetype');font-weight:500}
*{box-sizing:border-box}html,body{margin:0;width:960px;height:540px;overflow:hidden;background:${variant.background}}
.frame{position:relative;width:960px;height:540px;overflow:hidden;background:${variant.background};color:${variant.foreground}}
.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.veil{position:absolute;inset:0;background:${variant.id.includes("ink") ? "linear-gradient(90deg,rgba(11,11,11,.00) 0 48%,rgba(11,11,11,.07) 62%,rgba(11,11,11,.12) 100%)" : "linear-gradient(90deg,rgba(243,240,232,.00) 0 48%,rgba(243,240,232,.04) 62%,rgba(243,240,232,.08) 100%)"}}
.copy{position:absolute;left:512px;right:64px;top:64px;z-index:2}
.meta{font:500 12px/1 PixelMono,monospace;letter-spacing:.12em;color:${variant.muted};margin-bottom:26px}
.headline{font:900 70px/.95 PixelHeadline,sans-serif;letter-spacing:-.04em;white-space:nowrap}
.headline .accent{color:${variant.foreground}}
.support{margin-top:26px;max-width:315px;font:400 21px/1.45 PixelSupport,sans-serif;color:${variant.foreground};opacity:.78}
.rule{width:108px;height:3px;background:${variant.foreground};margin-top:26px;opacity:.78}
</style></head><body><main class="frame"><img class="art" src="${imageData(path.join(previewDir, variant.input))}"/><div class="veil"></div><section class="copy"><div class="meta">EDITORIAL TEST / 10</div><div class="headline">完成度很高的<br><span class="accent">废稿</span></div><div class="support">表面完成，不等于内容真正向前。</div><div class="rule"></div></section></main></body></html>`;

const browser = await chromium.launch({headless: true});
for (const variant of variants) {
  const page = await browser.newPage({viewport: {width: 960, height: 540}, deviceScaleFactor: 1});
  await page.setContent(html(variant), {waitUntil: "load"});
  await page.evaluate(() => document.fonts.ready);
  const output = path.join(previewDir, `ed09-pixel-pop-${variant.id}-composite.png`);
  await page.screenshot({path: output, type: "png"});
  await page.close();
}
await browser.close();
console.log(JSON.stringify({status: "PIXEL_POP_MONOCHROME_TYPOGRAPHY_PREVIEW_READY", outputs: variants.map((variant) => {
  const file = path.join(previewDir, `ed09-pixel-pop-${variant.id}-composite.png`);
  return {file, bytes: fs.statSync(file).size};
})}, null, 2));
