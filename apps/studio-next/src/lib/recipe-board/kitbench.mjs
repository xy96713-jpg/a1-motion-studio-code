// The device kit's bench (kitbench CLI): every part of kit4.js drawn at two moments — on its way and done — on one
// sheet, in the lettering's faces, so a change to a part is seen before a chapter uses it (the user 2026-10-22: 为什么不
// 先设计好减少返工呢; the parts of 2026-10-26). Cases: templates/kit4.bench.js. Pictures: six of a project's materials,
// copied under plain names (a name in Chinese did not survive the page's request).
//   node scripts/recipe-board.mjs kitbench [--only <part>] [--project <id whose pictures>] [--style <routing/styles.json id>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

// the lettering's faces by the names the parts ask for (house letterRoles' default: tall 黒華明朝 big, 廻想体 Latin)
export const BENCH_FONTS = { 'House Sumikaku': 'derived/kokka-mincho-tall-72.ttf', 'House Kaiso': 'kaiso-next-up.ttf', 'House Kinkaku': 'derived/kokka-mincho-tall-72.ttf', 'House Kikai': 'kaiso-next-up.ttf', 'House Kokka': 'kokka-mincho.ttf' };

export async function kitBench(cfg, { out, only = null, project = 'paperclip-138-full', style = null } = {}) {
  const ST = style ? (JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'styles.json'), 'utf8')).styles || {})[style] : null; if (style && !ST) throw new Error(`no style ${style} in routing/styles.json`);
  const T = path.join(cfg.dataDir, 'style-lab/engine/templates'), FD = path.join(cfg.dataDir, 'fonts/house'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kitbench-'));
  // six pictures of a project's materials (the film's, else the reference chapter's: a film with none left every
  // picture case blank and nothing said so)
  const picsOf = (p) => { const d = path.join(cfg.dataDir, 'projects', p, 'materials/clips'); return (fs.existsSync(d) ? fs.readdirSync(d) : []).filter((f) => /\.(jpe?g|png)$/i.test(f) && !/-(tall|window)\.png$/.test(f)).slice(0, 6).map((f) => path.join(d, f)); };
  const pics = picsOf(project).length >= 6 ? picsOf(project) : picsOf('paperclip-138-full');
  pics.forEach((f, i) => fs.copyFileSync(f, path.join(tmp, `i${i}${path.extname(f).toLowerCase()}`)));
  const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#111"><canvas id=s></canvas><script type=module>
import { cases } from '/t/kit4.bench.js'; import { setStyle, COL } from '/t/kit2.js';
const ST = ${JSON.stringify(ST)}; if (ST) setStyle(ST.tokens);
await Promise.all(Object.entries(${JSON.stringify(BENCH_FONTS)}).map(async ([f, file]) => document.fonts.add(await new FontFace(f, 'url(/f/' + file + ')').load())));
const ims = await Promise.all(${JSON.stringify(pics.map((f, i) => `i${i}${path.extname(f).toLowerCase()}`))}.map((f) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = '/i/' + f; })));
const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const g = c.getContext('2d'), all = cases(g, ims), ONLY = ${JSON.stringify(only)};
const list = ONLY ? all.filter((x) => x[0] === ONLY) : all, cols = ONLY ? 2 : 4, w = ONLY ? 1920 : 480, h = ONLY ? 1080 : 270;
const S0 = document.getElementById('s'); S0.width = cols * w; S0.height = Math.ceil(list.length * 2 / cols) * h; const S = S0.getContext('2d');
list.forEach(([name, t1, t2, draw], i) => [t1, t2].forEach((t, j) => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = COL.paper; g.fillRect(0, 0, 1920, 1080); try { g.save(); draw(t); } catch (e) { console.error(name + ' t=' + t + ': ' + e.message); } finally { g.restore(); }
  const x = ((i * 2 + j) % cols) * w, y = Math.floor((i * 2 + j) / cols) * h; S.drawImage(c, x, y, w, h); S.fillStyle = '#e8452c'; S.font = '20px sans-serif'; S.fillText(name + ' t=' + t, x + 8, y + 22); S.strokeStyle = '#444'; S.strokeRect(x, y, w, h); }));
if (!ims.length || !ims.every(Boolean)) console.error('the bench pictures did not all load'); window.size = [S0.width, S0.height]; window.done = true;
</script>`;
  // (pictures are served as image/jpeg: with no type the bench's pictures never drew, every case showing one was blank)
  const b = await chromium.launch(), errors = [];
  try { const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await p.route('http://bench/**', (r) => { const u = decodeURIComponent(new URL(r.request().url()).pathname);
      if (u === '/') return r.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
      const file = u.startsWith('/t/') ? path.join(T, u.slice(3)) : u.startsWith('/f/') ? path.join(FD, u.slice(3)) : path.join(tmp, u.slice(3));
      if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
      r.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'text/javascript; charset=utf-8' : /\.jpe?g$/.test(file) ? 'image/jpeg' : file.endsWith('.png') ? 'image/png' : undefined }); });
    await p.goto('http://bench/'); await p.waitForFunction(() => window.done, null, { timeout: 30000 }).catch((e) => { throw new Error(`the bench page did not finish: ${errors.join(' | ') || e.message}`); });
    const [W, H] = await p.evaluate(() => window.size); await p.setViewportSize({ width: W, height: H });
    await p.locator('#s').screenshot({ path: out });
  } finally { await b.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  return { out, errors };
}
