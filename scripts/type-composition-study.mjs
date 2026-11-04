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
const U = (p) => pathToFileURL(path.join(proj, p)).href;
const IMG = { banana: U('materials/clips/banana-design-B02-wilfredor-cavendish-banana-from-maracaibo-jpg-f4d3bb75-621cc2d2-6907-45f5-9969-e4719f5ef02e.jpg'), banana2: U('materials/clips/banana-design-B12-wikimedia-commons-cavendish-banana-ds-jpg-aede52c0-a2ccd7d0-f205-4f07-a2fd-298d7eac9003.jpg'), lineup: U('materials/opening-stills-20261029/mature/art-B01-lineup.png'), news: U('materials/clips/banana-design-B17-foodnavigator-com-colombia-declares-national-emergency-as--26cd83f0-window.png'), page: U('materials/sources/aps-2005/page-06.png') };
const css = await fontCss(cfg, 'banana-design');
const DISP = 'GBLatin,GBDisplay,GBLast', TEXT = 'GBLatin,GBSmall,GBLast';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const GRAIN = '.grain{position:absolute;inset:0;pointer-events:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/><feColorMatrix type=\'saturate\' values=\'0\'/></filter><rect width=\'160\' height=\'160\' filter=\'url(%23n)\' opacity=\'0.08\'/></svg>")}';
const HALFTONE = '.ht{-webkit-mask-image:repeating-radial-gradient(circle at 2px 2px,#000 0 1.4px,transparent 1.9px 6px);-webkit-mask-size:6px 6px}';
const BASE = '*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden}';

const photo = (src, o = {}) => '<img src="' + src + '" style="position:absolute;left:' + (o.left ?? 0) + 'px;top:0;width:' + (o.width ?? 1920) + 'px;height:' + (o.height ?? 1080) + 'px;object-fit:cover;object-position:' + (o.pos || 'center') + '"/>';
const shade = (o = {}) => '<div style="position:absolute;inset:0;background:' + (o.color || '#000') + ';opacity:' + (o.opacity ?? 0.4) + '"></div>';
const text = (t, o) => '<div style="position:absolute;left:' + o.x + 'px;top:' + o.y + 'px;font-family:' + (o.family === 'text' ? TEXT : DISP) + ';font-size:' + o.size + 'px;line-height:' + (o.lh || 0.95) + ';color:' + (o.color || '#f6f5f2') + ';white-space:pre;' + (o.extra || '') + '">' + esc(t) + '</div>';
const grad = (t, o) => '<div style="position:absolute;left:' + o.x + 'px;top:' + o.y + 'px;font-family:' + DISP + ';font-size:' + o.size + 'px;line-height:.95;white-space:pre;background-image:linear-gradient(' + (o.angle || 120) + 'deg,' + o.from + ',' + o.to + ');-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;' + (o.extra || '') + '">' + esc(t) + '</div>';
const imgFill = (t, o) => '<div style="position:absolute;left:' + o.x + 'px;top:' + o.y + 'px;font-family:' + DISP + ';font-size:' + o.size + 'px;line-height:.95;white-space:pre;background-image:linear-gradient(rgba(0,0,0,' + (o.shade ?? 0.25) + '),rgba(0,0,0,' + (o.shade ?? 0.25) + ')),url(\'' + o.img + '\');background-size:cover;background-position:center;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;' + (o.extra || '') + '">' + esc(t) + '</div>';
const vertical = (t, o) => '<div style="position:absolute;left:' + o.x + 'px;top:' + o.y + 'px;font-family:' + DISP + ';font-size:' + o.size + 'px;line-height:.95;writing-mode:vertical-rl;text-orientation:upright;color:' + o.color + ';letter-spacing:' + (o.ls || 0) + 'px;white-space:pre">' + esc(t) + '</div>';
const maskedPhoto = (t, o) => '<svg style="position:absolute;left:0;top:0" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><filter id="br" x="0" y="0" width="100%" height="100%"><feComponentTransfer><feFuncR type="linear" slope="1.25"/><feFuncG type="linear" slope="1.2"/><feFuncB type="linear" slope="1.1"/></feComponentTransfer></filter><mask id="mk"><text x="' + o.x + '" y="' + o.baseline + '" font-family="' + DISP + '" font-size="' + o.size + '" fill="white">' + esc(t) + '</text></mask></defs><image href="' + o.img + '" width="1920" height="1080" preserveAspectRatio="xMidYMid slice" filter="url(#br)" mask="url(#mk)"/></svg>';
const extrude = (t, o) => { const n = o.layers || 18; let s = ''; for (let i = n; i >= 1; i--) { const k = i / n; const col = o.colors[Math.min(o.colors.length - 1, Math.round(k * (o.colors.length - 1)))]; s += '<text x="' + (o.x + i * (o.dx || 1.2)) + '" y="' + (o.y + i * (o.dy || 1.2)) + '" font-family="' + DISP + '" font-size="' + o.size + '" fill="' + col + '">' + esc(t) + '</text>'; } s += '<text x="' + o.x + '" y="' + o.y + '" font-family="' + DISP + '" font-size="' + o.size + '" fill="' + o.face + '">' + esc(t) + '</text>'; return '<svg style="position:absolute;left:0;top:0" width="1920" height="1080" viewBox="0 0 1920 1080">' + s + '</svg>'; };

const frames = [];
// H1 image-filled giant type + photo panel overlapping it
frames.push({ id: 'H1', name: '同一棵香蕉 · 灌图+遮挡', variants: ['te-image-fill', 'te-oversize-bleed'], html: photo(IMG.banana2, { left: 1080, width: 840, pos: 'left center' }) + '<div style="position:absolute;inset:0;background:#101116;opacity:.28"></div>' + imgFill('同一棵香蕉', { x: -40, y: 250, size: 600, img: IMG.banana, shade: 0.15, extra: 'z-index:2;filter:brightness(1.25) contrast(1.1)' }) + '<div style="position:absolute;left:1080px;top:0;width:840px;height:1080px;background:#101116;opacity:.12;z-index:3"></div>' + text('B01 / 回形針式封面', { x: 120, y: 96, size: 34, family: 'text', color: '#cbc4ba', extra: 'letter-spacing:.08em;z-index:4' }) + grain() });
// H2 huge gradient number, cropped
frames.push({ id: 'H2', name: '47% · 渐变+出画', variants: ['te-gradient-fill', 'te-oversize-bleed'], html: shade({ color: '#0f1113', opacity: 1 }) + text('全球香蕉產量', { x: 120, y: 120, size: 48, family: 'text', color: '#c2bb9f', extra: 'letter-spacing:.12em' }) + grad('47%', { x: 90, y: 300, size: 860, from: '#f6f5f2', to: '#e2442a', angle: 118 }) + grain() });
// H3 knockout into a bright photo: letters are the lit photo
frames.push({ id: 'H3', name: '卡文迪什 · 透光遮罩', variants: ['te-knockout-window'], html: photo(IMG.banana) + shade({ color: '#000', opacity: 0.8 }) + maskedPhoto('卡文迪什', { x: 100, baseline: 760, size: 640, img: IMG.banana }) + text('香芽蕉', { x: 1560, y: 120, size: 52, family: 'text', color: '#bc1014', extra: 'letter-spacing:.2em' }) + grain() });
// H4 3D extruded giant type
frames.push({ id: 'H4', name: '巴拿馬病 · 立体大字', variants: ['te-layer-depth', 'te-oversize-bleed'], html: shade({ color: '#100d0c', opacity: 1 }) + photo(IMG.page, { left: 1180, width: 740, height: 1080 }) + '<div style="position:absolute;inset:0;background:#100d0c;opacity:.55"></div>' + extrude('巴拿馬病', { x: -30, y: 700, size: 680, layers: 26, dx: 1.5, dy: 1.5, colors: ['#1a0708', '#3a0d0e', '#6b1a18', '#9c2a22'], face: '#efe8dc' }) + text('TR4', { x: 1610, y: 120, size: 64, family: 'text', color: '#bc1014', extra: 'letter-spacing:.1em' }) + grain() });
// H5 vertical type split with evidence page
frames.push({ id: 'H5', name: '國家緊急狀態 · 竖排分栏', variants: ['te-vertical', 'ec-red-band'], html: photo(IMG.news, { left: 780, width: 1140, height: 1080 }) + '<div style="position:absolute;left:780px;top:0;width:1140px;height:1080px;background:#000;opacity:.18"></div>' + '<div style="position:absolute;left:0;top:0;width:780px;height:1080px;background:#bc1014"></div>' + vertical('國家緊急狀態', { x: 190, y: 70, size: 140, color: '#f6f5f2', ls: 6 }) + text('FoodNavigator 報道', { x: 830, y: 1010, size: 34, family: 'text', color: '#f6f5f2', extra: 'letter-spacing:.06em' }) + grain() });
// H6 cream ground, black image-filled type, cropped
frames.push({ id: 'H6', name: '單一 · 反白灌字', variants: ['te-image-fill', 'te-oversize-bleed'], html: shade({ color: '#efe8dc', opacity: 1 }) + '<div style="position:absolute;left:150px;top:280px;font-family:' + DISP + ';font-size:900px;line-height:.9;color:#100d0c;white-space:pre">單一</div>' + text('一根香蕉的複製', { x: 1280, y: 960, size: 44, family: 'text', color: '#bc1014', extra: 'letter-spacing:.08em' }) + grain() });
// H7 gradient + halftone giant number
frames.push({ id: 'H7', name: '175 公頃 · 渐变半调', variants: ['te-gradient-fill', 'te-halftone-mask'], html: shade({ color: '#100d0c', opacity: 1 }) + grad('175', { x: -20, y: 250, size: 780, from: '#e2442a', to: '#b0700b', angle: 150, extra: 'z-index:2' }) + grad('公頃', { x: 1000, y: 620, size: 260, from: '#e2442a', to: '#b0700b', angle: 150, extra: 'z-index:2' }) + text('受影響面積', { x: 120, y: 930, size: 52, family: 'text', color: '#efe8dc', extra: 'letter-spacing:.12em' }) + grain() });

function grain() { return '<div class="grain"></div>'; }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const files = {};
for (const f of frames) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + BASE + '.grain{position:absolute;inset:0;pointer-events:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/><feColorMatrix type=\'saturate\' values=\'0\'/></filter><rect width=\'160\' height=\'160\' filter=\'url(%23n)\' opacity=\'0.08\'/></svg>")}</style></head><body>' + f.html + '</body></html>';
  const file = path.join(out, 'html', 'h-' + f.id + '.html');
  fs.writeFileSync(file, html);
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = path.join(out, 'h-' + f.id + '.png');
  await page.screenshot({ path: png });
  files[f.id] = png;
}
const cells = frames.map((f) => '<div class="c"><img src="' + pathToFileURL(files[f.id]).href + '"/><div class="cap"><b>' + f.id + ' ' + esc(f.name) + '</b> · ' + f.variants.join(' + ') + '</div></div>').join('');
const sheet = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '*{margin:0;box-sizing:border-box}html,body{background:#0d0d0d}.w{padding:36px}.h{font:26px ' + TEXT + ';color:#c9a96e;letter-spacing:.08em;margin:0 0 8px}.s{font:46px ' + DISP + ';color:#efe8dc;margin:0 0 26px}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}.c{background:#191919;border:1px solid #2a2a2a}.c img{width:100%;display:block}.cap{font:22px ' + TEXT + ';color:#cbc4ba;padding:10px 12px}</style></head><body><div class="w"><div class="h">BANANA-DESIGN · TYPE COMPOSITION · 2026-11-03</div><div class="s">大字当材料：灌图 / 渐变 / 遮罩 / 立体 / 竖排 / 出画</div><div class="g">' + cells + '</div></div></body></html>';
const sheetFile = path.join(out, 'html', 'sheet-h.html');
fs.writeFileSync(sheetFile, sheet);
await page.setViewportSize({ width: 2040, height: 1600 });
await page.goto(pathToFileURL(sheetFile).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(out, 'sheet-type-composition.png'), fullPage: true });
await browser.close();
console.log(JSON.stringify({ sheet: path.join(out, 'sheet-type-composition.png'), frames: Object.keys(files) }));
