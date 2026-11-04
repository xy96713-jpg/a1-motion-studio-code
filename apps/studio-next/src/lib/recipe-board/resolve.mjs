// Slot fill resolution with graceful degradation.
// Image slot chain: video clip -> asset (real file) -> screenshot (file or URL capture) -> gen (placeholder) -> text.
// A video fill { video: { path, in, out, poster } } resolves to a poster frame (stills) plus the clip (motion).
// Never throws for missing material; every degraded slot is reported so the frame gets a TODO mark.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { cachedArt } from './imagegen.mjs';

export const LEVELS = ['asset', 'screenshot', 'gen', 'text', 'empty'];

export const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function fileRef(abs) {
  const buf = fs.readFileSync(abs);
  return { url: 'file://' + abs, contentHash: sha(buf), mime: MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' };
}

function existingFile(repoRoot, p) {
  if (!p || /^https?:/i.test(p)) return null;
  const abs = path.isAbsolute(p) ? p : path.join(repoRoot, p);
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
}

// URL capture is itself cached by URL hash; failures are cached too (retry with --force).
async function captureUrl(ctx, url) {
  const key = sha(url).slice(0, 16);
  const png = path.join(ctx.captureDir, key + '.png');
  const fail = path.join(ctx.captureDir, key + '.fail');
  if (fs.existsSync(png)) return png;
  if (fs.existsSync(fail) && !ctx.force) return null;
  fs.mkdirSync(ctx.captureDir, { recursive: true });
  const page = await ctx.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    await page.goto(url, { timeout: ctx.captureTimeoutMs, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: png });
    fs.rmSync(fail, { force: true });
    return png;
  } catch (err) {
    fs.writeFileSync(fail, String(err.message || err).slice(0, 500));
    return null;
  } finally {
    await page.close();
  }
}

// The stand-in for a picture that is not there yet: a quiet plate in the film's own tones (its ground and a soft
// light, fine grain) so the frame reads as designed while it waits; the TODO tag on the card says what is missing.
// It used to be a hued noise field with the prompt printed on it, which read as a broken frame (the user,
// 2026-10-21: 缺什么就补什么, 不要空着).
export function genPlaceholder(prompt, tokens) {
  const a = tokens.bg || '#222', ink = tokens.fg || '#ddd';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs><radialGradient id="l" cx="0.42" cy="0.38" r="0.85"><stop offset="0" stop-color="${ink}" stop-opacity="0.10"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/></radialGradient>
<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="${parseInt(sha(prompt).slice(0, 4), 16) % 97}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.07"/></feComponentTransfer></filter></defs>
<rect width="1600" height="900" fill="${a}"/><rect width="1600" height="900" fill="url(#l)"/><rect width="1600" height="900" filter="url(#n)"/></svg>`;
  return { url: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), contentHash: sha(svg) };
}

const escapeXml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

// Poster frame for a video fill, cached by clip + time. `poster` is seconds after `in` (default 1/3 in).
function videoPoster(abs, v) {
  const at = (v.in ?? 0) + (v.poster ?? ((v.out ?? (v.in ?? 0) + 3) - (v.in ?? 0)) / 3);
  const st = fs.statSync(abs);
  const key = sha(`${abs}:${st.size}:${st.mtimeMs}:${at}`).slice(0, 16);
  const dir = path.join(os.tmpdir(), 'recipe-board-posters');
  const png = path.join(dir, key + '.png');
  if (!fs.existsSync(png)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(at), '-i', abs, '-frames:v', '1', '-vf', 'scale=1920:-2', png]);
  }
  return png;
}

// Subject cutout (transparent PNG) via macOS Vision, cached by source bytes.
function cutoutOf(abs) {
  const key = sha(fs.readFileSync(abs)).slice(0, 16);
  const dir = path.join(os.tmpdir(), 'recipe-board-cutouts');
  const png = path.join(dir, key + '.png');
  if (!fs.existsSync(png)) {
    fs.mkdirSync(dir, { recursive: true });
    try {
      execFileSync('swift', [path.join(path.dirname(new URL(import.meta.url).pathname), 'cutout.swift'), abs, png], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      // Vision finds no subject in a flat product photographed on white (a card seen straight on): key the
      // white backdrop out instead, then crop to what is left
      if (!/no subject/i.test(String(e.stderr || e.message))) throw e;
      const keyed = path.join(dir, key + '-white.png');
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', abs, '-vf', 'format=rgba,colorkey=0xFFFFFF:0.10:0.06', keyed]);
      execFileSync('swift', [path.join(path.dirname(new URL(import.meta.url).pathname), 'trim.swift'), keyed, png], { stdio: ['ignore', 'ignore', 'pipe'] });
    }
  }
  return png;
}

// A region of a picture as its own file (cached by source bytes and region).
function croppedOf(abs, [x, y, w, h]) {
  const key = sha(fs.readFileSync(abs) + JSON.stringify([x, y, w, h])).slice(0, 16);
  const dir = path.join(os.tmpdir(), 'recipe-board-crops');
  const out = path.join(dir, key + path.extname(abs).replace(/\.webp$/i, '.png'));
  if (!fs.existsSync(out)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', abs, '-vf', `crop=iw*${w}:ih*${h}:iw*${x}:ih*${y}`, '-frames:v', '1', out]);
  }
  return out;
}

// Transparent PNG cropped to its alpha bounding box (cached by source bytes).
function trimmed(abs) {
  const key = sha(fs.readFileSync(abs)).slice(0, 16);
  const dir = path.join(os.tmpdir(), 'recipe-board-trimmed');
  const png = path.join(dir, key + '.png');
  if (!fs.existsSync(png)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('swift', [path.join(path.dirname(new URL(import.meta.url).pathname), 'trim.swift'), abs, png], { stdio: ['ignore', 'ignore', 'pipe'] });
  }
  return png;
}

// One flat tone (grey-level spread under 3 of 255 at 64x36, laid over mid grey): an empty page, a white or black frame.
// Cached by the file's size and time.
const blankCache = new Map();
export function isBlankImage(file) {
  if (!/\.(png|jpe?g|webp)$/i.test(file)) return false;
  const st = fs.statSync(file); const k = `${file}:${st.size}:${st.mtimeMs}`;
  if (blankCache.has(k)) return blankCache.get(k);
  let blank = false;
  try {
    // over mid grey, so a white logo on a transparent ground still counts as a picture
    const px = execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x808080:s=64x36', '-i', file, '-filter_complex', '[1]scale=64:36[a];[0][a]overlay=format=auto,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
    const n = px.length || 1, mean = px.reduce((a, v) => a + v, 0) / n;
    blank = Math.sqrt(px.reduce((a, v) => a + (v - mean) ** 2, 0) / n) < 3;
  } catch { blank = false; }
  blankCache.set(k, blank);
  return blank;
}

// A light mark on a transparent ground (a white wordmark, a white G): it vanishes on a light card, so a
// slot that sits on paper (`onLight`) prints it dark. Mean grey of the opaque pixels above 200 of 255.
const markCache = new Map();
export function isLightMark(file) {
  if (!/\.(png|webp|svg)$/i.test(file)) return false;
  const st = fs.statSync(file); const k = `${file}:${st.size}:${st.mtimeMs}`;
  if (markCache.has(k)) return markCache.get(k);
  let light = false;
  try {
    const px = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', 'scale=48:48,format=rgba', '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
    let sum = 0, n = 0, clear = 0;
    for (let i = 0; i < px.length; i += 4) { if (px[i + 3] > 128) { sum += (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11); n++; } else clear++; }
    light = clear > px.length / 4 * 0.2 && n > 0 && sum / n > 200;
  } catch { light = false; }
  markCache.set(k, light);
  return light;
}

// Every fill a card needs resolved as an image: image slots, panels painted with generated art, and
// generated plates behind text (`plate: { art }`, e.g. torn paper under a tag). Keys match compose.mjs.
export function imageFills(recipe, slots = {}) {
  const out = [];
  for (const [name, slot] of Object.entries(recipe.slots)) {
    const fill = slots[name];
    if (!fill) continue;
    // an optional picture with nothing real behind it (only a description) is left out, not a TODO
    if (slot.optional && !(fill.asset || fill.video || fill.art || fill.screenshot)) continue;
    // a slot may cut its picture out by default (`cutout`, a product on a card; 'photo': only photographs,
    // a logo file is already cut): a shot can still say no
    // and a default framing (`defaults: { zoom, position }`, a portrait framed on the face) for real pictures
    const framed = slot.defaults && (fill.asset || fill.video) ? { ...slot.defaults, ...fill } : fill;
    if (slot.kind === 'image' || (slot.kind === 'panel' && fill.art)) out.push([name, slot.cutout && framed.cutout == null && framed.asset && (slot.cutout !== 'photo' || /\.jpe?g$/i.test(framed.asset)) ? { ...framed, cutout: true } : framed]);
    if (fill.plate) out.push([`${name}.plate`, fill.plate]);
  }
  return out;
}

export async function resolveImageSlot(ctx, name, fill = {}, tokens) {
  const clip = fill.video && existingFile(ctx.repoRoot, fill.video.path);
  if (clip) {
    const poster = fileRef(videoPoster(clip, fill.video));
    return { level: 'asset', ...poster, contentHash: sha(poster.contentHash + JSON.stringify(fill.video)), source: fill.video.path,
      video: { url: 'file://' + clip, in: fill.video.in ?? 0, out: fill.video.out ?? null } };
  }
  // Generated art (text-free plate or transparent prop): only the cache is read here; `art` makes it.
  if (fill.art) {
    const artCfg = { sourceRoot: ctx.repoRoot, dataDir: path.join(ctx.repoRoot, 'work', 'recipe-board-v1') };
    let hit = cachedArt(artCfg, fill.art);
    // trim: crop a transparent prop to its visible pixels, so the slot box is the object's own edge.
    if (hit && fill.art.transparent && fill.art.trim) hit = trimmed(hit);
    if (hit) return { level: 'asset', ...fileRef(hit), source: `art:${path.basename(hit)}`, cutout: !!fill.art.transparent, maskUrl: fill.art.transparent ? 'data:image/png;base64,' + fs.readFileSync(hit).toString('base64') : undefined };
    return { level: 'gen', ...genPlaceholder(fill.art.prompt, tokens), source: 'art (not generated yet)' };
  }
  let abs = existingFile(ctx.repoRoot, fill.asset);
  // crop: [x, y, w, h] (0-1) of the picture, taken before anything else (a group photo framed on one
  // person before the cutout, so the others never show at the edge)
  if (abs && Array.isArray(fill.crop) && fill.crop.length === 4) abs = croppedOf(abs, fill.crop);
  if (abs && fill.cutout) {
    const png = cutoutOf(abs);
    // CSS masks are fetched with CORS, so file:// fails; outlines get the silhouette as a data URL.
    return { level: 'asset', ...fileRef(png), source: fill.asset, cutout: true, maskUrl: 'data:image/png;base64,' + fs.readFileSync(png).toString('base64') };
  }
  // a blank picture (a page capture that loaded nothing) is not material: shown and listed as missing
  if (abs && isBlankImage(abs)) return { level: 'blank', ...genPlaceholder(fill.gen || path.basename(abs), tokens), source: fill.asset };
  if (abs) return { level: 'asset', ...fileRef(abs), source: fill.asset, ...(isLightMark(abs) ? { lightMark: true } : {}) };

  if (fill.screenshot) {
    let shot = existingFile(ctx.repoRoot, fill.screenshot);
    if (!shot && /^https?:/i.test(fill.screenshot)) shot = await captureUrl(ctx, fill.screenshot);
    if (shot) return { level: 'screenshot', ...fileRef(shot), source: fill.screenshot };
  }
  if (fill.gen) return { level: 'gen', ...genPlaceholder(fill.gen, tokens), source: fill.gen };
  if (fill.text) return { level: 'text', text: fill.text, contentHash: sha(fill.text) };
  return { level: 'empty', text: name, contentHash: sha('empty:' + name) };
}

export function describeMissing(name, fill = {}, r) {
  if (r.level === 'blank') return { slot: name, level: r.level, wanted: `a real picture (${path.basename(fill.asset || '')} is blank)` };
  const wanted = fill.art ? 'art (run: recipe-board art)' : fill.video ? `video ${path.basename(fill.video.path || '')}` : fill.asset ? `asset ${path.basename(fill.asset)}` : fill.screenshot ? 'screenshot' : fill.gen ? 'gen' : 'material';
  return { slot: name, level: r.level, wanted };
}
