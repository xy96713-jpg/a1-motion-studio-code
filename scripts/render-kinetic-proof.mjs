import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';

const cfg = boardConfig(process.env);
const dir = path.join(cfg.dataDir, 'style-lab', 'kinetic-proof-20261103');
const framesDir = path.join(dir, 'frames'); fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });
const css = await fontCss(cfg, 'banana-design');
const js = fs.readFileSync(path.join(dir, 'reel.js'), 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + 'html,body{margin:0;background:#0b0c0e;overflow:hidden}canvas{display:block}</style></head><body><canvas id="c"></canvas><script>' + js + '</script></body></html>';
const htmlFile = path.join(dir, 'reel.html'); fs.writeFileSync(htmlFile, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
await page.evaluate(async () => {
  await Promise.all([document.fonts.load('250px GBDisplay'), document.fonts.load('250px GBLatin'), document.fonts.load('48px GBSmall'), document.fonts.load('360px GBLatin')]);
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
});
const fps = 30, dur = 6, n = fps * dur;
for (let i = 0; i < n; i++) {
  await page.evaluate((t) => window.drawAt(t), i / fps);
  await page.screenshot({ path: path.join(framesDir, 'f' + String(i).padStart(4, '0') + '.png') });
}
const stills = [[0.0,'still-00'], [0.8,'still-01'], [2.9,'still-02'], [4.0,'still-landing'], [4.9,'still-03']];
for (const [t, name] of stills) { await page.evaluate((x) => window.drawAt(x), t); await page.screenshot({ path: path.join(dir, name + '.png') }); }
// contact sheet 3x4
const times = [0.0,0.6,1.2,1.55,1.7,1.85,2.0,2.6,3.2,3.5,3.7,3.9,4.0,4.8,5.6];
const imgs = times.map((t, i) => { const fr = Math.min(n - 1, Math.round(t * fps)); return '<div class="cell"><img src="frames/f' + String(fr).padStart(4, '0') + '.png"/><div class="cap">t=' + t.toFixed(1) + 's</div></div>'; }).join('');
const sheetHtml = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '*{margin:0;box-sizing:border-box}html,body{background:#0d0d0d}.w{padding:36px}.h{font:24px GBLatin;color:#d8f13c;letter-spacing:.08em}.s{font:44px GBDisplay;color:#f1eee6;margin:8px 0 24px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.cell{background:#161616;border:1px solid #2a2a2a}.cell img{width:100%;display:block}.cap{font:18px GBLatin;color:#cbc4ba;padding:8px 10px}</style></head><body><div class="w"><div class="h">KINETIC PROOF / 2026-11-03 / 6s / 120BPM</div><div class="s">三鏡 · 兩轉場：zoom-through / iris</div><div class="g">' + imgs + '</div></div></body></html>';
const sheetFile = path.join(dir, 'sheet.html'); fs.writeFileSync(sheetFile, sheetHtml);
await page.setViewportSize({ width: 2040, height: 1500 });
await page.goto(pathToFileURL(sheetFile).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(dir, 'sheet.png'), fullPage: true });
// exact-window transition strips from the rendered frames
const strip = async (name, start) => {
  const frames = Array.from({length: 11}, (_, i) => Math.min(n - 1, Math.round((start + i * 0.05) * fps)));
  const cells = frames.map((fr) => '<div class="s"><img src="frames/f' + String(fr).padStart(4, '0') + '.png"/><div class="c">' + (fr / fps).toFixed(2) + '</div></div>').join('');
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '*{margin:0;box-sizing:border-box}html,body{background:#0d0d0d}.row{display:flex;gap:6px;padding:10px}.s{width:320px;background:#161616;border:1px solid #2a2a2a}.s img{width:100%;display:block}.c{font:16px GBLatin;color:#cbc4ba;padding:4px 6px}</style></head><body><div class="row">' + cells + '</div></body></html>';
  const f = path.join(dir, 'strip-' + name + '.html'); fs.writeFileSync(f, html);
  await page.setViewportSize({ width: 3320, height: 260 });
  await page.goto(pathToFileURL(f).href, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(dir, 'strip-' + name + '.png'), fullPage: true });
};
await strip('zoom', 1.5); await strip('iris', 3.5);
await browser.close();
// encode
const mp4 = path.join(dir, 'kinetic-proof.mp4');
const r1 = spawnSync('ffmpeg', ['-v','error','-y','-framerate',String(fps),'-i',path.join(framesDir,'f%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','18',mp4]);
console.log('ffmpeg', r1.status, r1.stderr?.toString().slice(0,200));
fs.writeFileSync(path.join(dir, 'proof.json'), JSON.stringify({ contract: 'A1KineticProof/v1', at: '2026-11-03', fps, dur, shots: [{id:1,t:[0,1.5]},{id:2,t:[2.0,3.5]},{id:3,t:[4.0,6]}], transitions: [{id:'zoom-through',t:[1.5,2.0],from:[1500,520]},{id:'iris',t:[3.5,4.0],from:[1500,520]}], files: { mp4: 'kinetic-proof.mp4', sheet: 'sheet.png', stills: ['still-01.png','still-02.png','still-03.png'], strips: ['strip-zoom.png','strip-iris.png'] } }, null, 1) + '\n');
console.log(JSON.stringify({ done: true, mp4, frameCount: n }));
