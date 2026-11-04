// Objective benchmark of a film's frame design against the reference grammar.
// The references are measured, not remembered: Hupo (AESTHETICS.md: median type 65px, big-type cuts 8/139 = 4%,
// max 300–500px, 20.3% frames without type) and Paperclip Vol.47 (profile.json: median 12 chars, 3 lines,
// 2.4% text area, 20.3% frames without type). A film's beats are translated to the same quantities.
export const REFERENCE = {
  hupo: { bigTypeShare: 0.04, medianTypePx: 65, bigTypeMaxPx: 500, noTypeShare: 0.203, source: 'style-lab/reference-hupo/AESTHETICS.md' },
  paperclip: { medianChars: 12, medianLines: 3, textArea: 0.024, noTypeShare: 0.203, source: 'projects/paperclip-047/reference/profile/profile.json' },
};
export const TARGETS = {
  heroShare: [0.1, 0.25],
  medianChars: [1, 12],
  lightShare: [0.15, 0.5],
  materialShare: [0.3, 1],
  compositions: [6, 99],
  moves: [4, 99],
};
const chars = (w) => [...String(w || '')].filter((c) => !/\s/.test(c)).length;
const heads = (r) => (r.words || []).filter((w) => w.role === 'pair' || w.role === 'block');
const made = (r) => ['paper', 'ink', 'metal', 'print'].includes(r.material);
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function designStats(rows, beats) {
  const R = (beats || []).map((b) => (rows || []).find((r) => r.beat === b)).filter((r) => r && r.moment != null);
  const n = R.length;
  const headsPer = R.map((r) => heads(r).length);
  const dchars = R.map((r) => heads(r).reduce((k, w) => k + chars(w.big), 0));
  const count = (f) => R.filter(f).length;
  return {
    beats: n,
    heroShare: n ? count((r) => r.moment === 'hero') / n : 0,
    evidenceShare: n ? count((r) => r.moment === 'evidence') / n : 0,
    dataShare: n ? count((r) => r.moment === 'data') / n : 0,
    diagramShare: n ? count((r) => r.moment === 'diagram') / n : 0,
    medianChars: median(dchars),
    maxChars: dchars.length ? Math.max(...dchars) : 0,
    oneHeadShare: n ? headsPer.filter((x) => x === 1).length / n : 0,
    lightShare: n ? count((r) => (r.ground || {}).kind === 'paper-light') / n : 0,
    materialShare: n ? count(made) / n : 0,
    compositions: [...new Set(R.map((r) => r.composition))].length,
    moves: [...new Set(R.map((r) => r.typeMove))].length,
    grounds: [...new Set(R.map((r) => (r.ground || {}).kind))].length,
  };
}

export function benchmarkErrors(stats) {
  const e = [];
  for (const [k, [lo, hi]] of Object.entries(TARGETS)) {
    const v = stats[k];
    if (typeof v !== 'number') continue;
    if (v < lo || v > hi) e.push('benchmark.' + k + ': ' + (Number.isInteger(v) ? v : v.toFixed(2)) + ' is outside ' + lo + '–' + hi);
  }
  return e;
}

export function benchmarkReport(rows, beats) {
  const stats = designStats(rows, beats);
  const checks = Object.entries(TARGETS).map(([k, [lo, hi]]) => ({ name: k, value: stats[k], target: lo + '–' + hi, pass: stats[k] >= lo && stats[k] <= hi }));
  return { stats, checks, errors: benchmarkErrors(stats) };
}
