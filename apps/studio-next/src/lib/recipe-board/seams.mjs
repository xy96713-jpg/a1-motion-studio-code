// House seams (out) — single source for allowed outs, world/screen jump, and cover rules.
// Used by greybox check and House Usage so the same answer cannot pass one and fail the other.
import { SCALES } from './filmdesign.mjs';

// Allowed greybox `out` values (schema / HOUSE / reel). Keep in sync with greybox.schema.json `out.enum`.
export const SEAMS = ['cut', 'match', 'whip', 'push', 'glitch', 'flash'];
// Motion covers for a world/screen jump (HOUSE: 换世界用快甩、信号坏或闪白)
export const MOTION_SEAMS = ['whip', 'glitch', 'flash'];
// Any designed carrier (motion + match/push); cut only when both ends settled
export const COVER_SEAMS = ['whip', 'glitch', 'flash', 'match', 'push'];
export const CARRY_SEAMS = COVER_SEAMS;

export function isAllowedSeam(out) {
  return SEAMS.includes(out);
}

export function settledCam(cam) {
  return (cam?.move || 'static') === 'static';
}

// (pure) screen change, or scale jump of ≥2 steps on the film's scale ladder
export function worldOrScreenJump(a, b) {
  if (!a || !b) return false;
  if ((a.screen || 'clean') !== (b.screen || 'clean')) return true;
  const i = SCALES.indexOf(a.scale), j = SCALES.indexOf(b.scale);
  return i >= 0 && j >= 0 && Math.abs(i - j) >= 2;
}
// greybox name (same predicate)
export const worldOrScreenSwitch = worldOrScreenJump;

// Does this outgoing seam cover a world/screen jump? (cover seam, or cut with both cameras settled)
export function coversWorldJump(out, camOut, camIn) {
  if (COVER_SEAMS.includes(out)) return true;
  if (out === 'cut' && settledCam(camOut) && settledCam(camIn)) return true;
  return false;
}

// Bare / uncovered leave on a jump (same criterion greyboxSeamErrors + usage jump-cut use)
export function isUncoveredJumpOut(out, camOut, camIn) {
  return !coversWorldJump(out, camOut, camIn);
}

// (pure) illegal `out` messages for greybox check (one string per bad beat)
export function illegalSeamOutErrors(rows) {
  const e = [];
  for (const r of rows || []) {
    if (!isAllowedSeam(r.out)) e.push(`${r.beat}: its seam out (out) ${r.out}: one of ${SEAMS.join(', ')}`);
  }
  return e;
}

// (pure) jump leave errors for greybox rows + filmdesign meta (screen/scale on beats)
export function worldJumpSeamErrors(rows, beats = []) {
  const e = [], byBeat = Object.fromEntries((beats || []).map((b) => [b.beat, b]));
  const meta = (beat) => byBeat[beat] || {};
  for (let i = 0; i < (rows || []).length - 1; i++) {
    const a = rows[i], b = rows[i + 1], ma = meta(a.beat), mb = meta(b.beat);
    if (!worldOrScreenJump(ma, mb)) continue;
    if (coversWorldJump(a.out, a.camera, b.camera)) continue;
    const why = (ma.screen || 'clean') !== (mb.screen || 'clean')
      ? `screen ${ma.screen || 'clean'}→${mb.screen || 'clean'}`
      : `scale ${ma.scale}→${mb.scale}`;
    e.push(`${a.beat}→${b.beat}: ${why} leaves on ${a.out || 'cut'} — use whip/glitch/flash/match/push, or cut with both ends settled (camera static)`);
  }
  return e;
}

// (pure) ≥3 consecutive cut outs
export function cutStreakSeamErrors(rows, { min = 3 } = {}) {
  const e = [], list = rows || [];
  for (let i = min - 1; i < list.length; i++) {
    let ok = true;
    for (let k = 0; k < min; k++) if (list[i - k].out !== 'cut') { ok = false; break; }
    if (ok) e.push(`${list[i - (min - 1)].beat}–${list[i].beat}: three outs in a row are cut with no match carrier: break the streak (match/whip/glitch/flash/push)`);
  }
  return e;
}

// (pure, tested) HOUSE 硬切两边都停稳 — any `out: cut` with either camera still moving fails
// (world-jump bare cut is covered separately by worldJumpSeamErrors; this catches same-world hard cuts too)
export function hardCutSettleErrors(rows) {
  const e = [];
  for (let i = 0; i < (rows || []).length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    if ((a.out || 'cut') !== 'cut') continue;
    if (settledCam(a.camera) && settledCam(b.camera)) continue;
    const ma = a.camera?.move || 'static', mb = b.camera?.move || 'static';
    e.push(`${a.beat}→${b.beat}: hard cut with camera still moving (${ma}→${mb}) — settle both ends, or use match/push/whip/glitch/flash (HOUSE: 硬切两边都停稳)`);
  }
  return e;
}

// Flash seam duration / readability hard gate (HOUSE: 换世界用闪白盖住; 切点两边都有东西; 可读的字)
// Thresholds (conservative; cite sequence.mjs flash fade 0.1s, greybox SEAM_DUR.flash 0.24, AGENTS ref allows 0.3s):
//   FLASH_DUR_MIN 0.08 ≈ 2 frames @24fps — shorter is not a readable cover
//   FLASH_DUR_MAX 0.36 ≤ whip length — longer washes type past a flash beat
//   FLASH_TYPE_READ_MIN 0.4 — same "0.4 s to read" already enforced for type.in in greyboxErrors
//   FLASH_READABLE_SIZE 90 — greybox reelHtml display-type threshold (size ≥ 90 → scale enter)
export const FLASH_DUR_MIN = 0.08;
export const FLASH_DUR_MAX = 0.36;
export const FLASH_TYPE_READ_MIN = 0.4;
export const FLASH_READABLE_SIZE = 90;
// Default matches greybox SEAM_DUR.flash; pass { flashDur } from the render table so one source stays honest
export const FLASH_DUR_DEFAULT = 0.24;

export function isReadableFlashType(t) {
  if (!t) return false;
  if ((Number(t.size) || 0) >= FLASH_READABLE_SIZE) return true;
  return t.role === 'big' || t.role === 'number';
}

// (pure, tested) flash out: duration in band; cut-enter readable type not scheduled under the white peak;
// landing beat long enough after flash half for a settle/read (when filmdesign dur is present)
export function flashSeamErrors(rows, beats = [], { flashDur = FLASH_DUR_DEFAULT } = {}) {
  const e = [];
  const dur = Number(flashDur);
  if (!Number.isFinite(dur) || dur < FLASH_DUR_MIN || dur > FLASH_DUR_MAX) {
    e.push(`flash seam duration ${flashDur} s out of band [${FLASH_DUR_MIN}, ${FLASH_DUR_MAX}] — keep flash short enough to cover a jump without washing readable type (HOUSE: 闪白; sequence ~0.1s, greybox SEAM_DUR.flash 0.24, ref ≤0.3s)`);
  }
  const half = (Number.isFinite(dur) ? dur : FLASH_DUR_DEFAULT) / 2;
  const need = half + FLASH_TYPE_READ_MIN;
  const byBeat = Object.fromEntries((beats || []).map((b) => [b.beat || b.id, b]));
  const list = rows || [];
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if ((a.out || 'cut') !== 'flash') continue;
    const durA = byBeat[a.beat]?.dur, durB = byBeat[b.beat]?.dur;
    // missing settle/read after flash: landing (and outgoing) must leave flash-half + 0.4s outside the white window
    if (durB != null && Number.isFinite(Number(durB)) && Number(durB) < need) {
      e.push(`${a.beat}→${b.beat}: flash landing beat only ${durB} s — need ≥ ${need.toFixed(2)} s after flash half for settle/read (HOUSE: 闪白后要停稳可读; FLASH_TYPE_READ_MIN ${FLASH_TYPE_READ_MIN}s)`);
    }
    if (durA != null && Number.isFinite(Number(durA)) && Number(durA) < need) {
      e.push(`${a.beat}→${b.beat}: flash outgoing beat only ${durA} s — need ≥ ${need.toFixed(2)} s before flash half so type can settle/read`);
    }
    // flash covering readable type: explicit cut-enter readable type under the white half-window
    for (const t of b.type || []) {
      if (!isReadableFlashType(t) || t.enter !== 'cut') continue;
      const tin = t.in == null ? 0 : Number(t.in);
      if (Number.isFinite(tin) && tin < half) {
        e.push(`${a.beat}→${b.beat}: flash covers readable type "${t.text}" on ${b.beat} at in=${tin}s (enter cut) — delay past flash half (${half.toFixed(2)}s) or use rise/scale after the white peak`);
      }
    }
    if (durA != null && Number.isFinite(Number(durA))) {
      const edge = Number(durA) - half;
      for (const t of a.type || []) {
        if (!isReadableFlashType(t) || t.enter !== 'cut') continue;
        const tin = t.in == null ? 0 : Number(t.in);
        if (Number.isFinite(tin) && tin >= edge) {
          e.push(`${a.beat}→${b.beat}: flash covers readable type "${t.text}" on ${a.beat} at in=${tin}s (enter cut under flash out-window) — bring type in before ${edge.toFixed(2)}s or after the seam`);
        }
      }
    }
  }
  return e;
}

// Unknown outs in a greybox answer (for usage meter flags; same allow-list as greybox)
export function unknownSeamOuts(rows) {
  const bad = [];
  for (const r of rows || []) if (!isAllowedSeam(r?.out)) bad.push({ beat: r.beat, out: r.out });
  return bad;
}
