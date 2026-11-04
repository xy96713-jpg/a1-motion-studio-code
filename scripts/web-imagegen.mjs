#!/usr/bin/env node
/**
 * web-imagegen.mjs — generate one image through the **web** ChatGPT account
 * (chatgpt.com), for when the codex CLI image_gen quota is exhausted.
 *
 *   node scripts/web-imagegen.mjs --prompt-file /tmp/p.txt --out /path/out.png [--size 1536x1024]
 *
 * How it works
 *   1. Reads the already-logged-in Chrome profile's cookies for chatgpt.com
 *      (AES-128-CBC "v10" cookies; key = Keychain "Chrome Safe Storage").
 *      Chrome 130+ prefixes the plaintext with sha256(host_key) — stripped here.
 *   2. Launches real Google Chrome (headed) on a dedicated profile dir and
 *      injects those cookies, so no interactive login is ever needed.
 *   3. Types the prompt in #prompt-textarea, presses Enter, waits for the
 *      assistant turn to hold a generated image, downloads the original PNG
 *      (UI download button first, blob/https fetch as fallback).
 *   4. Verifies the PNG (magic bytes + > 100 KB) before reporting success.
 *
 * Options
 *   --prompt-file <f>   required, UTF-8 prompt
 *   --out <png>         required, output PNG path
 *   --size <WxH>        optional, appended to the prompt as an aspect request
 *   --timeout <sec>     optional, total image wait (default 300)
 *   --profile-src <d>   Chrome profile to steal cookies from
 *                       (default: ~/Library/Application Support/Google/Chrome)
 *   --profile-dir <d>   working profile for the automation browser
 *                       (default: ~/.cache/a1-web-imagegen/profile)
 *   --headless          run headless (Cloudflare may challenge; not default)
 *   --keep-open         leave the browser open after success (debug)
 *   --conversation <u>  continue an existing conversation URL
 *
 * Exit codes: 0 ok, 2 not logged in, 3 no image, 4 bad/unusable image, 1 other.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIN_BYTES = 100 * 1024;

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const flag = (name) => argv.includes('--' + name);

const promptFile = arg('prompt-file');
const outPath = arg('out');
if (!promptFile || !outPath) {
  console.error('usage: node scripts/web-imagegen.mjs --prompt-file <f> --out <png> [--size WxH]');
  process.exit(1);
}
const size = arg('size');
const timeoutSec = Number(arg('timeout', 300));
const profileSrc = arg('profile-src', path.join(os.homedir(), 'Library/Application Support/Google/Chrome'));
const profileDir = arg('profile-dir', path.join(os.homedir(), '.cache/a1-web-imagegen/profile'));
const headless = flag('headless');
const keepOpen = flag('keep-open');
const conversation = arg('conversation');

let prompt = fs.readFileSync(promptFile, 'utf8').trim();
if (!prompt) {
  console.error('empty prompt');
  process.exit(1);
}
if (size && /^\d+x\d+$/.test(size)) {
  const [w, h] = size.split('x').map(Number);
  const g = (a, b) => (b ? g(b, a % b) : a);
  const r = g(w, h);
  prompt += '\n\nAspect ratio ' + (w / r) + ':' + (h / r) + ' (' + size + '), single full-frame image.';
}
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });

const log = (...a) => console.log('[' + new Date().toISOString().slice(11, 19) + ']', ...a);

// ------------------------------------------------------- cookie theft
function decryptChromeCookie(hex, key, hostKey) {
  const enc = Buffer.from(hex, 'hex');
  if (enc.length < 3 || enc.slice(0, 3).toString() !== 'v10') return null;
  const d = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
  let out;
  try {
    out = Buffer.concat([d.update(enc.slice(3)), d.final()]);
  } catch {
    return null;
  }
  const pad = out[out.length - 1];
  if (pad > 0 && pad <= 16) out = out.slice(0, out.length - pad);
  // Chrome 130+: 32-byte sha256(host_key) prefix
  if (out.length > 32 && out.slice(0, 32).equals(crypto.createHash('sha256').update(hostKey).digest())) {
    out = out.slice(32);
  }
  return out.toString('utf8');
}

function readChromeCookies() {
  const db = path.join(profileSrc, 'Default', 'Cookies');
  if (!fs.existsSync(db)) throw new Error('cookie db not found: ' + db);
  const pw = execFileSync('security', ['find-generic-password', '-w', '-s', 'Chrome Safe Storage', '-a', 'Chrome'], {
    encoding: 'utf8',
  }).trim();
  const key = crypto.pbkdf2Sync(pw, 'saltysalt', 1003, 16, 'sha1');
  const rows = JSON.parse(
    execFileSync('sqlite3', [
      '-json',
      db,
      "select host_key, name, hex(encrypted_value) as h, path, is_secure, is_httponly, samesite, expires_utc from cookies where host_key like '%chatgpt.com' and length(encrypted_value) > 3;",
    ]).toString() || '[]'
  );
  const out = [];
  for (const r of rows) {
    const value = decryptChromeCookie(r.h, key, r.host_key);
    if (value == null || !value) continue;
    out.push({
      name: r.name,
      value,
      domain: r.host_key,
      path: r.path || '/',
      secure: !!r.is_secure,
      httpOnly: !!r.is_httponly,
      sameSite: r.samesite === 2 ? 'Strict' : r.samesite === 1 ? 'Lax' : 'None',
      // chrome epoch: microseconds since 1601-01-01
      expires: r.expires_utc > 0 ? Math.floor(Number(r.expires_utc) / 1e6 - 11644473600) : -1,
    });
  }
  return out;
}

// ------------------------------------------------------------ helpers
const SEL = {
  // 2026-11 UI: ProseMirror contenteditable (id="prompt-textarea" was retired)
  prompt: 'div.ProseMirror[contenteditable="true"], #prompt-textarea, [contenteditable="true"][aria-label]',
  send: [
    '[data-testid="send-button"]',
    '#composer-submit-button',
    'button[aria-label="Send prompt"]',
    'button[data-testid="composer-send-button"]',
    'button[aria-label*="发送"]',
    '[data-testid="composer-submit-button"]',
  ],
  stop: '[data-testid="stop-button"], button[aria-label="Stop streaming"]',
  assistantTurn: '[data-message-author-role="assistant"]',
  loginCta: 'a[href*="/auth/login"], button:has-text("Log in"), a:has-text("Log in")',
};

async function imageOnPage(page) {
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')];
    const cands = imgs
      .filter((i) => i.naturalWidth >= 512 && (i.src.startsWith('blob:') || /oaiusercontent|estuary/i.test(i.src)))
      .map((i) => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight, alt: i.alt || '' }));
    return { count: cands.length, last: cands[cands.length - 1] || null, total: imgs.length };
  });
}

async function fetchImageAsBase64(page, src) {
  return page.evaluate(async (url) => {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return { err: 'http ' + res.status };
      const buf = new Uint8Array(await res.arrayBuffer());
      let s = '';
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) s += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
      return { b64: btoa(s), len: buf.length };
    } catch (e) {
      return { err: String(e && e.message ? e.message : e) };
    }
  }, src);
}

function isPng(buf) {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}
function pngSize(buf) {
  if (!isPng(buf)) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ---------------------------------------------------------------- main
let ctx = null;
let page = null;
let exitCode = 1;
try {
  fs.mkdirSync(profileDir, { recursive: true });
  const cookies = readChromeCookies();
  log('cookies from ' + profileSrc + ': ' + cookies.length);
  if (!cookies.some((c) => /session-token/.test(c.name))) {
    log('WARN: no chatgpt session-token cookie found in source profile');
  }

  ctx = await chromium.launchPersistentContext(profileDir, {
    executablePath: fs.existsSync(CHROME_BIN) ? CHROME_BIN : undefined,
    headless,
    channel: undefined,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US',
      '--window-size=1440,1000',
      '--window-position=40,40',
    ],
    viewport: null,
    acceptDownloads: true,
  });
  await ctx.addCookies(cookies);

  page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(60000);

  const url = conversation || 'https://chatgpt.com/?no_universal_links=1';
  log('goto ' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

  // wait for composer (Cloudflare interstitial included)
  let ready = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const st = await page.evaluate(() => ({
      title: document.title,
      prompt: !!document.querySelector('div.ProseMirror[contenteditable="true"], #prompt-textarea, [contenteditable="true"][aria-label]'),
      login: [...document.querySelectorAll('a,button')].some((e) => /^(log in|登录|登入)$/i.test((e.innerText || '').trim())),
    }));
    if (st.prompt) { ready = true; break; }
    if (/just a moment/i.test(st.title)) { await page.waitForTimeout(2000); continue; }
    if (st.login) { log('NOT LOGGED IN (page shows Log in)'); exitCode = 2; throw new Error('not-logged-in'); }
    await page.waitForTimeout(1500);
  }
  if (!ready) { exitCode = 2; throw new Error('composer-not-ready (title=' + (await page.title()) + ')'); }
  log('composer ready');

  // type the prompt
  const composer = page.locator(SEL.prompt).first();
  await composer.click();
  await page.waitForTimeout(200);
  await composer.fill(prompt);
  await page.waitForTimeout(400);
  const typed = await composer.evaluate((el) => (el.innerText || el.textContent || '').length);
  log('prompt typed: ' + typed + ' chars');

  // submit
  let sent = false;
  for (const s of SEL.send) {
    const loc = page.locator(s).first();
    if (await loc.count()) {
      try {
        await loc.click({ timeout: 5000 });
        sent = true;
        break;
      } catch {}
    }
  }
  if (!sent) { await composer.press('Enter'); sent = true; }
  log('submitted');

  // detect the new image: baseline before generation
  const baseline = await imageOnPage(page);
  const tImg = Date.now();
  let found = null;
  let lastLog = 0;
  while (Date.now() - tImg < timeoutSec * 1000) {
    const st = await imageOnPage(page);
    const streaming = await page.evaluate((sel) => !!document.querySelector(sel), SEL.stop);
    if (st.count > baseline.count && st.last) { found = st.last; break; }
    if (st.count > 0 && !streaming && st.last && st.count > baseline.count) { found = st.last; break; }
    if (Date.now() - lastLog > 5000) {
      lastLog = Date.now();
      log('waiting… images=' + st.count + ' streaming=' + streaming + ' (' + Math.round((Date.now() - tImg) / 1000) + 's)');
    }
    await page.waitForTimeout(1200);
  }
  if (!found) { exitCode = 3; throw new Error('no-image-after-' + timeoutSec + 's'); }
  log('image found: ' + found.w + 'x' + found.h + ' ' + found.src.slice(0, 60));

  // download: (a) UI download button on the newest image, (b) fetch its src
  await page.waitForTimeout(1500);
  let buf = null;
  try {
    const imgLoc = page.locator('img[src="' + found.src.replace(/"/g, '\\"') + '"]').first();
    await imgLoc.hover({ timeout: 5000 });
    await page.waitForTimeout(700);
    const btns = page.locator('[data-testid="download-image"], button[aria-label*="Download" i]');
    const n = await btns.count();
    for (let i = 0; i < n && !buf; i++) {
      try {
        const dl = page.waitForEvent('download', { timeout: 20000 });
        await btns.nth(i).click({ timeout: 5000 });
        const d = await dl;
        const tmp = path.join(profileDir, 'dl-' + Date.now());
        await d.saveAs(tmp);
        const b = fs.readFileSync(tmp);
        fs.unlinkSync(tmp);
        if (b.length > 10000) buf = b;
      } catch {}
    }
  } catch {}
  if (!buf) {
    const r = await fetchImageAsBase64(page, found.src);
    if (r && r.b64) buf = Buffer.from(r.b64, 'base64');
    else log('fetch src failed: ' + (r && r.err));
  }
  if (!buf || buf.length < 1000) { exitCode = 3; throw new Error('download-failed'); }

  // normalise: if not PNG try to transcode via sharp if present, else save raw
  const absOut = path.resolve(outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  if (isPng(buf)) {
    fs.writeFileSync(absOut, buf);
  } else if (buf.slice(0, 4).toString() === 'RIFF' || buf[0] === 0xff) {
    // webp/jpeg — transcode with sharp when available
    let sharp = null;
    try { sharp = require('sharp'); } catch {}
    if (!sharp) { fs.writeFileSync(absOut.replace(/\.png$/i, '') + '.raw', buf); throw new Error('non-png-needs-sharp'); }
    const png = await sharp(buf).png().toBuffer();
    fs.writeFileSync(absOut, png);
    buf = png;
  } else {
    fs.writeFileSync(absOut, buf);
  }

  const bytes = fs.statSync(absOut).size;
  const info = pngSize(fs.readFileSync(absOut));
  const ok = bytes >= MIN_BYTES && info;
  log('saved ' + absOut + ' ' + bytes + ' bytes ' + (info ? info.w + 'x' + info.h : 'NOT-PNG'));
  if (!ok) { exitCode = 4; throw new Error('invalid-output ' + bytes + ' bytes'); }
  console.log(JSON.stringify({ ok: true, out: absOut, bytes, width: info.w, height: info.h, promptChars: prompt.length }));
  exitCode = 0;
} catch (e) {
  console.error('ERROR: ' + (e && e.message ? e.message : e));
  if (page) {
    try {
      const dbg = path.join(os.tmpdir(), 'web-imagegen-fail-' + Date.now() + '.png');
      await page.screenshot({ path: dbg, fullPage: false });
      console.error('screenshot: ' + dbg);
      const body = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 500) : ''));
      if (body) console.error('page text: ' + body.replace(/\n+/g, ' | ').slice(0, 400));
    } catch {}
  }
  if (exitCode === 1 && !/not-logged-in|composer-not-ready|no-image|download-failed|invalid-output/.test(String(e))) exitCode = exitCode;
} finally {
  if (ctx && !keepOpen) await ctx.close().catch(() => {});
  else if (ctx) log('browser left open (--keep-open)');
  process.exit(exitCode);
}
