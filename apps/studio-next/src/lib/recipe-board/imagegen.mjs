// GPT image generation (Codex built-in image_gen, gpt-image; no API key) for card art: text-free
// background plates and transparent prop sprites. Art is generated in its own step (`art` command)
// and cached by its request; renders only read the cache, so a missing piece shows as a TODO.
//
// A fill asks for art with { art: { prompt, refs?: [image paths], transparent?: bool, size? } }.
// Rules baked into every request: no readable text, no logos, no real people's faces; readable text
// and data are always drawn by code on top, facts come from real sources.
//
// House art policy (user decision 2026-10-20, style-lab/calc4): the "cinematic" image is the model's default
// look and reads as AI; the films' look comes from a medium printed in code (print.py, tube.py). So:
//  - a request names a real object (`real: '1970s desk calculator'`): a real photograph from Wikimedia
//    Commons (public domain or Creative Commons, a trusted source) is used first; generation only when none fits;
//  - a generated image is a plain master: catalogue / archive photography, flat honest light; the words of the
//    cinematic look are taken out of every prompt (houseArt) and the texture is left to the medium.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { codexExecutable } from './director.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CODEX_IMAGES = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images');

export const artDir = (cfg) => path.join(cfg.dataDir, 'art-cache');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const shaFile = (f) => sha(fs.readFileSync(f));

// Identity of a request: prompt, size, transparency and the bytes of every reference image.
export function artKey(cfg, art) {
  const refs = (art.refs || []).map((r) => {
    const abs = path.isAbsolute(r) ? r : path.join(cfg.sourceRoot, r);
    return fs.existsSync(abs) ? shaFile(abs) : `missing:${r}`;
  });
  return sha(JSON.stringify({ p: art.prompt, s: art.size || null, t: !!art.transparent, refs })).slice(0, 20);
}

export function cachedArt(cfg, art) {
  const file = path.join(artDir(cfg), `${artKey(cfg, art)}.png`);
  return fs.existsSync(file) ? file : null;
}

// The cinematic vocabulary that pulls the model to its default look, and what a plain master asks for instead.
const CINEMATIC = [/\bcinematic\b/gi, /\bmoody\b/gi, /\blow[- ]key( light(ing)?)?\b/gi, /\bshallow depth of field\b/gi, /\bbokeh\b/gi,
  /\b(visible )?film grain\b/gi, /\bshot on 35 ?mm film\b/gi, /\b35 ?mm\b/gi, /\bdramatic (light(ing)?|shadows?)\b/gi, /\bgolden hour\b/gi,
  /\bvolumetric( light(ing)?)?\b/gi, /\bepic\b/gi, /\bhyper-?realistic\b/gi, /\b8k\b/gi, /\boctane( render)?\b/gi, /\bunreal engine\b/gi,
  /\bmuted colou?rs\b/gi, /\bfalling off to black at the corners\b/gi, /\bteal and orange\b/gi];
export const HOUSE_LOOK = 'Photographed plainly, like a catalogue or archive photograph: even, honest light, true colours, everything in focus, no colour grading and no added grain (texture is printed later).';
export function houseArt(prompt) {
  let p = String(prompt || '');
  for (const re of CINEMATIC) p = p.replace(re, '');
  // tidy what the cuts leave: space before punctuation, runs of punctuation (keep the last), empty brackets
  p = p.replace(/\(\s*\)/g, '').replace(/\s+([,:;.])/g, '$1');
  for (let i = 0; i < 3; i++) p = p.replace(/([,:;.])\s*([,:;.])/g, '$2');
  p = p.replace(/\s{2,}/g, ' ').replace(/^[\s,.:;]+/, '').trim();
  return `${p} ${HOUSE_LOOK}`.trim();
}

const RULES = [
  'Absolutely no readable text, letters, numbers, captions, watermarks or logos anywhere in the image.',
  'No real, identifiable people.',
];

function requestPrompt(art) {
  const size = art.size || (art.transparent ? '1024x1024' : '1536x1024');
  return [
    'Use your built-in image generation tool (image_gen) exactly once to create one image, then reply with only the word DONE.',
    art.refs?.length ? 'The attached image(s) are references for style, materials, lighting and composition only; do not copy any text from them.' : '',
    `Image: ${art.cinematic ? art.prompt : houseArt(art.prompt)}`,
    art.transparent ? 'Isolated object on a fully transparent background (real alpha channel), no ground shadow, nothing else in frame.' : 'Full-bleed frame, no border.',
    `Size ${size}.`,
    ...RULES,
  ].filter(Boolean).join('\n');
}

// OCR check (macOS Vision): text-free art must not contain readable text.
function textChars(file) {
  const r = spawnSync('swift', [path.join(HERE, 'textcover.swift'), file], { encoding: 'utf8', timeout: 120000 });
  try { return JSON.parse(r.stdout)[0]?.chars ?? 0; } catch { return 0; }
}

// One generation through `codex exec`; returns the new PNG it wrote under ~/.codex/generated_images.
// Calls are serialised with a lock so concurrent runs cannot pick up each other's files.
function runOnce(cfg, art) {
  const bin = codexExecutable();
  if (!bin) throw new Error('Codex CLI not found (set A1_CODEX_BIN)');
  const lock = path.join(os.tmpdir(), 'recipe-board-imagegen.lock');
  // (a lock left by a process that died is taken over at once: a run stopped mid-generation left the next ones
  // waiting ten minutes each)
  const alive = () => { try { process.kill(+fs.readFileSync(lock, 'utf8'), 0); return true; } catch { return false; } };
  for (let i = 0; fs.existsSync(lock) && alive() && i < 600; i++) spawnSync('sleep', ['1']);
  fs.writeFileSync(lock, String(process.pid));
  try {
    const started = Date.now();
    const refs = (art.refs || []).map((r) => (path.isAbsolute(r) ? r : path.join(cfg.sourceRoot, r))).filter((f) => fs.existsSync(f));
    const args = ['exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never', ...refs.flatMap((f) => ['-i', f]), '-'];
    const r = spawnSync(bin, args, { input: requestPrompt(art), encoding: 'utf8', timeout: 600000, maxBuffer: 20 << 20 });
    if (r.status !== 0) throw new Error(`codex exec failed: ${String(r.stderr).slice(-400)}`);
    const fresh = fs.readdirSync(CODEX_IMAGES)
      .flatMap((d) => { try { return fs.readdirSync(path.join(CODEX_IMAGES, d)).map((f) => path.join(CODEX_IMAGES, d, f)); } catch { return []; } })
      .filter((f) => f.endsWith('.png') && fs.statSync(f).mtimeMs >= started - 1000)
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (!fresh.length) throw new Error(`no image produced: ${String(r.stdout).slice(-300)}`);
    return { file: fresh[0], seconds: Math.round((Date.now() - started) / 1000) };
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

// A real photograph for `query` from Wikimedia Commons: public domain or Creative Commons (trusted: approved
// automatically, user decision 2026-10-19), at least minWidth wide, no text-heavy scans. Returns
// { file, source } or null. The search and the download are the only network calls; tests stub `fetchJson`.
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const UA = 'A1MotionStudio/1.0 (recipe-board art; contact via repository owner)';
export const FREE_LICENSE = /^(cc0|public domain|pd\b|cc by(-sa)? \d|cc-by(-sa)?-\d)/i;
export function pickCommons(pages, { minWidth = 1600 } = {}) {
  const ok = Object.values(pages || {}).map((p) => ({ p, i: p.imageinfo?.[0] })).filter(({ p, i }) => i && /\.(jpe?g|png)$/i.test(p.title) && i.width >= minWidth && FREE_LICENSE.test(i.extmetadata?.LicenseShortName?.value || ''));
  // landscape first (frames are 16:9), then size
  ok.sort((a, b) => (b.i.width / b.i.height >= 1.2) - (a.i.width / a.i.height >= 1.2) || b.i.width - a.i.width);
  const best = ok[0];
  if (!best) return null;
  const m = best.i.extmetadata || {};
  const strip = (t) => String(t || '').replace(/<[^>]+>/g, '').trim();
  return { title: best.p.title, url: best.i.url, page: best.i.descriptionurl, width: best.i.width, height: best.i.height, license: strip(m.LicenseShortName?.value), author: strip(m.Artist?.value).slice(0, 200), credit: strip(m.Credit?.value).slice(0, 200) };
}
export async function realPhoto(cfg, query, { minWidth = 1600, fetchJson = null } = {}) {
  const get = fetchJson || (async (u) => (await fetch(u, { headers: { 'User-Agent': UA } })).json());
  const u = `${COMMONS}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=${encodeURIComponent(query)}&prop=imageinfo&iiprop=url|size|extmetadata`;
  let j; try { j = await get(u); } catch { return null; }
  const pick = pickCommons(j?.query?.pages, { minWidth });
  if (!pick) return null;
  const ext = /\.png$/i.test(pick.title) ? '.png' : '.jpg';
  const tmp = path.join(os.tmpdir(), `rb-real-${sha(pick.url).slice(0, 12)}${ext}`);
  if (!fs.existsSync(tmp)) {
    const r = await fetch(pick.url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  }
  return { file: tmp, source: pick };
}

// Generate (or reuse) one piece of art; text-free art that still shows text is redrawn once. A request with
// `real` takes a real photograph first (realArt); this sync path only generates.
export async function realArt(cfg, art, { log = () => {} } = {}) {
  const hit = cachedArt(cfg, art);
  if (hit) return { file: hit, cached: true };
  if (art.real && !art.transparent) {
    const r = await realPhoto(cfg, art.real);
    if (r) {
      fs.mkdirSync(artDir(cfg), { recursive: true });
      const key = artKey(cfg, art), file = path.join(artDir(cfg), `${key}.png`);
      const conv = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', r.file, '-vf', "scale='min(2400,iw)':-2", file]);
      if (conv.status === 0) {
        const receipt = { contract: 'A1RecipeBoardArtReceipt/v1', key, prompt: art.prompt, real: art.real, generator: 'real photograph (Wikimedia Commons)', source: r.source,
          rights: { status: 'TRUSTED_AUTO_APPROVED', type: 'commons', license: r.source.license, attribution: `${r.source.author || 'Wikimedia Commons'} · ${r.source.license} · ${r.source.page}` }, sha256: shaFile(file), createdAt: new Date().toISOString() };
        fs.writeFileSync(path.join(artDir(cfg), `${key}.json`), JSON.stringify(receipt, null, 1) + '\n');
        log(`  real photograph: ${r.source.title} (${r.source.license})`);
        return { file, cached: false, real: r.source };
      }
    }
    log(`  no free real photograph for "${art.real}", generating a plain master`);
  }
  return generateArt(cfg, art, { log });
}

export function generateArt(cfg, art, { log = () => {} } = {}) {
  const hit = cachedArt(cfg, art);
  if (hit) return { file: hit, cached: true };
  fs.mkdirSync(artDir(cfg), { recursive: true });
  let attempt = runOnce(cfg, art);
  let chars = textChars(attempt.file);
  if (chars > 3) {
    log(`  art has ${chars} text characters, redrawing once`);
    attempt = runOnce(cfg, { ...art, prompt: `${art.prompt} (STRICT: the previous attempt contained text; this one must contain none)` });
    chars = textChars(attempt.file);
  }
  const key = artKey(cfg, art);
  const file = path.join(artDir(cfg), `${key}.png`);
  fs.copyFileSync(attempt.file, file);
  const receipt = { contract: 'A1RecipeBoardArtReceipt/v1', key, prompt: art.prompt, refs: art.refs || [], transparent: !!art.transparent, size: art.size || null,
    generator: 'codex image_gen (gpt-image)', source: attempt.file, sha256: shaFile(file), seconds: attempt.seconds, textChars: chars, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(artDir(cfg), `${key}.json`), JSON.stringify(receipt, null, 1) + '\n');
  // Keep a copy in the NAS material library when it is mounted (the local cache is not in Git).
  const nas = process.env.A1_MATERIAL_LIBRARY || '/Volumes/personalfolder/电影/A1素材库';
  if (fs.existsSync(nas)) {
    const dir = path.join(nas, 'generated');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, path.join(dir, `${key}.png`));
    fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(receipt, null, 1) + '\n');
  }
  return { file, cached: false, seconds: attempt.seconds, textChars: chars };
}

// Every art request in a project's shots (slots, backdrop, layers, scenes).
export function artRequests(shot) {
  const out = [];
  const visit = (v) => {
    if (!v || typeof v !== 'object') return;
    if (v.art && typeof v.art.prompt === 'string') out.push(v.art);
    Object.values(v).forEach(visit);
  };
  visit({ slots: shot.slots, backdrop: shot.backdrop, layers: shot.layers, scenes: shot.scenes });
  return out;
}
