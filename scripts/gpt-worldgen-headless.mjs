#!/usr/bin/env node
// Headless ChatGPT world-sheet runner. Never opens a visible window.
// Requires a logged-in persistent profile (one manual login); selectors may need maintenance.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const prompt = opt('--prompt');
const out = opt('--out', 'work/recipe-board-v1/style-lab/world-sheets/gpt-sheet.png');
const profile = opt('--profile', process.env.CHATGPT_PROFILE || '.cache/chatgpt-profile');
const dry = args.includes('--dry-run');
if (!prompt && !dry) { console.error('usage: gpt-worldgen-headless.mjs --prompt "..." --out sheet.png [--profile dir] [--dry-run]'); process.exit(2); }
const browser = await chromium.launchPersistentContext(profile, {
  headless: true,
  viewport: { width: 1440, height: 1000 },
  args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
});
const page = await browser.newPage();
try {
  if (dry) {
    await page.goto('about:blank');
    console.log('HEADLESS OK: no window; profile=' + profile);
    await browser.close(); process.exit(0);
  }
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  const sel = ['#prompt-textarea', 'textarea[data-id="prompt-textarea"]', 'div[contenteditable="true"]'];
  let box = null;
  for (const x of sel) { const el = await page.$(x); if (el) { box = el; break; } }
  if (!box) throw new Error('prompt box not found; open persistent profile headful once and log in');
  await box.click(); await box.fill(prompt);
  await page.keyboard.press('Enter');
  // wait for an image result; ChatGPT image may take minutes
  await page.waitForFunction(() => [...document.querySelectorAll('img')].some((im) => im.src && im.src.startsWith('http') && im.naturalWidth > 500), null, { timeout: 300000 });
  const url = await page.evaluate(() => { const imgs = [...document.querySelectorAll('img')].filter((im) => im.src && im.src.startsWith('http') && im.naturalWidth > 500); return imgs[imgs.length - 1]?.src || null; });
  if (!url) throw new Error('no image URL found');
  const res = await page.request.get(url);
  if (!res.ok()) throw new Error('download failed ' + res.status());
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await res.body());
  console.log('WORLD SHEET OK -> ' + out);
} catch (e) {
  console.error('GPT WORLDGEN FAIL: ' + String(e.message || e));
  process.exitCode = 1;
} finally { await browser.close(); }
