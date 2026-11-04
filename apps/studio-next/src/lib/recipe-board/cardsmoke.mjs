// A card's page opened once in a browser after it is built, before its white model is rendered (2026-10-26: three faults of
// the card path lived for rounds because the tests read the sources, never a built page: the lettering's CSS nested in a
// scene matched nothing, the letter-list swap ran in the head before the body, and the white model's cards were built
// from shots read before their recalls were refreshed). What it finds holds the card's final render like a geometry fault.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// the recall stills a shot names (slots.background with recall, its own and its scenes'), by file name
export function recallAssets(shot) {
  const bgs = [shot.slots?.background, ...(shot.scenes || []).map((s) => s.slots?.background)].filter((b) => b?.recall && b.asset);
  return [...new Set(bgs.map((b) => path.basename(b.asset)))];
}
// a recall the shot names that its built page does not carry: the page was built from an older shot
export function staleRecalls(shot, html) {
  return recallAssets(shot).filter((f) => !html.includes(f)).map((f) => `the page shows an older recall than the shot's ${f}: rebuild it from the shot as it is`);
}

export async function cardSmoke(dir, shot, { lettered = false } = {}) {
  const file = path.join(dir, 'index.html'); if (!fs.existsSync(file)) return [];
  const out = staleRecalls(shot, fs.readFileSync(file, 'utf8'));
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  try {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }), errs = [];
    p.on('pageerror', (e) => errs.push(String(e.message || e).split('\n')[0]));
    await p.addInitScript(() => { window.__timelines = window.__timelines || {}; });   // as the renderer provides it
    await p.goto('file://' + file); await p.waitForTimeout(800);
    out.push(...errs.map((e) => `the page throws: ${e}`));
    if (lettered) {
      const got = await p.evaluate(() => {
        const shown = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) if (getComputedStyle(e).display === 'none') return false; return true; };
        const cursors = [...document.querySelectorAll('span')].filter((s) => s.textContent === '|' && shown(s)).length;
        // by each slot's whole text: a title typed in is split a glyph a span, no one text node holds A、T
        const lists = [...document.querySelectorAll('[data-slot]')].map((e) => e.textContent.replace(/\|/g, '').trim()).filter((x) => /[A-Za-z0-9][、，][A-Za-z0-9]/.test(x)).map((x) => x.slice(0, 20));
        // words on a red plate (the user 2026-10-26: 不要红底的文字): an element with words whose own background, or its
        // ::before's, is a saturated red
        const red = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return false; const [r, g, b, a = 1] = m[1].split(',').map(Number); return a > 0.3 && r > 150 && g < 100 && b < 100; };
        const painted = (e) => [...e.querySelectorAll('*')].some((c) => shown(c) && getComputedStyle(c).backgroundImage !== 'none' && !c.textContent.trim());   // a painted plate laid under the words (a chip's .lab)
        const plates = [...document.querySelectorAll('body *')].filter((e) => shown(e) && e.textContent.trim() && e.children.length <= 3 && (red(getComputedStyle(e).backgroundColor) || (getComputedStyle(e, '::before').display !== 'none' && getComputedStyle(e, '::before').content !== 'none' && red(getComputedStyle(e, '::before').backgroundColor)) || (e.matches('.chip,.plate,[data-plate]') && painted(e)))).map((e) => e.textContent.trim().slice(0, 16));
        // words dressed up (the user 2026-10-26: 不要加字描边阴影 下面或者侧面的红线): a shadow or an outline on words, or a red
        // rule drawn as the border under or beside an element of words
        const redLine = (st, side) => parseFloat(st[`border${side}Width`]) >= 1 && st[`border${side}Style`] !== 'none' && red(st[`border${side}Color`]);
        const dressed = [...document.querySelectorAll('body *')].filter((e) => shown(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).filter((e) => { const st = getComputedStyle(e);
          return (st.textShadow && st.textShadow !== 'none') || parseFloat(st.webkitTextStrokeWidth) > 0 || ['Bottom', 'Left', 'Right'].some((s) => redLine(st, s)); }).map((e) => e.textContent.trim().slice(0, 16));
        return { cursors, lists, plates, dressed };
      });
      if (got.cursors) out.push(`${got.cursors} typing cursor(s) shown on a lettered page (the lettering says none)`);
      for (const l of got.lists) out.push(`a letter list keeps its CJK comma on a lettered page: "${l}"`);
      for (const l of [...new Set(got.dressed)]) out.push(`words dressed up on a lettered page: "${l}" (no outline, shadow or red rule under or beside words: the user 2026-10-26)`);
      for (const l of [...new Set(got.plates)]) out.push(`words on a plate on a lettered page: "${l}" (no plate under the words: the user 2026-10-26)`);
    }
  } finally { await b.close(); }
  return out;
}
