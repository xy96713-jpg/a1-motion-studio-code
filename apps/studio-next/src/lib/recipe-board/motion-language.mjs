// The motion language (the user, 2026-10-26: 按你的建议执行 但是要成熟 尤其是动效 设计风格规范 但允许各种变体 … taste):
// how a shot's camera moves and how its packaging comes in, per kind of picture, measured on the reference's breakdown
// (card.json sub-shots: breakdown.mjs camera zoom / pan / moving / ease / anim onset, build; the card's reader names the
// device) and held as ranges, not one value — the rule is shared, the value varies within it ("规则统一，参数可换").
//   measureLanguage(cards)            -> { devices: { <device>: { n, camera: {...}, enter: {...}, cut: {...} } } }
//   motionDefaults(lang, device, key, temper) -> { dir, zoom, pan, ease, build, onset }   one variant, chosen by key
//   motionErrors(lang, device, spec, temper)  -> [say]   a camera outside what the language allows
// A device the reference shows fewer than MIN_N times is read through its family (FAMILY) — one film's six tables are
// not a range (a diagram, the reference's 41 s tour at ×2.25, is no table's: it reads 'other'). A style's camera temper (styles.json camera.temper) scales the ranges: calm moves less and settles
// longer, brisk is the reference, bouncy enters quicker, smooth keeps moving.
import crypto from 'node:crypto';

export const MIN_N = 5;
export const FAMILY = { table: 'data', chart: 'data', compare3d: 'data', market: 'data', diagram: 'other', steps: 'data', brand: 'title', title: 'title', quote: 'words', recap: 'words', chat: 'words', 'side-card': 'card', person: 'person', article: 'article', broll: 'broll', presenter: 'presenter' };
export const TEMPER = {
  calm: { amp: .7, build: 1.3, ease: .1, moving: .9 },
  brisk: { amp: 1, build: 1, ease: 0, moving: 1 },
  bouncy: { amp: 1.1, build: .75, ease: -.05, moving: 1 },
  smooth: { amp: .9, build: 1.1, ease: .15, moving: 1.15 },
};

const qs = (v, ps) => { const s = v.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b); return s.length ? ps.map((p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3)) : null; };
const band = (v) => qs(v, [.1, .25, .5, .75, .9]);   // [p10, p25, median, p75, p90]

// (pure) the language from the reference's cards
export function measureLanguage(cards) {
  const rows = [];
  for (const c of cards || []) for (const s of c?.subs || []) { const cam = s.camera || {}, dev = String(s.read?.device || '').trim(); if (!dev) continue;
    rows.push({ dev, fam: FAMILY[dev] || 'other', dur: s.end - s.at, z: cam.zoom, lz: cam.zoom > 0 ? Math.log(cam.zoom) : null, pan: Array.isArray(cam.pan) ? Math.hypot(...cam.pan) : null, moving: cam.moving, ease: cam.ease, onset: cam.anim?.onset, build: cam.anim?.build }); }
  const of = (rs) => ({ n: rs.length,
    camera: { in: +(rs.filter((r) => r.z > 1.01).length / rs.length).toFixed(2), out: +(rs.filter((r) => r.z < .99).length / rs.length).toFixed(2),
      push: band(rs.map((r) => (r.lz == null ? null : Math.abs(r.lz)))), pan: band(rs.map((r) => r.pan)), moving: band(rs.map((r) => r.moving)), ease: band(rs.map((r) => r.ease)) },
    enter: { onset: band(rs.map((r) => r.onset)), build: band(rs.map((r) => r.build)) },
    cut: band(rs.map((r) => r.dur)) });
  const devices = {}, families = {};
  for (const f of new Set(rows.map((r) => r.fam))) families[f] = of(rows.filter((r) => r.fam === f));
  for (const d of new Set(rows.map((r) => r.dev))) { const rs = rows.filter((r) => r.dev === d); devices[d] = rs.length >= MIN_N ? { ...of(rs), from: 'device' } : { ...families[FAMILY[d] || 'other'], from: `family ${FAMILY[d] || 'other'}` }; }
  return { contract: 'A1RecipeBoardMotionLanguage/v1', subs: rows.length, all: of(rows), families, devices };
}

const entry = (lang, device) => lang?.devices?.[device] || lang?.families?.[FAMILY[device] || 'other'] || lang?.all || null;
const unit = (key, salt) => parseInt(crypto.createHash('sha256').update(`${key}|${salt}`).digest('hex').slice(0, 8), 16) / 0xffffffff;
const within = (b, u) => (b ? b[1] + (b[3] - b[1]) * u : null);   // between p25 and p75: the common half, never the tails

// (pure) one variant of the language for a shot: direction by the measured shares, each amount in the common half of
// its range, picked by the shot's key so the same shot always draws the same and two shots of a kind differ
export function motionDefaults(lang, device, key, temper = 'brisk') {
  const e = entry(lang, device), t = TEMPER[temper] || TEMPER.brisk; if (!e) return null;
  const u = unit(key, 'dir'), still = Math.max(0, 1 - e.camera.in - e.camera.out), dir = u < e.camera.in ? 1 : u < e.camera.in + e.camera.out ? -1 : 0;
  const push = within(e.camera.push, unit(key, 'push')) * t.amp, ease = Math.min(.95, Math.max(.3, within(e.camera.ease, unit(key, 'ease')) + t.ease));
  return { dir, zoom: dir ? +Math.exp(dir * Math.max(.01, push)).toFixed(3) : 1, pan: +(within(e.camera.pan, unit(key, 'pan')) * t.amp).toFixed(3), moving: +Math.min(1, within(e.camera.moving, unit(key, 'moving')) * t.moving).toFixed(2), ease: +ease.toFixed(2),
    onset: +within(e.enter.onset, unit(key, 'onset'))?.toFixed(2), build: +(within(e.enter.build, unit(key, 'build')) * t.build).toFixed(2), still: +still.toFixed(2), from: e.from || 'all' };
}

// (pure) a shot's camera against the language: its push beyond what the reference ever makes for the kind (p90, with
// a quarter's give, temper scaled), or a camera standing still where the kind always moves (p10 of moving above .5)
export function motionErrors(lang, device, spec, temper = 'brisk') {
  const e = entry(lang, device), t = TEMPER[temper] || TEMPER.brisk, out = []; if (!e || !Array.isArray(spec?.camera)) return out;
  const zs = spec.camera.flatMap((k) => [k.from?.zoom, k.to?.zoom]).filter((z) => z > 0), lz = zs.length ? Math.log(Math.max(...zs) / Math.min(...zs)) : 0;
  const max = (e.camera.push?.[4] ?? .15) * 1.25 * Math.max(1, t.amp);
  if (lz > max) out.push(`camera: the shot zooms ×${Math.exp(lz).toFixed(2)}; a ${device} in the reference moves at most ×${Math.exp(max).toFixed(2)} (the language's p90 with a quarter's give): move less, or say in follows why it differs`);
  if ((e.camera.moving?.[0] ?? 0) > .5 && !spec.camera.length) out.push(`camera: a ${device} in the reference is always moving (${Math.round(e.camera.moving[0] * 100)} % of it at least, p10): give it a move`);
  return out;
}
