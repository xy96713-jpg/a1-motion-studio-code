// What must hold of every film the line makes, checked each time it makes one (user, 2026-10-22: 成熟 — 端到端的底线
// 检查). The voice muxing dropped the last 0.3 s of every shot for days and nothing said so: the white model drifted
// 0.4 s behind the reference and its late events were measured at the wrong moments (who-S10). These fail loudly:
//   parts     every shot's part holds its whole length (no tail lost)
//   film      the passage's film is as long as the passage (to a frame and a half)
//   same      the final film shows at each shot's middle what the white model showed there (the same picture at another
//             density: a shot rendered from another spec, or out of place, differs)
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export const probe = (f) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration,nb_frames,r_frame_rate:format=duration', '-of', 'json', f], { encoding: 'utf8' });
  try { const j = JSON.parse(r.stdout), s = j.streams?.[0] || {}, [a, b] = String(s.r_frame_rate || '0/1').split('/').map(Number);
    return { video: +(s.duration ?? j.format?.duration ?? 0), frames: +(s.nb_frames || 0), fps: b ? a / b : 0, format: +(j.format?.duration || 0) }; } catch { return null; }
};
// (pure, tested) parts: [{ id, file, want (s), got: probe }]
export function partErrors(parts) {
  const out = [];
  for (const p of parts) { const g = p.got; if (!g) { out.push(`${p.id}: its part cannot be read (${p.file})`); continue; }
    const frame = g.fps ? 1 / g.fps : .05; if (g.video < p.want - 1.5 * frame) out.push(`${p.id}: its part holds ${g.video.toFixed(3)} s of picture, the shot is ${p.want.toFixed(3)} s (its tail was lost)`); }
  return out;
}
export function filmErrors(got, want, what = 'film') {
  if (!got) return [`the ${what} cannot be read`];
  const frame = got.fps ? 1 / got.fps : .05;
  return Math.abs(got.video - want) > 1.5 * frame ? [`the ${what} is ${got.video.toFixed(3)} s, the passage ${want.toFixed(3)} s (it has drifted off the reference's clock)`] : [];
}
// a small grey thumbnail of a film at a time (64 x 36)
const thumb = (f, t) => { const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-ss', String(Math.max(0, t)), '-i', f, '-frames:v', '1', '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 }); return r.stdout?.length === 64 * 36 ? [...r.stdout] : null; };
export const corr = (a, b) => { const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n; let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; c += x * y; va += x * x; vb += y * y; } return va && vb ? c / Math.sqrt(va * vb) : 1; };
// (pure in its rule, tested) shots: [{ id, mid }] on the film's clock; pairs of thumbnails' likeness
export function sameErrors(likeness, min = .55) { return likeness.filter((x) => x.r != null && x.r < min).map((x) => `${x.id}: the final film at ${x.t.toFixed(2)} s is not the picture the white model showed there (likeness ${x.r.toFixed(2)})`); }
export function likenessAt(final, white, shots) {
  return shots.map((s) => { const a = thumb(final, s.mid), b = thumb(white, s.mid); return { id: s.id, t: s.mid, r: a && b ? +corr(a, b).toFixed(3) : null }; });
}
export const exists = (f) => fs.existsSync(f);
