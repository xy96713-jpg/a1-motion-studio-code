import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';

const cfg = boardConfig(process.env);
const out = path.join(cfg.dataDir, 'style-lab', 'design-study-20261103');
const cut = pathToFileURL(path.join(out, 'assets', 'banana-cutout.png')).href;
const css = await fontCss(cfg, 'banana-design');
const DISP = 'GBLatin,GBDisplay,GBLast', TEXT = 'GBLatin,GBSmall,GBLast';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const BASE = '*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden;background:#0b0c0e}';
const GRAIN = '.grain{position:absolute;inset:0;pointer-events:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/><feColorMatrix type=\'saturate\' values=\'0\'/></filter><rect width=\'160\' height=\'160\' filter=\'url(%23n)\' opacity=\'0.08\'/></svg>")}';
const light = (x,y) => '<div style="position:absolute;inset:0;background:radial-gradient(ellipse at ' + x + '% ' + y + '%,rgba(255,176,92,.16),transparent 55%)"></div>';
const vignette = '<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 45%,rgba(0,0,0,.55) 100%)"></div>';
const t = (s, o) => '<div style="position:absolute;left:' + o.x + 'px;top:' + o.y + 'px;font-family:' + (o.family === 'text' ? TEXT : DISP) + ';font-size:' + o.size + 'px;line-height:' + (o.lh || 0.95) + ';color:' + o.color + ';white-space:pre;' + (o.extra || '') + '">' + esc(s) + '</div>';
const layer = (src, o) => '<img src="' + src + '" style="position:absolute;left:' + o.x + 'px;top:' + o.y + 'px;width:' + o.w + 'px;height:auto;' + (o.blur ? 'filter:blur(' + o.blur + 'px) ' : '') + (o.drop ? 'filter:drop-shadow(0 28px 46px rgba(0,0,0,.5))' : '') + 'opacity:' + (o.opacity ?? 1) + ';z-index:' + (o.z || 1) + '"/>';

const frames = [
  { id: 'K1', pairing: 'tip-object-behind', register: 'product-object', name: '同一棵香蕉 · 主体遮挡',
    html: layer(cut, { x: 760, y: 240, w: 1500, blur: 26, opacity: .45, z: 1 }) + '<div style="position:absolute;inset:0;background:#0b0c0e;opacity:.42;z-index:1"></div>' + t('同一棵香蕉', { x: 120, y: 330, size: 200, color: '#f6f5f2', extra: 'z-index:2' }) + t('卡文迪什 · 香芽蕉', { x: 132, y: 550, size: 48, family: 'text', color: '#cbc4ba', extra: 'letter-spacing:.06em;z-index:2' }) + layer(cut, { x: 420, y: 250, w: 1180, drop: true, z: 3 }) + light(72, 18) + vignette + '<div class="grain"></div>',
    spec: { pairing: 'tip-object-behind', register: 'product-object', face: 'House Kokka', size: 200, placement: 'behind-subject', occlusion: 0.28, accentCount: 0, effectCount: 0 } },
  { id: 'K2', pairing: 'tip-object-behind', register: 'product-object', name: '47% · 数字被主体咬住',
    html: layer(cut, { x: 720, y: 250, w: 1500, blur: 28, opacity: .4, z: 1 }) + '<div style="position:absolute;inset:0;background:#0b0c0e;opacity:.45;z-index:1"></div>' + '<div style="position:absolute;left:114px;top:330px;font-family:' + DISP + ';font-size:200px;line-height:.95;white-space:pre;color:#e2442a;z-index:2">47%</div>' + t('全球香蕉產量', { x: 120, y: 262, size: 64, family: 'text', color: '#c2bb9f', extra: 'letter-spacing:.1em;z-index:2' }) + layer(cut, { x: 200, y: 320, w: 1180, drop: true, z: 3 }) + light(70, 20) + vignette + '<div class="grain"></div>',
    spec: { pairing: 'tip-object-behind', register: 'product-object', face: 'House Kikai', size: 200, placement: 'behind-subject', occlusion: 0.24, accentCount: 1, effectCount: 0 } }
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const files = {};
for (const f of frames) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + BASE + GRAIN + '</style></head><body>' + f.html + '</body></html>';
  const file = path.join(out, 'html', 'k-' + f.id + '.html');
  fs.writeFileSync(file, html);
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = path.join(out, 'k-' + f.id + '.png');
  await page.screenshot({ path: png });
  files[f.id] = png;
}
const cells = frames.map((f) => '<div class="c"><img src="' + pathToFileURL(files[f.id]).href + '"/><div class="cap"><b>' + f.id + ' ' + esc(f.name) + '</b> · ' + f.pairing + '</div></div>').join('');
const sheet = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '*{margin:0;box-sizing:border-box}html,body{background:#0b0c0e}.w{padding:36px}.h{font:26px ' + TEXT + ';color:#c9a96e;letter-spacing:.08em;margin:0 0 8px}.s{font:46px ' + DISP + ';color:#efe8dc;margin:0 0 26px}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}.c{background:#151515;border:1px solid #2a2a2a}.c img{width:100%;display:block}.cap{font:22px ' + TEXT + ';color:#cbc4ba;padding:10px 12px}</style></head><body><div class="w"><div class="h">BANANA-DESIGN · SCENE + TYPE · 2026-11-03</div><div class="s">三层构图：背景场 / 主体 / 字被主体咬住</div><div class="g">' + cells + '</div></div></body></html>';
const sf = path.join(out, 'html', 'sheet-k.html');
fs.writeFileSync(sf, sheet);
await page.setViewportSize({ width: 2040, height: 1000 });
await page.goto(pathToFileURL(sf).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(out, 'sheet-type-scene.png'), fullPage: true });
await browser.close();
fs.writeFileSync(path.join(out, 'type-scene.json'), JSON.stringify({ contract: 'A1TypeSceneStudy/v1', at: '2026-11-03', frames: frames.map((f) => ({ id: f.id, name: f.name, spec: f.spec, png: 'k-' + f.id + '.png' })) }, null, 1) + '\n');
console.log(JSON.stringify({ sheet: path.join(out, 'sheet-type-scene.png'), files }));
