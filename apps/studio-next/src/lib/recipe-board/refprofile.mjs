// The measured profile of a film (refprofile.py: second by second how much moves, how long it holds, how much type and
// how big, the colours, how full the frame is, hard cuts) for the reference and for our chapters, and where ours falls
// short of the reference over the same lines (profileGaps). Content-free numbers: a film on another article is held to
// the same standard. node scripts/recipe-board.mjs refprofile --project <id> [--video <our render> --from <s> --to <s>]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { referencePaths } from './refbreakdown.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

export const stale = (file, stamp) => { try { return fs.readFileSync(file, 'utf8') !== stamp; } catch { return true; } };
// profile a video: 1 fps frames, box OCR, then the measurements; cached beside the video. width: the frames are read at
// this width, so two films are measured alike (a half-size preview against the 1080p reference read small type
// as no type: B26 9 characters against 16 until both were read at 960)
export function profileVideo(video, outDir, { subtitles = null, width = 1920 } = {}) {
  const tag = width === 1920 ? '' : `-${width}`, out = path.join(outDir, `profile${tag}.json`);
  // the frames and OCR belong to one version of the video: a new render clears them (they were kept by folder alone,
  // and every chapter re-render was measured on the frames of its first: B32 read red in 0 % of seconds)
  const frames = path.join(outDir, `frames${tag}`), stampF = path.join(outDir, `video${tag}.stamp`), st = fs.statSync(video), stamp = `${st.size}:${Math.round(st.mtimeMs)}`;
  if (stale(stampF, stamp)) { fs.rmSync(frames, { recursive: true, force: true }); fs.rmSync(path.join(outDir, `ocr-boxes${tag}.jsonl`), { force: true }); fs.rmSync(out, { force: true }); }
  fs.mkdirSync(frames, { recursive: true }); fs.writeFileSync(stampF, stamp);
  if (!fs.readdirSync(frames).length) { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', `fps=1,scale=${width}:-2`, path.join(frames, 'f%03d.jpg')]); if (r.status) throw new Error(`frames: ${String(r.stderr).split('\n')[0]}`); }
  const ocr = path.join(outDir, `ocr-boxes${tag}.jsonl`);
  if (!fs.existsSync(ocr)) fs.writeFileSync(ocr, spawnSync('swift', [path.join(HERE, 'ocrboxes.swift'), frames], { maxBuffer: 1 << 28 }).stdout);
  let subs = subtitles;
  if (!subs) { subs = path.join(outDir, 'no-subtitles.json'); fs.writeFileSync(subs, JSON.stringify({ lines: [] })); }
  if (fs.existsSync(out)) return readJson(out);
  const r = spawnSync('python3', [path.join(HERE, 'refprofile.py'), video, frames, ocr, subs, out], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status) throw new Error(`refprofile: ${String(r.stderr).trim().split('\n').pop()}`);
  return readJson(out);
}
export function referenceProfile(cfg, id, { width = 1920 } = {}) {
  const R = referencePaths(cfg, id); if (!R || !fs.existsSync(R.video)) return null;
  // its own folder: the reference's 1 fps frames (reference/frames) are other tools' and must never be cleared
  return profileVideo(R.video, path.join(R.dir, 'profile'), { subtitles: R.subtitles, width });
}

const median = (v) => { const a = v.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const share = (v, f) => (v.length ? v.filter(f).length / v.length : null);
// the summary of seconds [from, to) of a profile
export function window(profile, from = 0, to = Infinity) {
  const s = (profile?.seconds || []).filter((r) => r.t >= from && r.t < to);
  return { seconds: s.length, moving: median(s.map((r) => r.moving)), motion: median(s.map((r) => r.motion)), chars: median(s.map((r) => r.chars)), lines: median(s.map((r) => r.lines)),
    lineH: median(s.flatMap((r) => r.lineH.slice(0, 1))), fill: median(s.map((r) => r.fill)), red: share(s, (r) => r.red > 0.002), lum: median(s.map((r) => r.lum)), still: share(s, (r) => (r.moving ?? 0) < 0.25) };
}
// where ours falls short of the reference over the same lines (pure). LIMITS: how far is too far
export const GAP = { moving: 0.8, chars: 0.6, fill: 0.75, still: 1.3, red: 0.5, lumHigh: 1.6 };
export function profileGaps(ours, ref, L = GAP) {
  const g = [], pc = (x) => `${Math.round(x * 100)} %`;
  if (ours.moving != null && ref.moving && ours.moving < ref.moving * L.moving) g.push(`moves too little: ${pc(ours.moving)} of frames move, the reference ${pc(ref.moving)}`);
  if (ours.still != null && ref.still != null && ours.still > Math.max(0.15, ref.still * L.still)) g.push(`stands still too long: ${pc(ours.still)} of seconds hold, the reference ${pc(ref.still)}`);
  if (ours.chars != null && ref.chars >= 6 && ours.chars < ref.chars * L.chars)   // a reference with a word or two on screen sets no bar
    g.push(`carries too little type: ${ours.chars} characters on screen, the reference ${ref.chars}`);
  if (ours.fill != null && ref.fill && ours.fill < ref.fill * L.fill) g.push(`the frame is emptier: ${pc(ours.fill)} of it carries something, the reference ${pc(ref.fill)}`);
  if (ours.red != null && ref.red != null && ref.red > 0.3 && ours.red < ref.red * L.red) g.push(`the accent colour is missing: red in ${pc(ours.red)} of seconds, the reference ${pc(ref.red)}`);
  if (ours.lum != null && ref.lum && ours.lum > ref.lum * L.lumHigh) g.push(`brighter than the reference (${Math.round(ours.lum)} against ${Math.round(ref.lum)} mean grey)`);
  return g;
}

// A reference film's narration, read off its burned-in subtitles: the bottom band OCR'd every half second, the same
// adjacent lines merged (A1ReferenceSubtitles/v1). The device cues and the breakdowns run on these lines; for
// paperclip-138 they were made by hand, so a second reference had none (paperclip-047, 2026-10-22).
export const SUB_TOP = 0.85, SUB_STEP = 0.5;
// frames: [{ t, lines: [{ text, box: [x, y, w, h] (0-1 of the band) }] }] -> merged lines (pure)
// The subtitle is the line on the film's subtitle row: centred, at the one height and place most centred lines take
// across the film; the design's own words in the band (a cigarette pack, a paper's page) sit elsewhere or are not centred
export function subtitleRow(frames) {
  const key = (l) => `${Math.round((l.box[1] + l.box[3] / 2) * 25)}:${Math.round(l.box[3] * 25)}`, n = {};
  for (const f of frames) for (const l of f.lines) if (Math.abs(l.box[0] + l.box[2] / 2 - 0.5) < 0.04 && /[\u3400-\u9fff]/.test(l.text)) n[key(l)] = (n[key(l)] || 0) + 1;
  const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0]; if (!best) return null;
  const [cy, h] = best[0].split(':').map((v) => +v / 25); return { cy, h };
}
export function mergeSubtitles(frames, step = SUB_STEP) {
  const out = [], row = subtitleRow(frames);
  const on = (l) => Math.abs(l.box[0] + l.box[2] / 2 - 0.5) < 0.06 && (!row || (Math.abs(l.box[1] + l.box[3] / 2 - row.cy) < row.h * 0.5 && Math.abs(l.box[3] - row.h) < row.h * 0.35));
  for (const f of frames) {
    const text = f.lines.filter(on).sort((a, b) => a.box[0] - b.box[0]).map((l) => l.text.trim()).join(' ').replace(/\s+/g, ' ').trim();
    const last = out.at(-1);
    if (last && Math.abs(last.to - f.t) < 1e-6 && (last.text === text || (text && last.text && sameLine(last.text, text)))) {
      last.to = +(f.t + step).toFixed(2); (last.seen[text] = (last.seen[text] || 0) + 1);
    } else out.push({ from: +f.t.toFixed(2), to: +(f.t + step).toFixed(2), text, seen: { [text]: 1 } });
  }
  // a line read a little differently frame to frame (源于此 / 源手此) is one line: its most often read text
  return out.map(({ seen, ...l }) => ({ ...l, text: Object.entries(seen).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0] }));
}
// two readings of one subtitle: most of their character pairs shared
export function sameLine(a, b) {
  const pairs = (s) => { const t = s.replace(/\s+/g, ''), o = new Set(); for (let i = 0; i < t.length - 1; i++) o.add(t.slice(i, i + 2)); return o; };
  const A = pairs(a), B = pairs(b); if (!A.size || !B.size) return false;
  let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.min(A.size, B.size) >= 0.6;
}
export function burnedSubtitles(video, out, { top = SUB_TOP, step = SUB_STEP } = {}) {
  const tmp = fs.mkdtempSync(path.join(path.dirname(out), '.subs-'));
  try {
    let r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', `fps=${1 / step},crop=iw:ih*${(1 - top).toFixed(3)}:0:ih*${top},scale=1600:-2`, path.join(tmp, 's%05d.png')]);
    if (r.status) throw new Error(`subtitle frames: ${String(r.stderr).split('\n')[0]}`);
    r = spawnSync('swift', [path.join(HERE, 'ocrboxes.swift'), tmp], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status) throw new Error(`subtitle OCR: ${String(r.stderr).split('\n')[0]}`);
    const frames = r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((o) => ({ t: (parseInt(o.file.slice(1), 10) - 1) * step, lines: o.lines })).sort((a, b) => a.t - b.t);
    const doc = { contract: 'A1ReferenceSubtitles/v1', note: `原片烧录字幕，每 ${step} 秒 Vision OCR 一次（画面下 ${Math.round((1 - top) * 100)}%），合并相同的相邻行`, video: path.basename(video), lines: mergeSubtitles(frames, step) };
    fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
    return doc;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
