import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';

const cfg = boardConfig(process.env);
const out = path.join(cfg.dataDir, 'style-lab', 'design-study-20261103');
const dir = path.join(out, 'assets');
fs.mkdirSync(dir, { recursive: true });
const css = await fontCss(cfg, 'banana-design');
const DISP = 'GBLatin,GBDisplay,GBLast', TEXT = 'GBLatin,GBSmall,GBLast';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const render = async (name, inner) => {
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;background:transparent}div{position:absolute;white-space:pre;line-height:.95}</style></head><body>' + inner + '</body></html>';
  const f = path.join(out, 'html', 'layer-' + name + '.html'); fs.writeFileSync(f, html);
  await page.goto(pathToFileURL(f).href, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(dir, name + '.png'), omitBackground: true });
};
await render('type-K1', '<div style="left:120px;top:330px;font-family:' + DISP + ';font-size:200px;color:#f3ead6">同一棵香蕉</div>');
await render('type-K2', '<div style="left:120px;top:330px;font-family:' + DISP + ';font-size:200px;color:#e2442a">47%</div>');
await render('caption-K1', '<div style="left:1000px;top:330px;font-family:' + TEXT + ';font-size:48px;color:#cbc4ba;letter-spacing:.06em">卡文迪什 · 香芽蕉</div>');
await render('caption-K2', '<div style="left:120px;top:240px;font-family:' + TEXT + ';font-size:64px;color:#c2bb9f;letter-spacing:.1em">全球香蕉產量</div>');
await browser.close();
console.log(JSON.stringify({ dir }));
