// Which words read as themselves in which house face. A display face may draw a character so freely it no longer reads
// as that character (スミカク: 心 as |C, 核心序列 read back as 核心原刵, 執行死刑 not at all; paperclip-138-full B10, the
// user: 不像中国字). Each (face, word) is set large, read back by Vision, and the words that come back short are not
// legible in that face: morph.js moves such a line down its face's fallback to a face that reads (chapter.mjs
// chapterHouse passes them as house.illegible). Results are kept per face and word (the fonts folder, git-ignored).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const LEGIBLE_MIN = 0.6;   // kept for older callers
// a word of 2-8 characters reads only when every character comes back (one misread character is the one that does not
// read: スミカク's 核心序列 came back 3 of 4, its 心 the |C the user saw); a longer line when 85 % do; a single character
// is not tried (Vision reads a lone character poorly in any face)
export const readable = (word, share) => { const n = cjk(word).length; return n < 2 || (n <= 8 ? share >= 1 : share >= 0.85); };
// The composed frame, not the DOM, is the delivery surface. A declared line that Vision cannot read back is an error;
// an OCR process failure is never converted into a pass. Rows are {beat, expected:[text], read}.
export function finalFrameTextErrors(rows) {
  const out = [];
  for (const row of rows || []) for (const text of row.expected || []) {
    if (cjk(text).length < 2) continue;
    const share = readShare(text, row.read);
    if (!readable(text, share)) out.push(`${row.beat}: final-frame OCR cannot read “${text}” (share ${share.toFixed(2)}; read “${row.read || ''}”)`);
  }
  return out;
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
// the characters a word is read by: Chinese, and Latin letters and figures (B24's XY read back as ZY: 2026-10-23 film review)
const cjk = (w) => [...w].filter((c) => /[\u3400-\u9fff\uf900-\ufaffA-Za-z0-9]/.test(c));

// the share of the word's characters found, in order, in what was read
export function readShare(word, read) {
  const W = cjk(word).map((c) => c.toUpperCase()); if (!W.length) return 1;
  let j = 0, hit = 0; const R = [...String(read || '').replace(/\s+/g, '').toUpperCase()];
  for (const c of W) { const k = R.indexOf(c, j); if (k >= 0) { hit++; j = k + 1; } }
  return hit / W.length;
}

export function ocrKeyframeErrors(keyframes, frames, { runner = spawnSync } = {}) {
  if (!keyframes.length) return [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-final-ocr-'));
  try {
    keyframes.forEach((file, i) => fs.symlinkSync(file, path.join(dir, `${String(i).padStart(3, '0')}.png`)));
    const r = runner('swift', [path.join(HERE, 'ocrlegible.swift'), dir], { encoding: 'utf8', maxBuffer: 32 << 20 });
    if (r.error || r.status !== 0) return [`final-frame OCR failed: ${String(r.error?.message || r.stderr || `exit ${r.status}`).split('\n')[0]}`];
    const reads = new Map();
    for (const line of String(r.stdout || '').split('\n').filter(Boolean)) {
      try { const row = JSON.parse(line); reads.set(parseInt(row.file, 10), row.text || ''); } catch { return ['final-frame OCR returned malformed output']; }
    }
    return finalFrameTextErrors(frames.map((f, i) => ({ beat: f.beat, expected: f.expected, read: reads.get(i) })));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// { family: [words not legible in it] } for the given words and faces ({ family, file })
export function illegible(words, faces, { cacheFile = null, toSimplified = null } = {}) {
  const cache = cacheFile && fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
  const W = [...new Set(words.map((w) => String(w).trim()).filter((w) => cjk(w).length >= 2 && w.length <= 24))];
  const todo = [];
  for (const f of faces) for (const w of W) if (cache[`${f.family}|${w}`] == null && fs.existsSync(f.file)) todo.push([f, w]);
  if (todo.length) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-legible-')), list = path.join(dir, 'pairs.json');
    fs.writeFileSync(list, JSON.stringify(todo.map(([f, w]) => [f.file, w])));
    const r = spawnSync('python3', [path.join(HERE, 'legible.py'), path.join(dir, 'img'), list], { encoding: 'utf8' });
    if (!r.status) {
      const o = spawnSync('swift', [path.join(HERE, 'ocrlegible.swift'), path.join(dir, 'img')], { encoding: 'utf8', maxBuffer: 32 << 20 });
      for (const line of String(o.stdout || '').split('\n').filter(Boolean)) {
        try { const { file, text } = JSON.parse(line), i = parseInt(file, 10), [f, w] = todo[i]; if (!f) continue;
          // Vision may read a Traditional glyph as its Simplified form: either counts
          const s = Math.max(readShare(w, text), toSimplified ? readShare(toSimplified(w), text) : 0);
          cache[`${f.family}|${w}`] = +s.toFixed(2); } catch {}
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
    if (cacheFile) { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 0) + '\n'); }
  }
  const out = {};
  for (const f of faces) for (const w of W) { const s = cache[`${f.family}|${w}`]; if (s != null && !readable(w, s)) (out[f.family] ||= []).push(w); }
  return out;
}
