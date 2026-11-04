// Voice: the narration the film is cut to. With a recording (project.json `voice.audio`, the author's own
// read or a TTS file) the line gets word timings (`voice.words`, or the local Whisper worker) and places
// every beat on the seconds where its words are spoken. The storyboard then plans real lengths, and the
// reel lays each shot over its own span with the recording underneath. Without a recording nothing
// changes (lengths stay estimated from the text).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadProject, projectPaths, readPlan } from './store.mjs';
import { assertScopeAllows } from './project-scope.mjs';

export const VOICE_CONTRACT = 'A1RecipeBoardVoice/v1';
const ALIGN_VERSION = 3;   // part of the cache key: a better alignment re-places every project
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const norm = (t) => String(t || '').replace(/[\s，。！？、,.!?;；:："“”'‘’（）()《》\-—…]/g, '').toLowerCase();
const voiceDir = (cfg, id) => path.join(projectPaths(cfg, id).root, 'voice');
const timingsFile = (cfg, id) => path.join(voiceDir(cfg, id), 'timings.json');
const abs = (cfg, f) => (path.isAbsolute(f) ? f : path.join(cfg.sourceRoot, f));
const stamp = (f) => { const st = fs.statSync(f); return `${st.size}:${Math.round(st.mtimeMs)}`; };

// Beats in order onto word timings: each beat starts where its first new words are spoken (ASR beats
// repeat the tail of the one before, so the overlap is skipped); one that cannot be found is placed by
// its share of the characters between its neighbours. Returns { id: { start, end } } in seconds.
export function alignBeats(beats, words) {
  const chars = [], at = [];
  for (const w of words) for (const c of norm(w.word)) { chars.push(c); at.push(w.startMs / 1000); }
  const text = chars.join('');
  const end = words.length ? words[words.length - 1].endMs / 1000 : 0;
  const rate = Math.max(1, chars.length / Math.max(1, end - (words[0]?.startMs ?? 0) / 1000));   // characters a second
  const starts = [];
  let cursor = 0, prev = '';
  for (const b of beats) {
    let t = norm(b.text);
    for (let n = Math.min(t.length, prev.length); n > 0; n--) if (prev.endsWith(t.slice(0, n))) { t = t.slice(n) || t; break; }
    prev = norm(b.text);
    // the opening words first; a misheard name ("DeepSig" for DeepSeek) is stepped over by trying windows a
    // little further in and counting back by their offset
    let i = -1, back = 0;
    search: for (const n of [10, 8, 6]) for (let k = 0; k + n <= Math.min(t.length, 24); k += 2) {
      const j = text.indexOf(t.slice(k, k + n), cursor);
      // counted back in time at the speaking rate (a misheard word need not have the same length)
      if (j >= 0 && j - cursor < 400) { i = j; back = k / rate; break search; }
    }
    if (i < 0) { const j = text.indexOf(t.slice(0, 4), cursor); if (j >= 0 && j - cursor < 120) i = j; }
    if (i >= 0) { starts.push(Math.max(at[i] - back, starts.filter((x) => x != null).at(-1) ?? 0)); cursor = i + 1; } else starts.push(null);
  }
  // fill the beats not found by their share of characters between found neighbours
  const len = beats.map((b) => Math.max(1, norm(b.text).length));
  for (let k = 0; k < starts.length; k++) {
    if (starts[k] != null) continue;
    let j = k; while (j < starts.length && starts[j] == null) j++;
    // the span from the last found start (or the first word) to the next found start is shared by
    // the beats in it, the found one before the gap included
    const from = k ? k - 1 : k;
    const a = k ? starts[k - 1] : (words[0]?.startMs ?? 0) / 1000;
    const z = j < starts.length ? starts[j] : end;
    const total = len.slice(from, j).reduce((s, x) => s + x, 0);
    let t = a;
    for (let m = from; m < j; m++) { if (m >= k) starts[m] = +t.toFixed(3); t += ((z - a) * len[m]) / total; }
  }
  if (starts.length) starts[0] = Math.min(starts[0], (words[0]?.startMs ?? 0) / 1000);
  return Object.fromEntries(beats.map((b, k) => [b.id, { start: +starts[k].toFixed(3), end: +(k + 1 < starts.length ? starts[k + 1] : end).toFixed(3) }]));
}

function transcribe(cfg, audio) {
  const r = spawnSync('python3', [path.join(cfg.sourceRoot, 'scripts', 'a1_mlx_whisper_worker.py')], {
    input: JSON.stringify({ videoPath: audio, model: process.env.A1_WHISPER_MODEL || 'mlx-community/whisper-large-v3-turbo-q4', language: 'zh' }),
    encoding: 'utf8', maxBuffer: 1 << 28, timeout: 1800000,
  });
  if (r.status !== 0) throw new Error(`transcription failed: ${String(r.stderr).slice(-300)}`);
  const out = JSON.parse(r.stdout);
  if (out.status !== 'PASS') throw new Error(`transcription failed: ${JSON.stringify(out.failures).slice(0, 300)}`);
  return out;
}

// What each beat says that the beat before has not already said (ASR beats repeat the tail before them).
export function readTexts(plan) {
  let prev = '';
  return (plan?.beats || []).map((b) => {
    const t = String(b.text || '').replace(/\s+/g, '');
    const nt = norm(t);
    // the overlap is found without punctuation, then cut from the text as written
    let skip = 0;
    for (let n = Math.min(nt.length, prev.length); n > 0; n--) if (prev.endsWith(nt.slice(0, n))) { skip = n; break; }
    let i = 0;
    for (let seen = 0; i < t.length && seen < skip; i++) if (norm(t[i])) seen++;
    while (i < t.length && !norm(t[i])) i++;
    prev = nt;
    return [b.id, skip && i < t.length ? t.slice(i) : t];
  });
}

export function voiceCueSchedule(shots, timings, words) {
  const out = {};
  for (const s of shots || []) {
    const span = timings?.beats?.[s.shotId]; if (!span) continue;
    const text = [], times = [];
    for (const w of words || []) {
      const start = w.startMs / 1000, end = w.endMs / 1000;
      if (end < span.start || start > span.end) continue;
      for (const c of norm(w.word)) { text.push(c); times.push(start); }
    }
    out[s.shotId] = { text: text.join(''), times, source: 'voice-words' };
  }
  return out;
}

// A synthetic read (`voice.tts`: { engine: 'say', voice, rate }): one clip per beat with the system voice,
// laid end to end; each beat's span is its clip. Clips are cached by their text and voice.
function synthesize(cfg, id, st, { log }) {
  const { engine = 'say', voice = 'Tingting', rate = 260, gap = 0.12 } = st.tts === true ? {} : st.tts;
  if (engine !== 'say') throw new Error(`tts engine ${engine} is not available here (say)`);
  const dir = path.join(voiceDir(cfg, id), 'tts');
  fs.mkdirSync(dir, { recursive: true });
  const beats = {}, list = [];
  let t = 0;
  const texts = readTexts(readPlan(cfg, id));
  log(`reading ${texts.length} beats with the system voice ${voice}`);
  for (const [beat, text] of texts) {
    const wav = path.join(dir, `${sha(JSON.stringify([voice, rate, gap, text]))}.wav`);
    if (!fs.existsSync(wav)) {
      const aiff = wav.replace(/\.wav$/, '.aiff');
      const r = spawnSync('say', ['-v', voice, '-r', String(rate), '-o', aiff, text.replace(/[\[\]]/g, '')]);
      if (r.status !== 0) throw new Error(`say failed for ${beat}: ${String(r.stderr).slice(0, 200)}`);
      // a short breath after each beat; one sample format for the whole read
      const f = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', aiff, '-af', `apad=pad_dur=${gap}`, '-ar', '48000', '-ac', '1', wav]);
      if (f.status !== 0) throw new Error(`tts clip failed for ${beat}`);
      fs.rmSync(aiff, { force: true });
    }
    const d = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], { encoding: 'utf8' }).stdout);
    beats[beat] = { start: +t.toFixed(3), end: +(t + d).toFixed(3) };
    t += d; list.push(wav);
  }
  const listFile = path.join(dir, 'list.txt');
  fs.writeFileSync(listFile, list.map((f) => `file '${f}'`).join('\n') + '\n');
  const c = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'aac', '-b:a', '160k', st.audio]);
  if (c.status !== 0) throw new Error(`tts read failed: ${String(c.stderr).slice(0, 200)}`);
  const out = { contract: VOICE_CONTRACT, key: st.key, audio: path.relative(cfg.sourceRoot, st.audio), offset: 0, tts: st.tts, beats, alignedAt: new Date().toISOString() };
  fs.writeFileSync(timingsFile(cfg, id), JSON.stringify(out, null, 1) + '\n');
  return { state: 'aligned', timings: out };
}

// What the voice step would do: none (no recording), current, or due (recording, words or beats changed).
export function voiceState(cfg, id) {
  const v = loadProject(cfg, id).voice;
  if (!v?.audio && !v?.tts) return { state: 'none' };
  if (!v.audio) {
    // no recording yet: a synthetic read, one clip a beat (its length is the beat's span)
    const plan = readPlan(cfg, id);
    const key = sha(JSON.stringify([ALIGN_VERSION, 'tts', v.tts, readTexts(plan)]));
    const cur = fs.existsSync(timingsFile(cfg, id)) ? JSON.parse(fs.readFileSync(timingsFile(cfg, id), 'utf8')) : null;
    const audio = path.join(voiceDir(cfg, id), 'tts.m4a');
    return { state: cur?.key === key && fs.existsSync(audio) ? 'current' : 'due', key, audio, timings: cur, tts: v.tts };
  }
  const audio = abs(cfg, v.audio);
  if (!fs.existsSync(audio)) return { state: 'missing', audio: v.audio };
  const plan = readPlan(cfg, id);
  const key = sha(JSON.stringify([ALIGN_VERSION, v.audio, stamp(audio), v.words ? stamp(abs(cfg, v.words)) : '', v.offset || 0, (plan?.beats || []).map((b) => [b.id, b.text])]));
  const cur = fs.existsSync(timingsFile(cfg, id)) ? JSON.parse(fs.readFileSync(timingsFile(cfg, id), 'utf8')) : null;
  return { state: cur?.key === key ? 'current' : 'due', key, audio, timings: cur };
}

export function stepVoice(cfg, id, { log = () => {} } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'voice');
  const st = voiceState(cfg, id);
  if (st.state !== 'due') return st;
  const v = loadProject(cfg, id).voice;
  const dir = voiceDir(cfg, id);
  fs.mkdirSync(dir, { recursive: true });
  if (st.tts) return synthesize(cfg, id, st, { log });
  let words;
  if (v.words) words = JSON.parse(fs.readFileSync(abs(cfg, v.words), 'utf8'));
  else {
    const cache = path.join(dir, 'words.json');
    const prev = fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, 'utf8')) : null;
    if (prev?.audioStamp === stamp(st.audio)) words = prev;
    else { log('transcribing the recording (local Whisper)'); words = { ...transcribe(cfg, st.audio), audioStamp: stamp(st.audio) }; fs.writeFileSync(cache, JSON.stringify(words) + '\n'); }
  }
  const flat = (words.segments || []).flatMap((s) => s.words || []);
  const beats = readPlan(cfg, id).beats;
  const spans = alignBeats(beats, flat);
  const out = { contract: VOICE_CONTRACT, key: st.key, audio: v.audio, offset: v.offset || 0, words: v.words || path.relative(projectPaths(cfg, id).root, path.join(dir, 'words.json')), beats: spans, alignedAt: new Date().toISOString() };
  fs.writeFileSync(timingsFile(cfg, id), JSON.stringify(out, null, 1) + '\n');
  return { state: 'aligned', timings: out };
}

// Seconds of each beat as spoken, or null without a current recording.
export function spokenSeconds(cfg, id) {
  const st = voiceState(cfg, id);
  if (st.state !== 'current') return null;
  return Object.fromEntries(Object.entries(st.timings.beats).map(([b, x]) => [b, +(x.end - x.start).toFixed(2)]));
}
