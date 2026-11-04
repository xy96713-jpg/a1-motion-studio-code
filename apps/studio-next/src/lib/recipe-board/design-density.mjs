// Shot design density: a shot is a run of visible events, not a still with a caption.
// User 2026-11-02, after the Opus 5.5 corpus study (docs/analysis/OPUS55-STUDY-20261102.md): the benchmark reels
// change what is on screen about once a second — the graphic, the words and the space take turns. Our chapters held
// one plate for 9 s with two small labels, which measures as a still. This is the pure check for the design brief;
// it is silent for legacy briefs that carry no state plan.
export const DESIGN_EVENT_KINDS = Object.freeze(['graphic', 'text', 'space']);

const round = (n) => Math.round(n * 10) / 10;

export function designDensityErrors(rows = [], { minEvents = 3, maxEvents = 6, maxGap = 1.8, states = 3, tailHold = 2.0 } = {}) {
  const errors = [];
  for (const r of rows) {
    const id = r?.beat || '?';
    const S = r?.states, E = r?.events;
    const hasStates = Array.isArray(S), hasEvents = Array.isArray(E);
    if (!hasStates && !hasEvents) continue; // a legacy brief: the state plan is asked for from 2026-11-02
    if (!hasStates || S.length !== states) errors.push(`${id}.states: ${states} states (begin / change / land), each saying what is on screen`);
    else if (S.some((x) => !String(x || '').trim())) errors.push(`${id}.states: every state says what is on screen — an empty state is a still`);
    if (!hasEvents) { errors.push(`${id}.events: 3–6 events (at, kind, what changes) — a shot of one event is a still`); continue; }
    if (E.length < minEvents || E.length > maxEvents) errors.push(`${id}.events: ${E.length} events (2–4; a 9 s shot wants 2–4 visible changes)`);
    if (E.some((x) => !DESIGN_EVENT_KINDS.includes(x?.kind))) errors.push(`${id}.events.kind: graphic | text | space`);
    const kinds = new Set(E.map((x) => x?.kind).filter((k) => DESIGN_EVENT_KINDS.includes(k)));
    if (kinds.size < 2) errors.push(`${id}.events: at least two layers take turns (graphic/text/space), not only one`);
    const ats = E.map((x) => Number(x?.at));
    if (ats.some((x) => !Number.isFinite(x) || x < 0)) { errors.push(`${id}.events.at: seconds into the beat`); continue; }
    const dur = Number(r?.seconds) || Number(r?.duration) || 9;
    const sorted = [...ats].sort((a, b) => a - b);
    let prev = 0;
    for (const at of sorted) {
      if (at - prev > maxGap + 1e-9) errors.push(`${id}.events: ${round(at - prev)} s with nothing changing before ${round(at)} s (max ${maxGap} s)`);
      prev = at;
    }
    if (dur - prev > tailHold + 1e-9) errors.push(`${id}.events: ${round(dur - prev)} s of hold after the last event (max ${tailHold} s; land the beat on an event)`);
  }
  return errors;
}
