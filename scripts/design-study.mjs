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
const asset = (p) => (fs.existsSync(p) ? pathToFileURL(p).href : null);
const IMG = {
  lineup: asset(path.join(proj, 'materials/opening-stills-20261029/mature/art-B01-lineup.png')),
  banana: asset(path.join(proj, 'materials/clips/banana-design-B02-wilfredor-cavendish-banana-from-maracaibo-jpg-f4d3bb75-621cc2d2-6907-45f5-9969-e4719f5ef02e.jpg')),
  banana2: asset(path.join(proj, 'materials/clips/banana-design-B12-wikimedia-commons-cavendish-banana-ds-jpg-aede52c0-a2ccd7d0-f205-4f07-a2fd-298d7eac9003.jpg')),
  page: asset(path.join(proj, 'materials/sources/aps-2005/page-06.png')),
  news: asset(path.join(proj, 'materials/clips/banana-design-B17-foodnavigator-com-colombia-declares-national-emergency-as--26cd83f0-window.png')),
  hero3d: asset(path.join(proj, 'materials/opening-stills-20261029/mature/art-B02-hero.png')),
};
const css = await fontCss(cfg, 'banana-design');
const GRAIN = '.grain{position:absolute;inset:0;pointer-events:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/><feColorMatrix type=\'saturate\' values=\'0\'/></filter><rect width=\'160\' height=\'160\' filter=\'url(%23n)\' opacity=\'0.09\'/></svg>")}';
const TYPE_MASK = '.tm{-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'6\' height=\'6\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'2\' stitchTiles=\'stitch\'/><feColorMatrix type=\'saturate\' values=\'0\'/><feComponentTransfer><feFuncA type=\'table\' tableValues=\'0.86 1\'/></feComponentTransfer></filter><rect width=\'6\' height=\'6\' filter=\'url(%23n)\' fill=\'white\'/></svg>");-webkit-mask-size:6px 6px}';

const pkgTax = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'packaging-taxonomy.json'), 'utf8'));
const gawx = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'gawx-layout-colour.json'), 'utf8'));
const P = Object.fromEntries(gawx.colourVariants.map((v) => [v.id, v.defaults]));
const V = (id) => (P[id] || {});
const cr = (a, b) => (a && b ? contrastRatioHex(a, b) : null);

const frames = [
  { id: 'A', name: '同一棵香蕉', variants: ['ch-warm-cool-pair', 'gl-stack-left'], img: IMG.lineup, shade: 0.68, ground: '#101116', ink: '#f6f5f2', accent: '#bc1014',
    blocks: [{ text: '同一棵香蕉', size: 300, color: '#f6f5f2', x: 120, y: 470, family: 'display', weight: 400 }], note: '封面大字压货架实拍，奶油字压暗底；Gawx 的左堆叠 + 暖冷双色。' },
  { id: 'B', name: '47%', variants: ['dn-hero-count', 'ch-dark-complementary'], img: null, shade: 0, ground: '#0f1113', ink: '#c2bb9f', accent: '#e2442a',
    blocks: [{ text: '47%', size: 300, color: '#c2bb9f', x: 120, y: 360, family: 'display', weight: 400, accentChar: { ch: '%', color: '#e2442a' } }, { text: '全球香蕉產量', size: 64, color: '#c2bb9f', x: 124, y: 730, family: 'text' }], note: '数字是唯一主角，% 用强调色；单位行按 0.15em 行距压在下面。' },
  { id: 'C', name: '卡文迪什', variants: ['gh-title-photo', 'ch-dark-analogous'], img: IMG.banana, shade: 0.5, ground: '#100d0c', ink: '#f1f0ed', accent: '#8c734c',
    blocks: [{ text: '卡文迪什', size: 300, color: '#f1f0ed', x: 120, y: 330, family: 'display' }, { text: '香芽蕉', size: 64, color: '#f1f0ed', x: 124, y: 690, family: 'text' }], note: '标题压在香蕉实拍上，暖棕暗底与果色同族。' },
  { id: 'D', name: '巴拿馬病', variants: ['ec-inset-page', 'ts-page-margin'], img: IMG.page, card: true, ground: '#100d0c', ink: '#efe8dc', accent: '#bc1014',
    blocks: [{ text: '巴拿馬病', size: 200, color: '#efe8dc', x: 1040, y: 300, family: 'display' }, { text: '土壤裡的真菌', size: 64, color: '#efe8dc', x: 1044, y: 540, family: 'text' }, { text: 'TR4', size: 64, color: '#bc1014', x: 1044, y: 650, family: 'text' }], note: '真论文页卡内嵌，右侧暗底压字；红只给学名 TR4 一个词。' },
  { id: 'E', name: '國家緊急狀態', variants: ['ec-red-band', 'type-surface'], img: IMG.news, card: true, cardW: 780, cardH: 470, band: true, ground: '#100d0c', ink: '#f6f5f2', accent: '#bc1014',
    blocks: [{ text: 'FoodNavigator 報道', size: 48, color: '#f6f5f2', x: 120, y: 650, family: 'text' }, { text: '國家緊急狀態', size: 200, color: '#f6f5f2', x: 120, y: 720, family: 'display' }], note: '报道页作证据卡，红色带只承载“国家紧急状态”一击。' },
  { id: 'F', name: '單一', variants: ['gl-stack-left', 'ch-noir-single'], img: IMG.banana2, split: true, ground: '#111111', ink: '#f1f0ed', accent: '#b0700b',
    blocks: [{ text: '單一', size: 300, color: '#f1f0ed', x: 120, y: 430, family: 'display' }], note: '收束只留两个字，左侧暗底、右侧果身；近黑底 + 单一暖色。' }
];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function frameHtml(f) {
  const bg = f.img && !f.card ? '#000' : f.ground;
  const img = f.img && !f.card && !f.split ? '<img class="bg" src="' + f.img + '"/>' : '';
  const split = f.split && f.img ? '<div class="split"><img src="' + f.img + '"/></div>' : '';
  const shade = f.img && !f.card && !f.split ? '<div class="shade" style="background:linear-gradient(180deg,#000000' + Math.round((1 - f.shade) * 100) + ',#000000' + Math.round((1 - f.shade) * 100) + ')"></div>' : '';
  const card = f.card && f.img ? '<div class="card" style="width:' + (f.cardW || 820) + 'px;height:' + (f.cardH || 820) + 'px"><img src="' + f.img + '"/></div>' : '';
  const band = f.band ? '<div class="band" style="background:#bc1014"></div>' : '';
  const blocks = f.blocks.map((b) => {
    const fam = b.family === 'display' ? 'GBLatin,GBDisplay,GBLast' : 'GBLatin,GBSmall,GBLast';
    const x = b.align === 'center' ? 'left:50%;transform:translateX(-50%)' : 'left:' + b.x + 'px';
    let txt = esc(b.text);
    if (b.accentChar) { const keep = txt.slice(0, -b.accentChar.ch.length); txt = esc(keep) + '<span style="color:' + b.accentChar.color + '">' + esc(b.accentChar.ch) + '</span>'; }
    return '<div class="t tm" style="' + x + ';top:' + b.y + 'px;font-size:' + b.size + 'px;font-family:' + fam + ';color:' + b.color + '">' + txt + '</div>';
  }).join('');
  return '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden;background:' + bg + '}.f{position:relative;width:1920px;height:1080px;overflow:hidden;background:' + bg + '}.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.shade{position:absolute;inset:0}.t{position:absolute;white-space:pre;line-height:1.1}.card{position:absolute;left:120px;top:110px;width:820px;height:820px;border:10px solid #111;box-shadow:0 30px 80px #000a;background:#111;overflow:hidden}.card img{width:100%;height:100%;object-fit:contain;object-position:center;background:#fff}.split{position:absolute;right:0;top:0;width:1020px;height:1080px;overflow:hidden}.split img{width:100%;height:100%;object-fit:cover;object-position:center}.band{position:absolute;left:0;right:0;top:620px;height:320px}' + GRAIN + TYPE_MASK + '</style></head><body><div class="f">' + img + shade + split + card + band + '<div class="grain"></div>' + blocks + '</div></body></html>';
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const files = {};
for (const f of frames) {
  const file = path.join(out, 'html', f.id + '.html');
  fs.writeFileSync(file, frameHtml(f));
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = path.join(out, 'design-' + f.id + '.png');
  await page.screenshot({ path: png });
  files[f.id] = png;
}
// contact sheet
const cells = frames.map((f) => '<div class="c"><img src="' + pathToFileURL(files[f.id]).href + '"/><div class="cap"><b>' + f.id + ' ' + esc(f.name) + '</b> · ' + f.variants.join(' + ') + '</div></div>').join('');
const sheet = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '*{margin:0;box-sizing:border-box}html,body{background:#111}.w{padding:36px}.h{font:26px GBLatin,GBSmall,GBLast;color:#c9a96e;letter-spacing:.08em;margin:0 0 8px}.s{font:46px GBLatin,GBDisplay,GBLast;color:#efe8dc;margin:0 0 26px}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}.c{background:#191919;border:1px solid #2a2a2a}.c img{width:100%;display:block}.cap{font:22px GBLatin,GBSmall,GBLast;color:#cbc4ba;padding:10px 12px}</style></head><body><div class="w"><div class="h">BANANA-DESIGN · DESIGN STUDY · 2026-11-03</div><div class="s">同一套字 / 三组对标 / 六个包装变体</div><div class="g">' + cells + '</div></div></body></html>';
const sheetFile = path.join(out, 'html', 'sheet.html');
fs.writeFileSync(sheetFile, sheet);
await page.setViewportSize({ width: 2040, height: 1400 });
await page.goto(pathToFileURL(sheetFile).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(out, 'sheet.png'), fullPage: true });
await browser.close();
const doc = { contract: 'A1DesignStudy/v1', at: '2026-11-03', project: 'banana-design', purpose: '用包装代码本、Gawx 排版配色与字体系统做的样张（style-lab 预览，非交付）', frames: frames.map((f) => ({ id: f.id, name: f.name, variants: f.variants, image: 'design-' + f.id + '.png', note: f.note, contrast: { inkGround: cr(f.ink, f.ground), accentGround: cr(f.accent, f.ground) }, palette: { ground: f.ground, ink: f.ink, accent: f.accent }, layout: { x: f.blocks[0]?.x, y: f.blocks[0]?.y, size: f.blocks[0]?.size } })) };
fs.writeFileSync(path.join(out, 'design-study.json'), JSON.stringify(doc, null, 1) + '\n');
console.log(JSON.stringify({ out, frames: Object.keys(files), sheet: path.join(out, 'sheet.png') }));
