#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewDir = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/pixel-pop-pilot");
const imagePaths = ["ed09-pixel-pop-v3a.png", "ed09-pixel-pop-v3b.png"].map((name) => path.join(previewDir, name));
const outputPaths = ["ed09-pixel-pop-v3a-composite.png", "ed09-pixel-pop-v3b-composite.png"].map((name) => path.join(previewDir, name));
const fontPath = (relative) => path.join(root, "remotion-renderer/public", relative);
const imageData = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
const fontData = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;

const fonts = {
  headline: fontData(fontPath("style-guides/experimental-editorial-tech-v1/fonts/system-candidates/NotoSansHans-Black.otf"), "font/otf"),
  support: fontData(fontPath("style-guides/experimental-editorial-tech-v1/fonts/SourceHanSansCN-Regular.otf"), "font/otf"),
  mono: fontData(fontPath("style-guides/experimental-editorial-tech-v1/fonts/IBMPlexMono-Medium.ttf"), "font/ttf"),
};

const html = (image) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:PixelHeadline;src:url(${fonts.headline}) format('opentype');font-weight:900}
@font-face{font-family:PixelSupport;src:url(${fonts.support}) format('opentype');font-weight:400}
@font-face{font-family:PixelMono;src:url(${fonts.mono}) format('truetype');font-weight:500}
*{box-sizing:border-box}html,body{margin:0;width:960px;height:540px;overflow:hidden;background:#081d75}
.frame{position:relative;width:960px;height:540px;overflow:hidden;background:#081d75;color:#fff3d6}
.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,29,117,.02) 0 48%,rgba(8,29,117,.17) 58%,rgba(8,29,117,.34) 100%)}
.copy{position:absolute;left:512px;right:64px;top:64px;z-index:2}
.meta{font:500 12px/1 PixelMono,monospace;letter-spacing:.12em;color:#ff8068;margin-bottom:26px}
.headline{font:900 76px/.93 PixelHeadline,sans-serif;letter-spacing:-.045em;white-space:nowrap}
.headline .accent{color:#ff8068}
.support{margin-top:26px;max-width:315px;font:400 21px/1.45 PixelSupport,sans-serif;color:#fff3d6;opacity:.88}
.rule{width:108px;height:4px;background:#ff8068;margin-top:26px}
</style></head><body><main class="frame"><img class="art" src="${image}"/><div class="veil"></div><section class="copy"><div class="meta">EDITORIAL TEST / 09</div><div class="headline">完成度很高的<br><span class="accent">废稿</span></div><div class="support">表面完成，不等于内容真正向前。</div><div class="rule"></div></section></main></body></html>`;

const browser = await chromium.launch({headless: true});
for (let index = 0; index < imagePaths.length; index += 1) {
  const page = await browser.newPage({viewport: {width: 960, height: 540}, deviceScaleFactor: 1});
  await page.setContent(html(imageData(imagePaths[index])), {waitUntil: "load"});
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({path: outputPaths[index], type: "png"});
  await page.close();
}
await browser.close();
console.log(JSON.stringify({status: "PIXEL_POP_CLEAN_TYPOGRAPHY_PREVIEW_READY", outputs: outputPaths.map((file) => ({file, bytes: fs.statSync(file).size}))}, null, 2));
