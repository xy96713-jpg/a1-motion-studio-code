// The chapter language (the user 2026-10-26: 根据文案自由判断怎么做怎么设计 … 尽量全面): what a continuous diagram's
// beat is like in the reference, measured beat by beat and held as ranges, so a chapter on another article — with no
// reference to stand beside — is held to the same standard. Content-free numbers only; the look is the film's style.
// Sources, all the reference's own: its second-by-second profile (refprofile.py: how much moves, how long it holds,
// type on screen and how big, fill, colour), its beats taken apart (breakdowns/: elements, the words they come on,
// devices, what carries over to the next beat). Ranges are [p10, p25, median, p75, p90]; a chapter beat is held to
// p10-p90 (both sides: too little and too much), a plan's defaults come from p25-p75 ("规则统一，参数可换").
//   measureChapterLanguage({ profile, beats, subtitles })   -> the language (routing/chapter-language.json)
//   beatStats(profile, from, to)                             -> one beat's numbers, on the same scale
//   languageGaps(stats, lang)                                -> [say]  where a beat leaves the language
//   languageBrief(lang)                                      -> the lines the director is given (prompts/morph.md)
import fs from 'node:fs';
import path from 'node:path';

const q = (v, ps = [0.1, 0.25, 0.5, 0.75, 0.9]) => { const s = v.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b); return s.length ? ps.map((p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3)) : null; };
const med = (v) => q(v, [0.5])?.[0] ?? null;
const share = (v, f) => (v.length ? +(v.filter(f).length / v.length).toFixed(3) : null);
export const STILL = 0.25;   // a second is still when under a quarter of its frames move (refprofile window)

// (pure) one beat [from, to) of a profile: the numbers a beat is judged on
export function beatStats(profile, from, to) {
  const s = (profile?.seconds || []).filter((r) => r.t >= from && r.t < to); if (!s.length) return null;
  let run = 0, hold = 0; for (const r of s) { run = (r.moving ?? 0) < STILL ? run + 1 : 0; hold = Math.max(hold, run); }
  const top = s.map((r) => (r.lineH || [])[0]).filter((x) => x > 0);
  return { seconds: s.length, moving: med(s.map((r) => r.moving)), still: share(s, (r) => (r.moving ?? 0) < STILL), hold,
    chars: med(s.map((r) => r.chars)), lines: med(s.map((r) => r.lines)), bare: share(s, (r) => !r.chars),
    lineH: med(top), biggest: top.length ? Math.max(...top) : 0, textArea: med(s.map((r) => r.textArea)),
    // (a black second is a pause, not an empty frame: the fill is read over the lit seconds)
    fill: med(s.filter((r) => (r.lum ?? 99) > 8).map((r) => r.fill)), black: share(s, (r) => (r.lum ?? 99) <= 8), red: share(s, (r) => r.red > 0.002), lum: med(s.map((r) => r.lum)), sat: med(s.map((r) => r.sat)) };
}

// what a beat hands the next (the breakdown's carryOver, read for its kind)
export function carryKind(text) {
  const t = String(text || '');
  if (/黑场|黑屏|留黑|纯黑/.test(t)) return 'black';
  if (/硬切|什么都不留|直接切|换章/.test(t)) return 'cut';
  if (/底纹|背景字|背景|肌理|竖排成/.test(t)) return 'texture';
  if (/留|保留|还在|继续|沿用|带到/.test(t)) return 'keep';
  return 'other';
}

// (pure) the language from the reference's profile and its beats ({ beat, from, to, elements, devices, carryOver })
// several films at once: sources [{ profile, beats, subtitles, film }], each beat read on its own film's profile (one
// film's 54 beats are not every film: Vol.047 cut five times as often as Vol.138)
export function measureChapterLanguage({ profile, beats, subtitles = null, film = null, sources = null }) {
  const srcs = sources || [{ profile, beats, subtitles, film }], rows = [];
  for (const { profile, beats, subtitles, film } of srcs) for (const b of beats || []) {
    const st = beatStats(profile, b.from, b.to); if (!st) continue;
    const ins = (b.elements || []).map((e) => e.in).filter((x) => x != null).sort((x, y) => x - y), dur = b.to - b.from;
    const gaps = ins.slice(1).map((x, i) => x - ins[i]);
    // an element against its words: how long before (−) or after (+) the line that holds its word starts
    const lead = (b.elements || []).map((e) => { if (e.in == null || !e.word || !subtitles) return null; const w = String(e.word).replace(/[（）()…\s]/g, '').slice(0, 4); if (w.length < 2) return null;
      const l = subtitles.find((x) => x.text && x.text.replace(/\s/g, '').includes(w) && x.to >= e.in - 4 && x.from <= e.in + 4); return l ? +(e.in - l.from).toFixed(2) : null; }).filter((x) => x != null);
    rows.push({ film, beat: b.beat, dur, ...st, elements: ins.length, perSec: ins.length / Math.max(1, dur), gap: med(gaps), firstAt: ins.length ? ins[0] - b.from : null, lead, devices: b.devices || [], carry: carryKind(b.carryOver) });
  }
  const band = (k) => q(rows.map((r) => r[k]));
  const devices = {}; for (const r of rows) for (const d of r.devices) (devices[d] ||= { n: 0, beats: [] }, devices[d].n++, devices[d].beats.push(r.beat));
  const carries = {}; for (const r of rows) carries[r.carry] = (carries[r.carry] || 0) + 1;
  // the whole-film numbers: the films' own summaries side by side (they differ by film: cuts, moving share)
  const sums = srcs.map((x) => x.profile?.summary || {}), S = sums[0] || {}, mean = (k) => { const v = sums.map((x) => x[k]).filter((x) => x != null); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : null; };
  return {
    contract: 'A1ChapterLanguage/v1', films: srcs.map((x) => x.film), beats: rows.length,
    perFilm: srcs.map((x, i) => ({ film: x.film, beats: rows.filter((r) => r.film === x.film).length, hardCutsPerMinute: sums[i].seconds ? +(60 * (sums[i].hardCuts || 0) / sums[i].seconds).toFixed(2) : null, movingShare: sums[i].movingShare ?? null, framesWithRed: sums[i].framesWithRed ?? null })),
    about: 'A continuous diagram beat as the reference makes it, measured (chapterlang.mjs). Ranges [p10, p25, median, p75, p90]; a beat is held to p10-p90, defaults come from p25-p75.',
    camera: { moving: band('moving'), still: band('still'), hold: band('hold'), holdSeconds: S.holdSeconds || null, moveSeconds: S.moveSeconds || null, cameraPxPerSec: S.cameraPxPerSec || null, hardCutsPerMinute: mean('seconds') ? +(60 * sums.reduce((a, x) => a + (x.hardCuts || 0), 0) / sums.reduce((a, x) => a + (x.seconds || 0), 0)).toFixed(2) : null },
    type: { chars: band('chars'), lines: band('lines'), bare: band('bare'), lineH: band('lineH'), biggest: band('biggest'), textArea: band('textArea'), framesWithoutType: mean('framesWithoutType'), zones: S.zones || null },
    colour: { fill: band('fill'), red: band('red'), lum: band('lum'), sat: band('sat') },
    rhythm: { beat: band('dur'), elements: band('elements'), perSec: band('perSec'), gap: band('gap'), firstAt: band('firstAt'), lead: q(rows.flatMap((r) => r.lead)), onsetOnLine: S.onsetOnLine || null },
    transitions: { carries, keepShare: rows.length ? +((carries.keep || 0) / rows.length).toFixed(2) : null },
    devices: Object.fromEntries(Object.entries(devices).sort((a, b) => b[1].n - a[1].n)),
    rows,
  };
}

// (pure) where one beat leaves the language: p10-p90 both ways on what a viewer sees (moves, holds, type, its size,
// the frame's fill); `give` widens the band by a share of its width (one film's 54 beats are not every film)
export const LANG_GIVE = 0.25;
export function languageGaps(st, lang, { give = LANG_GIVE } = {}) {
  const g = [], pc = (x) => `${Math.round(x * 100)} %`; if (!st || !lang) return g;
  const lo = (b) => (b ? b[0] - give * (b[4] - b[0]) : null), hi = (b) => (b ? b[4] + give * (b[4] - b[0]) : null);
  const C = lang.camera, T = lang.type, K = lang.colour;
  if (st.moving != null && C.moving && st.moving < lo(C.moving)) g.push(`moves too little: ${pc(st.moving)} of frames move (the language: ${pc(C.moving[1])}-${pc(C.moving[3])})`);
  if (st.seconds >= 4 && st.hold != null && C.hold && st.hold > Math.max(3, hi(C.hold))) g.push(`stands still ${st.hold} s at a stretch (the language holds ${C.hold[2]} s, ${C.hold[4]} at most)`);
  if (st.chars != null && T.chars && st.chars > hi(T.chars)) g.push(`carries too much type: ${st.chars} characters on screen (the language: ${T.chars[1]}-${T.chars[3]}, ${T.chars[4]} at most)`);
  if (st.lines != null && T.lines && st.lines > hi(T.lines)) g.push(`too many lines at once: ${st.lines} (the language: ${T.lines[2]}, ${T.lines[4]} at most)`);
  if (st.biggest != null && T.biggest && st.seconds >= 3 && st.biggest > 0 && st.biggest < lo(T.biggest)) g.push(`no line stands big: the biggest is ${st.biggest} px (the language's beat has one of ${T.biggest[1]}-${T.biggest[3]} px)`);
  // (a black pause is empty on purpose: beatStats reads the fill over the lit seconds only)
  // (a sparse frame is a design too — the reference's B24 holds one title on a dark tree at 20 %: only a frame under
  // six tenths of its p10 is empty)
  if (st.fill != null && K.fill && st.fill < 0.6 * K.fill[0]) g.push(`the frame is empty: ${pc(st.fill)} of it carries something (the language: ${pc(K.fill[1])}-${pc(K.fill[3])})`);
  // (brightness is the style's, not the language's: the reference's own paper and clipping beats read 99-161)
  return g;
}

// (pure) the language as the director reads it: one line a layer, numbers in the director's units
export function languageBrief(lang) {
  if (!lang) return [];
  const r = (b, f = (x) => x) => (b ? `${f(b[1])}–${f(b[3])}（中位 ${f(b[2])}）` : '—'), pc = (x) => `${Math.round(x * 100)}%`, s = (x) => `${(+x).toFixed(1)} 秒`;
  const C = lang.camera, T = lang.type, K = lang.colour, R = lang.rhythm, D = Object.entries(lang.devices || {}).slice(0, 12).map(([k, v]) => `${k}×${v.n}`).join('、');
  return [
    `一拍的长度 ${r(R.beat, s)}；一拍出 ${r(R.elements)} 样东西，间隔 ${r(R.gap, s)}；第一样在拍开始后 ${r(R.firstAt, s)} 出来`,
    `字跟词：元素出现在它那句台词开始后 ${r(R.lead, s)}（负数是提前）`,
    `运动：一拍里动的帧占 ${r(C.moving, pc)}；最长停住 ${r(C.hold, s)}，超过 ${s(C.hold?.[4] ?? 3)} 算拖`,
    `字：同屏 ${r(T.chars)} 个字、${r(T.lines)} 行；每拍最大的那行 ${r(T.biggest, (x) => `${Math.round(x)}px`)}；无字的秒占 ${r(T.bare, pc)}`,
    `画面：满度 ${r(K.fill, pc)}；亮度 ${r(K.lum, Math.round)}；红色出现在 ${r(K.red, pc)} 的秒里`,
    `拍与拍之间：${Object.entries(lang.transitions?.carries || {}).map(([k, v]) => `${({ keep: '留下东西接着变', black: '黑场', cut: '硬切', texture: '变成下一拍的底纹', other: '其他' })[k] || k} ${v}`).join('，')}`,
    `常用手法：${D}`,
  ];
}

// the language kept with the line (routing/chapter-language.json), made from a reference project
export function chapterLanguageFile(cfg) { return path.join(cfg.dataDir, 'routing', 'chapter-language.json'); }
export function loadChapterLanguage(cfg) { try { return JSON.parse(fs.readFileSync(chapterLanguageFile(cfg), 'utf8')); } catch { return null; } }
