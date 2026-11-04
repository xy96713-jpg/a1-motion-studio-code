import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
import { contrastRatioHex } from '../apps/studio-next/src/lib/recipe-board/packaging.mjs';

const cfg = boardConfig(process.env);
const out = path.join(cfg.dataDir, 'style-lab', 'design-study-20261103');
fs.mkdirSync(path.join(out, 'html'), { recursive: true });
const proj = path.join(cfg.dataDir, 'projects', 'banana-design');
const U = (p) => pathToFileURL(path.join(proj, p)).href;
const IMG = { page2: U('materials/sources/aps-2005/page.png'), banana: U('materials/clips/banana-design-B02-wilfredor-cavendish-banana-from-maracaibo-jpg-f4d3bb75-621cc2d2-6907-45f5-9969-e4719f5ef02e.jpg'), banana2: U('materials/clips/banana-design-B12-wikimedia-commons-cavendish-banana-ds-jpg-aede52c0-a2ccd7d0-f205-4f07-a2fd-298d7eac9003.jpg'), news: U('materials/clips/banana-design-B17-foodnavigator-com-colombia-declares-national-emergency-as--26cd83f0-window.png'), page: U('materials/sources/aps-2005/page-06.png') };
const css = await fontCss(cfg, 'banana-design');
const DISP = 'GBLatin,GBDisplay,GBLast', TEXT = 'GBLatin,GBSmall,GBLast';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const GRAIN = '.grain{position:absolute;inset:0;pointer-events:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/><feColorMatrix type=\'saturate\' values=\'0\'/></filter><rect width=\'160\' height=\'160\' filter=\'url(%23n)\' opacity=\'0.07\'/></svg>")}';
const BASE = '*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden}';
const img = (src, o = {}) => '<img src="' + src + '" style="position:absolute;left:' + (o.left ?? 0) + 'px;top:' + (o.top ?? 0) + 'px;width:' + (o.w ?? 1920) + 'px;height:' + (o.h ?? 1080) + 'px;object-fit:' + (o.fit || 'cover') + ';object-position:' + (o.pos || 'center') + (o.filter ? ';filter:' + o.filter : '') + '"/>';
const scrim = (opacity, color = '#000') => '<div style="position:absolute;inset:0;background:' + color + ';opacity:' + opacity + '"></div>';
const t = (s, o) => '<div style="position:absolute;left:' + o.x + 'px;top:' + o.y + 'px;font-family:' + (o.family === 'text' ? TEXT : DISP) + ';font-size:' + o.size + 'px;line-height:' + (o.lh || 0.95) + ';color:' + o.color + ';white-space:pre;' + (o.extra || '') + '">' + esc(s) + '</div>';
const grad = (s, o) => '<div style="position:absolute;left:' + o.x + 'px;top:' + o.y + 'px;font-family:' + DISP + ';font-size:' + o.size + 'px;line-height:.95;white-space:pre;background-image:linear-gradient(' + (o.angle || 180) + 'deg,' + o.from + ',' + o.to + ');-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;' + (o.extra || '') + '">' + esc(s) + '</div>';
const card = (src, o = {}) => '<div style="position:absolute;left:' + o.x + 'px;top:' + o.y + 'px;width:' + o.w + 'px;height:' + o.h + 'px;background:#fff;box-shadow:0 24px 60px #0008;overflow:hidden"><img src="' + src + '" style="width:100%;height:100%;object-fit:contain;background:#fff"/></div>';

const frames = [];
// J1: scene-first cover. 200 hero on the 120 grid, 48 pair below, 0.15 ink gap approximated as 30px.
frames.push({ id: 'J1', name: '同一棵香蕉 · 场景封面', scene: 'photo', sizes: { hero: 200, caption: 48 }, roles: { hero: 'hero 200 (mature cap)', caption: 'caption 48' }, effects: 0, html: img(IMG.banana2) + scrim(0.55) + '<div style="position:absolute;inset:0;background:linear-gradient(90deg,#000 0%,#0008 42%,#0000 70%)"></div>' + t('同一棵香蕉', { x: 120, y: 330, size: 200, color: '#f6f5f2' }) + t('卡文迪什 · 香芽蕉', { x: 132, y: 551, size: 48, family: 'text', color: '#cbc4ba', extra: 'letter-spacing:.06em' }) + '<div class="grain"></div>' });
// J2: data hero over a blurred scene; gradient stays inside two creams, % is the single accent.
frames.push({ id: 'J2', name: '47% · 数据场景', scene: 'photo', sizes: { figure: 200, sub: 64 }, roles: { figure: 'figure 200', sub: 'sub 64' }, effects: 1, html: img(IMG.banana) + '<div style="position:absolute;inset:0;background:linear-gradient(90deg,#0f1113 0%,#0f1113 46%,rgba(15,17,19,.35) 68%,rgba(15,17,19,0) 82%)"></div>' + '<div style="position:absolute;left:114px;top:330px;font-family:' + DISP + ';font-size:200px;line-height:.95;white-space:pre;color:#e2442a">47%</div>' + t('全球香蕉產量', { x: 117, y: 526, size: 64, family: 'text', color: '#c2bb9f', extra: 'letter-spacing:.1em' }) + '<div class="grain"></div>' });
// J4: news evidence complete, 128 on the right, source 48, no crop of the headline.
frames.push({ id: 'J4', name: '國家緊急狀態 · 报道页', scene: 'page', sizes: { title: 128, caption: 48 }, roles: { title: 'title 128', caption: 'caption 48' }, effects: 0, html: '<div style="position:absolute;inset:0;background:#0d0c0b"></div>' + '<img src="' + IMG.news + '" style="position:absolute;left:0;top:-360px;width:1920px;height:auto"/>' + '<div style="position:absolute;inset:0;background:rgba(13,12,11,.12)"></div>' + t('國家緊急狀態', { x: 120, y: 746, size: 128, color: '#f6f5f2' }) + t('FoodNavigator · 2019.08.09', { x: 125, y: 883, size: 48, family: 'text', color: '#cbc4ba' }) + '<div class="grain"></div>' });


const checks = [];
const ladder = [48,64,128,200,300];
for (const f of frames) {
  const sizes = Object.values(f.sizes); const errs = [];
  for (const s of sizes) { const near = ladder.reduce((a,b)=>(Math.abs(b-s)<Math.abs(a-s)?b:a)); if (Math.abs(s-near)/near > 0.06) errs.push('size ' + s + ' off ladder'); }
  if (sizes.filter(s=>s>=282).length > 1) errs.push('more than one hero');
  const levels = [...new Set(sizes)].sort((a,b)=>b-a); if (levels.length>3) errs.push('>3 levels');
  for (let i=1;i<levels.length;i++) if (levels[i-1]/levels[i] < 1.5) errs.push('levels too close');
  if (!f.scene) errs.push('no scene');
  checks.push({ frame: f.id, roles: f.roles, sizes, levels, scene: f.scene, ladderChecks: errs });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const files = {};
for (const f of frames) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + BASE + GRAIN + '</style></head><body>' + f.html + '</body></html>';
  const file = path.join(out, 'html', 'j-' + f.id + '.html');
  fs.writeFileSync(file, html);
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = path.join(out, 'j-' + f.id + '.png');
  await page.screenshot({ path: png });
  files[f.id] = png;
}
const cells = frames.map((f) => '<div class="c"><img src="' + pathToFileURL(files[f.id]).href + '"/><div class="cap"><b>' + f.id + ' ' + esc(f.name) + '</b> · ' + Object.values(f.roles || {}).join(' / ') + '</div></div>').join('');
const sheet = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '*{margin:0;box-sizing:border-box}html,body{background:#0d0d0d}.w{padding:36px}.h{font:26px ' + TEXT + ';color:#c9a96e;letter-spacing:.08em;margin:0 0 8px}.s{font:46px ' + DISP + ';color:#efe8dc;margin:0 0 26px}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}.c{background:#191919;border:1px solid #2a2a2a}.c img{width:100%;display:block}.cap{font:22px ' + TEXT + ';color:#cbc4ba;padding:10px 12px}</style></head><body><div class="w"><div class="h">BANANA-DESIGN · TYPOGRAPHY PROOF J · 2026-11-03</div><div class="s">场景先行 / 五档字 / 120 网格 / 一个层级</div><div class="g">' + cells + '</div></div></body></html>';
const sheetFile = path.join(out, 'html', 'sheet-j.html');
fs.writeFileSync(sheetFile, sheet);
await page.setViewportSize({ width: 2040, height: 1500 });
await page.goto(pathToFileURL(sheetFile).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(out, 'sheet-typography-j.png'), fullPage: true });
await browser.close();
fs.writeFileSync(path.join(out, 'typography-j.json'), JSON.stringify({ contract: 'A1TypographyProof/v1', at: '2026-11-03', note: 'ladderChecks only covers sizes/levels/scene; ink gaps and evidence are checked by blind review', frames: checks, sheet: 'sheet-typography-j.png' }, null, 1) + '\n');
console.log(JSON.stringify({ sheet: path.join(out, 'sheet-typography-j.png'), checks }));
