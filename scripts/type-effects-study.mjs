import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';

const cfg = boardConfig(process.env);
const out = path.join(cfg.dataDir, 'style-lab', 'design-study-20261103');
fs.mkdirSync(path.join(out, 'html'), { recursive: true });
const proj = path.join(cfg.dataDir, 'projects', 'banana-design');
const A = (p) => pathToFileURL(fs.existsSync(p) ? p : path.join(proj, p)).href;
const IMG = {
  banana: A('materials/clips/banana-design-B02-wilfredor-cavendish-banana-from-maracaibo-jpg-f4d3bb75-621cc2d2-6907-45f5-9969-e4719f5ef02e.jpg'),
  banana2: A('materials/clips/banana-design-B12-wikimedia-commons-cavendish-banana-ds-jpg-aede52c0-a2ccd7d0-f205-4f07-a2fd-298d7eac9003.jpg'),
  lineup: A('materials/opening-stills-20261029/mature/art-B01-lineup.png'),
  news: A('materials/clips/banana-design-B17-foodnavigator-com-colombia-declares-national-emergency-as--26cd83f0-window.png'),
  map: A('materials/maps/region.png'),
};
const css = await fontCss(cfg, 'banana-design');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const GRAIN = '.grain{position:absolute;inset:0;pointer-events:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/><feColorMatrix type=\'saturate\' values=\'0\'/></filter><rect width=\'160\' height=\'160\' filter=\'url(%23n)\' opacity=\'0.07\'/></svg>")}';
const DISP = 'GBLatin,GBDisplay,GBLast', TEXT = 'GBLatin,GBSmall,GBLast';

function block(b) {
  const base = 'position:absolute;left:' + b.x + 'px;top:' + b.y + 'px;font-family:' + (b.family === 'text' ? TEXT : DISP) + ';font-size:' + b.size + 'px;line-height:' + (b.lh || 0.95) + ';';
  if (b.effect === 'gradient') return '<div class="t" style="' + base + 'background-image:linear-gradient(' + (b.angle || 120) + 'deg,' + b.from + ',' + b.to + ');-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent">' + esc(b.text) + '</div>';
  if (b.effect === 'image') { const ov = 'linear-gradient(rgba(0,0,0,' + (b.shade ?? 0.3) + '),rgba(0,0,0,' + (b.shade ?? 0.3) + ')),'; return '<div class="t" style="' + base + 'background-image:' + ov + 'url(\'' + b.img + '\');background-size:cover;background-position:center;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent">' + esc(b.text) + '</div>'; }
  if (b.effect === 'halftone') return '<div class="t halftone" style="' + base + 'color:' + b.color + '">' + esc(b.text) + '</div>';
  if (b.effect === 'vertical') return '<div class="t" style="' + base + 'writing-mode:vertical-rl;text-orientation:upright;color:' + b.color + ';letter-spacing:' + (b.ls || 0) + 'px">' + esc(b.text) + '</div>';
  if (b.effect === 'layer') return '<div class="t" style="' + base + 'left:' + (b.x + (b.offset || 16)) + 'px;top:' + (b.y + (b.offset || 16)) + 'px;color:' + b.back + '">' + esc(b.text) + '</div><div class="t" style="' + base + 'color:' + b.color + '">' + esc(b.text) + '</div>';
  return '<div class="t" style="' + base + 'color:' + b.color + '">' + esc(b.text) + '</div>';
}
function knockout(b) {
  const w = b.w, h = b.h, size = b.size;
  return '<svg style="position:absolute;left:' + b.x + 'px;top:' + b.y + 'px" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><defs><mask id="' + b.id + '"><text x="0" y="' + (h - 30) + '" font-family="' + DISP + '" font-size="' + size + '" fill="white">' + esc(b.text) + '</text></mask></defs><image href="' + b.img + '" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" mask="url(#' + b.id + ')"/></svg>';
}
function frame(f) {
  const bg = f.ground || '#111';
  const split = f.img && f.split ? '<div class="split"><img src="' + f.img + '"/></div>' : '';
  const full = f.img && !f.split && !f.card ? '<img class="bg" src="' + f.img + '"/><div class="shade" style="background:#000;opacity:' + (f.shade ?? 0.3) + '"></div>' : '';
  const card = f.card ? '<div class="card" style="width:' + (f.cardW || 760) + 'px;height:' + (f.cardH || 460) + 'px"><img src="' + f.img + '"/></div>' : '';
  const band = f.band ? '<div class="band" style="background:' + f.accent + ';top:' + f.bandY + 'px;height:' + f.bandH + 'px"></div>' : '';
  const ko = (f.knockouts || []).map(knockout).join('');
  return '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden;background:' + bg + '}.f{position:relative;width:1920px;height:1080px;overflow:hidden;background:' + bg + '}.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.shade{position:absolute;inset:0}.t{position:absolute;white-space:pre}.card{position:absolute;left:120px;top:110px;border:10px solid #111;box-shadow:0 30px 80px #000a;overflow:hidden;background:#fff}.card img{width:100%;height:100%;object-fit:contain;background:#fff}.split{position:absolute;right:0;top:0;width:1020px;height:1080px;overflow:hidden}.split img{width:100%;height:100%;object-fit:cover}.band{position:absolute;left:0;right:0}.halftone{-webkit-mask-image:repeating-radial-gradient(circle at 2px 2px,#000 0 1.4px,transparent 1.9px 6px);-webkit-mask-size:6px 6px}' + GRAIN + '</style></head><body><div class="f">' + full + split + card + band + ko + (f.blocks || []).map(block).join('') + '<div class="grain"></div></div></body></html>';
}

const frames = [
  { id: 'G1', name: '同一棵香蕉 · 照片灌字', variants: ['te-image-fill'], ground: '#101116', blocks: [{ text: '同一棵香蕉', size: 460, x: -20, y: 300, effect: 'image', img: IMG.banana2, shade: 0.32 }] },
  { id: 'G2', name: '47% · 渐变灌字', variants: ['te-gradient-fill', 'te-oversize-bleed'], ground: '#0f1113', blocks: [{ text: '47%', size: 640, x: 70, y: 380, effect: 'gradient', from: '#f6f5f2', to: '#e2442a', angle: 115 }, { text: '全球香蕉產量', size: 64, x: 90, y: 930, family: 'text', color: '#c2bb9f' }] },
  { id: 'G3', name: '卡文迪什 · 挖空', variants: ['te-knockout-window'], ground: '#100d0c', knockouts: [{ id: 'k3', text: '卡文迪什', size: 440, x: 120, y: 300, w: 1500, h: 480, img: IMG.banana }], blocks: [{ text: '香芽蕉', size: 64, x: 125, y: 820, family: 'text', color: '#f1f0ed' }] },
  { id: 'G4', name: '巴拿馬病 · 出画渐变', variants: ['te-oversize-bleed', 'te-gradient-fill'], ground: '#100d0c', blocks: [{ text: '巴拿馬病', size: 720, x: -30, y: 220, effect: 'gradient', from: '#efe8dc', to: '#bc1014', angle: 160 }, { text: 'TR4', size: 64, x: 1480, y: 930, family: 'text', color: '#bc1014' }] },
  { id: 'G5', name: '國家緊急狀態 · 竖排', variants: ['te-vertical', 'ec-red-band'], ground: '#bc1014', img: IMG.news, card: true, cardW: 720, cardH: 430, blocks: [{ text: '國家緊急狀態', size: 160, x: 1560, y: 70, effect: 'vertical', color: '#f6f5f2' }, { text: 'FoodNavigator 報道', size: 48, x: 120, y: 700, family: 'text', color: '#f6f5f2' }] },
  { id: 'G6', name: '單一 · 挖空', variants: ['te-knockout-window', 'gl-stack-left'], ground: '#111111', img: IMG.banana, split: true, knockouts: [{ id: 'k6', text: '單一', size: 600, x: 60, y: 250, w: 860, h: 620, img: IMG.banana }] },
  { id: 'G7', name: 'TR4 · 半调', variants: ['te-halftone-mask'], ground: '#0f1113', blocks: [{ text: 'TR4', size: 640, x: 120, y: 220, effect: 'halftone', color: '#e2442a' }, { text: '熱帶 4 號小種', size: 64, x: 130, y: 930, family: 'text', color: '#c2bb9f' }] },
  { id: 'G8', name: '175 公頃 · 照片灌字', variants: ['te-image-fill'], ground: '#100d0c', blocks: [{ text: '175 公頃', size: 520, x: -10, y: 300, effect: 'image', img: IMG.lineup, shade: 0.4 }, { text: '受影響面積', size: 64, x: 120, y: 900, family: 'text', color: '#efe8dc' }] }
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const files = {};
for (const f of frames) {
  const file = path.join(out, 'html', 'fx-' + f.id + '.html');
  fs.writeFileSync(file, frame(f));
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = path.join(out, 'fx-' + f.id + '.png');
  await page.screenshot({ path: png });
  files[f.id] = png;
}
const cells = frames.map((f) => '<div class="c"><img src="' + pathToFileURL(files[f.id]).href + '"/><div class="cap"><b>' + f.id + ' ' + esc(f.name) + '</b> · ' + f.variants.join(' + ') + '</div></div>').join('');
const sheet = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '*{margin:0;box-sizing:border-box}html,body{background:#101010}.w{padding:36px}.h{font:26px ' + TEXT + ';color:#c9a96e;letter-spacing:.08em;margin:0 0 8px}.s{font:46px ' + DISP + ';color:#efe8dc;margin:0 0 26px}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}.c{background:#191919;border:1px solid #2a2a2a}.c img{width:100%;display:block}.cap{font:22px ' + TEXT + ';color:#cbc4ba;padding:10px 12px}</style></head><body><div class="w"><div class="h">BANANA-DESIGN · TYPE EFFECTS · 2026-11-03</div><div class="s">胡泊式大字：灌图 / 渐变 / 挖空 / 竖排 / 出画 / 半调</div><div class="g">' + cells + '</div></div></body></html>';
const sheetFile = path.join(out, 'html', 'sheet-fx.html');
fs.writeFileSync(sheetFile, sheet);
await page.setViewportSize({ width: 2040, height: 1500 });
await page.goto(pathToFileURL(sheetFile).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(out, 'sheet-type-effects.png'), fullPage: true });
await browser.close();
console.log(JSON.stringify({ sheet: path.join(out, 'sheet-type-effects.png'), frames: Object.keys(files) }));
