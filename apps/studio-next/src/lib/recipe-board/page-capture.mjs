// Archive a real web page (news report, official page, paper abstract) after the user confirmed it on
// /recipe-board/materials: one browser, a 1920×1080 screenshot of the top of the page, a full-page
// screenshot (for a push-in to the line that matters), the page text, the final URL and the capture time.
// The text is what the facts step may trace numbers to (AGENTS.md: numbers trace to the source text or
// an archived source). Nothing here runs before the confirmation.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PAGE_ARCHIVE_CONTRACT = 'A1RecipeBoardPageArchive/v1';
const shaFile = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// Common cookie / consent overlays; hidden, never clicked (no consent is given on the user's behalf).
const OVERLAYS = ['[id*="cookie" i]', '[class*="cookie" i]', '[id*="consent" i]', '[class*="consent" i]', '[class*="gdpr" i]', '[aria-modal="true"]'];

// A PDF (a paper, a system card) is read the same way: pdf.js draws its first pages into a local page with a
// text layer over them, so the page text, the places of the terms and the sentence work as on a web page.
export const isPdfUrl = (url) => /\.pdf($|[?#])/i.test(String(url)) || /arxiv\.org\/pdf\//i.test(String(url));
// a directory, not a module: kept in a variable so the web server's bundler does not try to resolve it
const PDFJS_DIR = '../../../../../node_modules/pdfjs-dist/build/';
const PDFJS = new URL(PDFJS_DIR, import.meta.url);
const PDF_PAGES = 6;
function fetchPdf(url, file) {
  if (url.startsWith('file://')) { fs.copyFileSync(new URL(url), file); return; }
  const r = spawnSync('curl', ['-sSL', '--fail', '--max-time', '120', '-A', 'Mozilla/5.0 A1RecipeBoard/1.0 (research)', '-o', file, url]);
  if (r.status !== 0 || !fs.existsSync(file) || fs.readFileSync(file).subarray(0, 4).toString() !== '%PDF') throw new Error(`pdf download failed: ${String(r.stderr).slice(0, 200)}`);
}
function pdfViewer(dir, pdfFile) {
  const html = path.join(dir, 'pdf-view.html');
  fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#e9e9e7}#pages{width:1240px;margin:40px auto}.pg{position:relative;margin:0 auto 36px;box-shadow:0 4px 24px rgba(0,0,0,.18);background:#fff}
.pg canvas{display:block}.textLayer{position:absolute;inset:0;overflow:hidden;line-height:1;transform-origin:0 0}.textLayer span,.textLayer br{color:transparent;position:absolute;white-space:pre;transform-origin:0% 0%}</style>
<script type="module">
import * as pdfjs from '${new URL('pdf.mjs', PDFJS).href}';
pdfjs.GlobalWorkerOptions.workerSrc = '${new URL('pdf.worker.mjs', PDFJS).href}';
const doc = await pdfjs.getDocument({ url: '${pathToFileURL(pdfFile).href}' }).promise;
document.title = (await doc.getMetadata().catch(() => ({})))?.info?.Title || '';
for (let n = 1; n <= Math.min(doc.numPages, ${PDF_PAGES}); n++) {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1240 / page.getViewport({ scale: 1 }).width });
  const box = document.createElement('div'); box.className = 'pg'; box.style.width = vp.width + 'px'; box.style.height = vp.height + 'px';
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; box.append(c);
  const tl = document.createElement('div'); tl.className = 'textLayer'; tl.style.setProperty('--scale-factor', vp.scale); tl.style.setProperty('--total-scale-factor', vp.scale); box.append(tl);
  document.getElementById('pages').append(box);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  await new pdfjs.TextLayer({ textContentSource: await page.getTextContent(), container: tl, viewport: vp }).render();
}
document.body.dataset.pdfReady = '1';
</script></head><body><div id="pages"></div></body></html>`);
  return html;
}

// Chinese amounts as an English page writes them: 6000亿 -> 600 billion / 600bn, 1万亿 -> 1 trillion,
// 1万 -> 10,000 / 10000, 17% stays. Used to find the sentence on an English page.
export function englishNumbers(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/(\d+(?:\.\d+)?)\s*(万亿|亿|万)?/g)) {
    const v = +m[1], u = m[2];
    if (u === '万亿') { out.add(`${v} trillion`); out.add(`${v}tn`); }
    else if (u === '亿') { const b = v / 10; out.add(`${+b.toFixed(2)} billion`); out.add(`${+b.toFixed(2)}bn`); out.add(`${+b.toFixed(2)}b`); }
    else if (u === '万') { const n = v * 10000; out.add(n.toLocaleString('en-US')); out.add(String(n)); if (n >= 1000) out.add(`${n / 1000}k`); }
    else if (v >= 1) out.add(String(m[1]));
  }
  return [...out];
}
// A page the site did not really serve: a bot check (Cloudflare "Just a moment" / 请稍候 / 安全验证), an
// access-denied or error page, or a paywall stub with almost no text. Archived as material it would put
// the bot check on screen; the capture fails instead.
const BLOCKED_RE = /just a moment|请稍候|安全验证|verify you are (a )?human|checking your browser|cloudflare|access denied|captcha|enable javascript and cookies|technical difficulties|subscribe to (continue|read)/i;
// a social post (a tweet, its embed, a Weibo post): rendered by script after the page loads, short, and its account
// header is the evidence (the official DeepSeek-R1 tweet came out blank, then as a paywall stub, recap-S5)
export const POST_RE = /(platform\.twitter\.com\/embed|(twitter|x)\.com\/[^/]+\/status\/|weibo\.com\/\d+\/)/i;
export function isBlockedPage(rec) {
  let text = '';
  try { text = fs.readFileSync(rec.files.text, 'utf8'); } catch {}
  if (BLOCKED_RE.test(`${rec.title || ''}\n${text.slice(0, 1500)}`)) return true;
  // (a post is short by nature: the official DeepSeek-R1 tweet, 255 characters, was taken for a paywall stub, recap-S5)
  const post = POST_RE.test(rec.url || '');
  return rec.kind !== 'pdf' && text.replace(/\s+/g, '').length < (post ? 80 : 600);
}
export function copyChecked(from, to, tries = 3) {
  const want = shaFile(from);
  for (let i = 0; i < tries; i++) {
    fs.copyFileSync(from, to);
    if (fs.statSync(to).size === fs.statSync(from).size && shaFile(to) === want) return;
  }
  throw new Error(`copy to the library came back different: ${to}`);
}
export const CAPTURE_VERSION = 4;   // 2: site branding hidden before the screenshot; 3: removed, not left as a blank band; 4: lazy pictures loaded, broken ones hidden
const BRANDING = ['header', 'nav', 'footer', 'aside', '[role="banner"]', '[role="navigation"]', '[role="contentinfo"]', '[role="complementary"]',
  '[class*="logo" i]', '[id*="logo" i]', 'img[alt*="logo" i]', 'img[src*="logo" i]', 'svg[aria-label*="logo" i]', '[class*="masthead" i]', '[class*="site-header" i]', '[class*="share" i]', '[class*="social" i]', '[class*="newsletter" i]', '[class*="subscribe" i]'];
export async function capturePage(url, dir, { highlight = [], line = '', lineEn = '' } = {}) {
  const { chromium } = await import('playwright');
  fs.mkdirSync(dir, { recursive: true });
  const pdf = isPdfUrl(url);
  const browser = await chromium.launch(pdf ? { args: ['--allow-file-access-from-files'] } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'zh-CN' });
    let response;
    if (pdf) {
      const pdfFile = path.join(dir, 'source.pdf');
      fetchPdf(url, pdfFile);
      await page.goto(pathToFileURL(pdfViewer(dir, pdfFile)).href);
      await page.waitForFunction(() => document.body.dataset.pdfReady === '1', null, { timeout: 90000 });
    } else {
      // sites drop the first connection now and then: one more try after a pause
      try { response = await page.goto(url, { waitUntil: POST_RE.test(url) ? 'networkidle' : 'domcontentloaded', timeout: 60000 }); }
      catch (e) { if (!/net::ERR_|Timeout/.test(String(e.message))) throw e; await page.waitForTimeout(5000); response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
    }
    await page.waitForTimeout(POST_RE.test(url) ? 6000 : 2500);
    // (a post's avatar and pictures loaded, not grey placeholders)
    if (POST_RE.test(url)) await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20000 }).catch(() => {});
    await page.addStyleTag({ content: `${OVERLAYS.join(',')}{display:none!important}` }).catch(() => {});
    // the site's own branding never reaches the picture (user decision 2026-10-17): header, logo,
    // navigation, sidebars, footer and share bars are hidden before the screenshot
    // (only small pieces: a class like "newsletter-post" or "logo-wrap" may wrap the whole article, so an
    // element with much text, several paragraphs or a large share of the page stays)
    if (!pdf && !POST_RE.test(url)) await page.evaluate((sel) => {
      const H = Math.max(document.body.scrollHeight, 1);
      for (const e of document.querySelectorAll(sel.join(','))) {
        const r = e.getBoundingClientRect();
        if ((e.innerText || '').length > 600 || e.querySelectorAll('p').length > 2 || r.height > H * 0.3 || e.querySelector('article, h1')) continue;
        e.style.setProperty('display', 'none', 'important');   // gone, not an empty band at the top
      }
    }, BRANDING).catch(() => {});
    // lazy pictures load as the page scrolls past them; one that still has no picture is hidden, not shot as
    // a broken-image icon (hupo B61 read a release page with two of them)
    if (!pdf) {
      await page.evaluate(async () => {
        const H = document.body.scrollHeight;
        for (let y = 0; y < H; y += 900) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
        window.scrollTo(0, 0);
      }).catch(() => {});
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        for (const img of document.querySelectorAll('img')) if (!img.complete || img.naturalWidth === 0) img.style.setProperty('display', 'none', 'important');
      }).catch(() => {});
    }
    const top = path.join(dir, 'page.png');
    const full = path.join(dir, 'page-full.png');
    // screenshots are taken locally and copied to the library checked byte for byte: written straight onto
    // the NAS they were read back cut short (an invalid PNG, so a "blank" page)
    const local = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-capture-'));
    await page.screenshot({ path: path.join(local, 'page.png'), timeout: 90000 });
    await page.screenshot({ path: path.join(local, 'page-full.png'), fullPage: true, timeout: 90000 }).catch(() => fs.copyFileSync(path.join(local, 'page.png'), path.join(local, 'page-full.png')));
    copyChecked(path.join(local, 'page.png'), top);
    copyChecked(path.join(local, 'page-full.png'), full);
    const info = await page.evaluate(({ terms, line, lineEn }) => {
      const text = document.body?.innerText || '';
      // where each term appears (every visible place, with the element it sits in), normalised to the
      // full page, so a crop or a camera can go to the right one (a sentence in the article, not the menu)
      const marks = {}, places = {};
      const H = document.documentElement.scrollHeight, W = document.documentElement.scrollWidth;
      for (const t of terms) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        places[t] = [];
        for (let n = walker.nextNode(); n && places[t].length < 12; n = walker.nextNode()) {
          let i = n.textContent.indexOf(t);
          while (i >= 0 && places[t].length < 12) {
            const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + t.length);
            const b = r.getBoundingClientRect();
            if (b.width > 0 && b.height > 0) {
              const el = n.parentElement;
              // the sentence around the term (inside this text node): its line boxes, for a highlight
              const txt = n.textContent;
              let a = i; while (a > 0 && !/[。！？!?\n]/.test(txt[a - 1])) a--;
              let z = i + t.length; while (z < txt.length && !/[。！？!?\n]/.test(txt[z])) z++;
              if (z < txt.length) z++;
              const sr = document.createRange(); sr.setStart(n, a); sr.setEnd(n, z);
              const line = [...sr.getClientRects()].filter((q) => q.width > 2).map((q) => [(q.left + scrollX) / W, (q.top + scrollY) / H, q.width / W, q.height / H]);
              places[t].push({ box: [(b.left + scrollX) / W, (b.top + scrollY) / H, b.width / W, b.height / H], line, sentence: txt.slice(a, z).trim().slice(0, 200), tag: el.closest('h1,h2,h3') ? 'heading' : el.closest('p,article,li') ? 'body' : 'other', size: parseFloat(getComputedStyle(el).fontSize) || 0 });
            }
            i = n.textContent.indexOf(t, i + t.length);
          }
        }
        if (places[t].length) marks[t] = places[t][0].box;
      }
      // the sentence on the page that reads most like the narration line (shared character pairs)
      if (line || lineEn) {
        const pairs = (x) => { const o = new Set(); for (let i = 0; i < x.length - 1; i++) o.add(x.slice(i, i + 2)); return o; };
        const want = pairs(line.replace(/\s/g, ''));
        // an English page: the sentence with most of the English query's words and the line's amounts
        const enWords = lineEn ? lineEn.toLowerCase().split(/[^a-z0-9$.,]+/).filter((w) => w.length >= 3 || /\d/.test(w)) : [];
        const enScore = (sent) => { if (!enWords.length) return 0; const t = sent.toLowerCase(); let hit = 0; for (const w of enWords) if (t.includes(w)) hit += /\d/.test(w) ? 3 : 1; return hit / Math.max(4, enWords.length); };
        let best = null;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || el.closest('script,style,nav,header,footer,aside')) continue;
          const txt = n.textContent;
          for (const m of txt.matchAll(/[^。！？!?\n]+?(?:[。！？!?]|\.(?=\s|$)|$)/g)) {
            const sent = m[0].trim();
            if (sent.length < 8) continue;
            const have = pairs(sent);
            let hit = 0; want.forEach((p) => have.has(p) && hit++);
            const score = Math.max(line ? hit / Math.max(8, want.size) : 0, enScore(sent));
            if (!best || score > best.score) best = { score, n, a: m.index, z: m.index + m[0].length, sent, el };
          }
        }
        if (best && best.score > 0.15) {
          const sr = document.createRange(); sr.setStart(best.n, best.a); sr.setEnd(best.n, best.z);
          const rects = [...sr.getClientRects()].filter((q) => q.width > 2);
          if (rects.length) {
            const line0 = rects.map((q) => [(q.left + scrollX) / W, (q.top + scrollY) / H, q.width / W, q.height / H]);
            places.__line = [{ box: line0[0], line: line0, sentence: best.sent.slice(0, 200), score: +best.score.toFixed(3), tag: best.el.closest('h1,h2,h3') ? 'heading' : best.el.closest('p,article,li') ? 'body' : 'other' }];
          }
        }
      }
      return { title: document.title, text, marks, places, height: H };
    }, { terms: highlight, line, lineEn });
    const textFile = path.join(dir, 'page.txt');
    fs.writeFileSync(textFile, info.text);
    const record = {
      contract: PAGE_ARCHIVE_CONTRACT, captureVersion: CAPTURE_VERSION, url, finalUrl: pdf ? url : page.url(), status: pdf ? 200 : response?.status() ?? null, title: info.title, ...(pdf ? { kind: 'pdf', pdf: path.join(dir, 'source.pdf') } : {}),
      capturedAt: new Date().toISOString(), viewport: [1920, 1080], pageHeight: info.height, marks: info.marks, places: info.places,
      files: { screenshot: top, fullPage: full, text: textFile },
      sha256: { screenshot: shaFile(top), fullPage: shaFile(full), text: shaFile(textFile) },
    };
    fs.writeFileSync(path.join(dir, 'archive.json'), JSON.stringify(record, null, 2) + '\n');
    return record;
  } finally {
    await browser.close();
  }
}

// A 16:9 reading crop of the full page around the line that matters (a number first, then a name), for the
// still; the full page stays for a camera push-in. Returns the crop path.
// rows: the window's height in page pixels (an article read down its column takes three screens of it: one screen
// left the page two lines long, and pushed to its body the frame's lower half stood empty, h800-S2)
export function readingCrop(rec, { prefer = [], out = null, rows = 720 } = {}) {
  const full = rec.files.fullPage;
  const H = rec.pageHeight || 1080;
  const keys = Object.keys(rec.marks || {});
  const pick = [...prefer.filter((k) => rec.marks?.[k]), ...keys.filter((k) => /\d/.test(k)), ...keys][0];
  // a 1280×720 window (the article column, not the ads and sidebars around it) scaled to 1920×1080:
  // the line sits a little above the middle, its headline above it
  const W = 1280, Hc = rows;
  // prefer the place inside the article text, then a heading, then the first place found
  const pl = (rec.places?.[pick] || []);
  const best = pl.find((x) => x.tag === 'body') || pl.find((x) => x.tag === 'heading') || null;
  const [mx, my, mw] = best ? best.box : pick ? rec.marks[pick] : [0.5, 0, 0];
  const cx = (mx + mw / 2) * 1920, cy = my * H;
  const left = Math.max(0, Math.min(1920 - W, Math.round(cx - W / 2)));
  const top = Math.max(0, Math.min(Math.max(0, H - Hc), Math.round(cy - Hc * 0.4)));
  const file = out || path.join(path.dirname(full), 'page-read.png');
  const r = spawnSync(process.env.A1_FFMPEG || 'ffmpeg', ['-loglevel', 'error', '-y', '-i', full, '-vf', `crop=${W}:'min(ih,${Hc})':${left}:${top},pad=${W}:${Hc}:0:0:white,scale=1920:${Math.round(Hc * 1.5)}:flags=lanczos`, file]);
  if (r.status !== 0) throw new Error(`reading crop failed: ${String(r.stderr).slice(0, 200)}`);
  return { file, at: pick || null, top, place: best?.tag || null };
}

// Reading a news page (读报), cut as a design: only the text column around the sentence, a 16:9 piece of
// it scaled to the frame, so the site's header, logo, navigation, sidebars and QR codes stay outside
// (user decision 2026-10-17: no site names or addresses on screen). The camera pushes in a little and the
// sentence is printed in reverse. Returns the window image and, in its own 0–1 coordinates, the push
// centre and the highlight boxes. Version 2; version 1 was a full-width screen of the page.
export const READ_WINDOW_VERSION = 7;
// The text block the sentence sits in, measured on the page's pixels: from the sentence's own lines, out to
// both sides while ink continues (gaps under ~24 px are word spacing; a wider one is a gutter to a sidebar). Version 2 cut the
// window at the sentence's own line width, so a short sentence cut the paragraph and the headline at the
// sides (critique 2026-10-20: "标题和正文右侧均被画面边缘截断"). Returns [left, right] in px, or null.
export function inkColumn(full, top, bandH, x0, x1) {
  const S = 4, w = 1920 / S, h = Math.max(1, Math.round(bandH / S));
  const r = spawnSync(process.env.A1_FFMPEG || 'ffmpeg', ['-loglevel', 'error', '-i', full, '-vf', `crop=1920:'min(ih-${top},${bandH})':0:${top},format=gray,scale=${w}:${h}:flags=area,pad=${w}:${h}:0:0:white`, '-f', 'rawvideo', '-'], { maxBuffer: 64 << 20 });
  if (r.status !== 0 || !r.stdout?.length) return null;
  const px = r.stdout, rows = Math.floor(px.length / w);
  // the paper: the commonest grey in the band
  const hist = new Array(256).fill(0);
  for (const v of px) hist[v]++;
  const paper = hist.indexOf(Math.max(...hist));
  const count = Array.from({ length: w }, (_, x) => { let n = 0; for (let y = 0; y < rows; y++) if (Math.abs(px[y * w + x] - paper) > 48) n++; return n; });
  const ink = count.map((n) => n >= 2);
  // a solid block (a dark sidebar, a photo edge) is a wall, not more text
  const wall = count.map((n) => n > rows * 0.7);
  let L = Math.max(0, Math.floor(x0 / S)), R = Math.min(w - 1, Math.ceil(x1 / S) - 1);
  const GAP = 6;
  for (let gap = 0, x = L - 1; x >= 0 && gap < GAP && !wall[x]; x--) { if (ink[x]) { L = x; gap = 0; } else gap++; }
  for (let gap = 0, x = R + 1; x < w && gap < GAP && !wall[x]; x++) { if (ink[x]) { R = x; gap = 0; } else gap++; }
  // the clear paper on each side before the next ink (the window's margin may use it, not more)
  let fl = 0, fr = 0;
  for (let x = L - 1; x >= 0 && !ink[x]; x--) fl++;
  for (let x = R + 1; x < w && !ink[x]; x++) fr++;
  return [L * S, (R + 1) * S, fl * S, fr * S];
}
export function readingWindow(rec, { prefer = [], out = null, scale = 1.15 } = {}) {
  const full = rec.files.fullPage;
  const H = rec.pageHeight || 1080;
  const keys = Object.keys(rec.places || {});
  // the sentence that reads like the narration first, then a number, then any term
  const pick = [...prefer.filter((k) => rec.places?.[k]?.length), ...(rec.places?.__line?.length ? ['__line'] : []), ...keys.filter((k) => /\d/.test(k) && rec.places[k].length), ...keys.filter((k) => rec.places[k].length)][0];
  const pl = pick ? rec.places[pick] : [];
  const best = pl.find((x) => x.tag === 'body' && x.line?.length) || pl.find((x) => x.line?.length) || pl[0] || null;
  const lines = best?.line?.length ? best.line : best ? [best.box] : [];
  // the column: the sentence's lines left to right, a margin each side, at least 38% of the page width
  const x0 = lines.length ? Math.min(...lines.map((l) => l[0])) : 0.25, x1 = lines.length ? Math.max(...lines.map((l) => l[0] + l[2])) : 0.75;
  const midY = lines.length ? (Math.min(...lines.map((l) => l[1])) + Math.max(...lines.map((l) => l[1] + l[3]))) / 2 * H : 540;
  // the whole text block the sentence sits in (its pixels), not only the sentence's own lines
  const band = Math.round(Math.max(1920 * 0.38, (x1 - x0) * 1920) * 9 / 16);
  const col = lines.length ? inkColumn(full, Math.max(0, Math.round(midY - band * 0.45)), band, x0 * 1920, x1 * 1920) : null;
  const cx0 = col ? Math.min(col[0], x0 * 1920) : x0 * 1920, cx1 = col ? Math.max(col[1], x1 * 1920) : x1 * 1920;
  // a margin each side, but only the clear paper there (a wider margin showed a sliver of the sidebar)
  const margin = col ? Math.min(0.025 * 1920, col[2], col[3]) : 0.025 * 1920;
  let cw = Math.max(0.38 * 1920, cx1 - cx0 + 2 * margin);
  cw = Math.min(1920, Math.round(cw));
  const ch = Math.round(cw * 9 / 16);
  const cx = (cx0 + cx1) / 2;
  // widened to the minimum, the window grows into the clear paper beside the column, not over the next one
  const lo = col ? cx0 - col[2] : 0, hi = col ? cx1 + col[3] : 1920;
  const left = Math.max(0, Math.min(1920 - cw, Math.max(lo, Math.min(hi - cw, Math.round(cx - cw / 2)))));
  // the sentence a little above the middle: the lines before it lead in, and the header stays out
  const top = Math.max(0, Math.min(Math.max(0, H - ch), Math.round(midY - ch * 0.45)));
  const file = out || path.join(path.dirname(full), 'page-window.png');
  const r = spawnSync(process.env.A1_FFMPEG || 'ffmpeg', ['-loglevel', 'error', '-y', '-i', full, '-vf', `crop=${cw}:'min(ih-${top},${ch})':${left}:${top},pad=${cw}:${ch}:0:0:white,scale=1920:1080:flags=lanczos`, file]);
  if (r.status !== 0) throw new Error(`reading window failed: ${String(r.stderr).slice(0, 200)}`);
  // page coordinates -> window coordinates
  // the page's paper colour at the bottom of the window (the frame fades the page into it under the subtitle)
  const pr = spawnSync(process.env.A1_FFMPEG || 'ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', 'crop=iw:ih*0.12:0:ih*0.88,scale=64:4:flags=area,format=rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  let paper = null;
  if (pr.status === 0 && pr.stdout?.length >= 3) {
    const seen = new Map();
    for (let i = 0; i + 2 < pr.stdout.length; i += 3) { const k = [0, 1, 2].map((j) => pr.stdout[i + j] >> 3 << 3).join(','); seen.set(k, (seen.get(k) || 0) + 1); }
    paper = [...seen].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  }
  const toWin = ([x, y, w, h]) => [(x * 1920 - left) / cw, (y * H - top) / ch, (w * 1920) / cw, (h * H) / ch];
  const boxes = lines.map(toWin).map(([x, y, w, h]) => [+(x - 0.006).toFixed(4), +(y - h * 0.08).toFixed(4), +(w + 0.012).toFixed(4), +(h * 1.16).toFixed(4)]);
  const bx = boxes.length ? (Math.min(...boxes.map((b) => b[0])) + Math.max(...boxes.map((b) => b[0] + b[2]))) / 2 : 0.5;
  const by = boxes.length ? (Math.min(...boxes.map((b) => b[1])) + Math.max(...boxes.map((b) => b[1] + b[3]))) / 2 : 0.5;
  const half = 0.5 / scale;
  const at = [+Math.min(1 - half, Math.max(half, bx)).toFixed(4), +Math.min(1 - half, Math.max(half, by)).toFixed(4)];
  return { file, at, scale, boxes, term: pick || null, sentence: best?.sentence || null, top, left, width: cw, paper, version: READ_WINDOW_VERSION };
}
