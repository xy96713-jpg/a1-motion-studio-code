// Film-wide type check (DESIGN-method.md, 排版): over every rendered still of a project, the faces, the
// sizes and the positions of the largest line of each designed frame. A film reads as one design when
// these are few: at most 2 headline faces, 4 headline sizes (16 px bins), 4 left anchors (40 px bins, centred counts
// as one) and 4 tops (40 px bins). Presenter-only frames (no headline) are skipped.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { projectPaths } from './store.mjs';

export const TYPE_LIMITS = { faces: 2, sizes: 4, lefts: 4, tops: 4 };

export async function typeCheck(cfg, id) {
  const dir = projectPaths(cfg, id).html;
  const files = fs.readdirSync(dir).filter((f) => /^B\d+\.html$/.test(f)).sort();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const heads = [];
  try {
    for (const f of files) {
      await page.goto('file://' + path.join(dir, f), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.body.dataset.fitted === '1' && (!document.querySelector('[data-twlevel]') || document.body.dataset.twtype === '1'), null, { timeout: 10000 }).catch(() => {});
      const h = await page.evaluate(() => {
        let best = null;
        const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (tw.nextNode()) {
          const n = tw.currentNode;
          if (!n.textContent.trim() || n.parentElement.closest('.subtitle,.credit,.todo,script,style,.tw-win.dim,.tw-tick')) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          const r = rg.getBoundingClientRect();
          if (r.width < 4 || r.left < -10 || r.left > 1920 || r.top > 1080) continue;
          const cs = getComputedStyle(n.parentElement);
          const size = parseFloat(cs.fontSize) * (r.height / Math.max(1, n.parentElement.getBoundingClientRect().height) > 0 ? 1 : 1);
          const vis = r.height;   // drawn height includes any scale on the way
          if (!best || vis > best.h) best = { h: Math.round(vis), face: cs.fontFamily.split(',')[0].replace(/['"]/g, ''), x: Math.round(r.left), y: Math.round(r.top), cx: Math.round((r.left + r.right) / 2) };
        }
        return best;
      });
      if (h && h.h >= 40) heads.push({ shot: f.replace('.html', ''), ...h });
    }
  } finally { await browser.close(); }
  const set = (fn) => new Set(heads.map(fn));
  const faces = set((h) => h.face), sizes = set((h) => Math.round(h.h / 16)), lefts = set((h) => Math.round(h.x / 40)), tops = set((h) => Math.round(h.y / 40));
  const stats = { frames: heads.length, faces: faces.size, sizes: sizes.size, lefts: lefts.size, tops: tops.size, faceList: [...faces] };
  const issues = Object.entries(TYPE_LIMITS).filter(([k, v]) => stats[k] > v).map(([k, v]) => `${k} ${stats[k]} > ${v}`);
  return { stats, issues, heads };
}
