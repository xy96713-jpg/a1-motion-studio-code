// Screen capture with telemetry (CLI only, one browser): opens a real page, scrolls, takes one
// screenshot and records the DOM rectangles of the named targets in the same viewport, normalised to
// the screenshot. The camera compilers in screen.mjs only ever aim at these rectangles.
//
//   screen.capture: {
//     url, viewport: [1920, 1080], dpr: 2,
//     scrollTo: { text } | { selector } | { y },     // optional; target ends up `scrollTop` px from the top
//     scrollTop: 120,
//     hide: ['css selector', ...],                  // cookie bars, sticky headers
//     targets: { name: { text } | { selector } }   // text: exact substring, measured with a DOM Range
//   }
// Writes projects/<id>/materials/screen/<shot>/screen.png + telemetry.json (A1RecipeBoardScreenTelemetry/v1).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { projectPaths } from './store.mjs';
import { SCREEN_TELEMETRY_CONTRACT } from './screen.mjs';

// Runs in the page: rectangle of an exact text match (first occurrence) or of a selector.
function measure({ text, selector }) {
  if (selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, kind: 'DOM_ELEMENT' };
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const i = node.textContent.indexOf(text);
    if (i < 0 || !node.parentElement?.offsetParent) continue;
    const range = document.createRange();
    range.setStart(node, i);
    range.setEnd(node, i + text.length);
    const r = range.getBoundingClientRect();
    if (!r.width) continue;
    return { left: r.left, top: r.top, width: r.width, height: r.height, kind: 'DOM_TEXT_RANGE', lines: range.getClientRects().length };
  }
  return null;
}

export async function captureScreen(cfg, id, shot) {
  const c = shot.screen?.capture;
  if (!c?.url) throw new Error(`${shot.shotId}: screen.capture.url is required`);
  const [vw, vh] = c.viewport || [1920, 1080];
  const dpr = c.dpr || 2;
  const dir = path.join(projectPaths(cfg, id).root, 'materials', 'screen', shot.shotId);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
    // Busy pages (analytics, video) never go network-idle: wait for the DOM, then briefly for quiet.
    await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    for (const sel of c.hide || []) await page.addStyleTag({ content: `${sel}{display:none!important}` });
    if (c.scrollTo) {
      const y = c.scrollTo.y ?? (await page.evaluate(measure, c.scrollTo))?.top;
      if (y == null) throw new Error(`${shot.shotId}: scrollTo target not found`);
      await page.evaluate((top) => window.scrollBy(0, top), c.scrollTo.y != null ? y : y - (c.scrollTop ?? 120));
      await page.waitForTimeout(400);
    }
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const targets = {};
    for (const [name, spec] of Object.entries(c.targets || {})) {
      const r = await page.evaluate(measure, spec);
      if (!r) throw new Error(`${shot.shotId}: screen target "${name}" not found on the page`);
      if (r.left < 0 || r.top < 0 || r.left + r.width > vw || r.top + r.height > vh) throw new Error(`${shot.shotId}: screen target "${name}" is outside the captured viewport`);
      targets[name] = { x: r.left / vw, y: r.top / vh, width: r.width / vw, height: r.height / vh, kind: r.kind, ...(spec.text ? { text: spec.text } : { selector: spec.selector }), ...(r.lines ? { lines: r.lines } : {}) };
    }
    const png = path.join(dir, 'screen.png');
    await page.screenshot({ path: png });
    const bytes = fs.readFileSync(png);
    const telemetry = {
      contract: SCREEN_TELEMETRY_CONTRACT,
      scope: 'RESEARCH_ONLY',
      shotId: shot.shotId,
      url: c.url,
      finalUrl: page.url(),
      capturedAt: new Date().toISOString(),
      viewport: { width: vw, height: vh, deviceScaleFactor: dpr },
      scroll,
      source: { width: vw * dpr, height: vh * dpr },
      image: { path: path.relative(cfg.repoRoot, png), sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length },
      signals: ['DOM_TARGET_RECTANGLES', 'SCROLL_OFFSET', 'VIEWPORT', 'PIXEL_DENSITY'],
      missingSignals: ['CURSOR_SAMPLES', 'CLICKS', 'CARET'],
      targets,
    };
    fs.writeFileSync(path.join(dir, 'telemetry.json'), JSON.stringify(telemetry, null, 1) + '\n');
    return { dir, telemetry };
  } finally {
    await browser.close();
  }
}
