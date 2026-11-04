// Frame design grammar, checked before a chapter is built.
// A beat is a moment (why the frame exists), a composition (where the subject stands), a type move and material
// (how the words are made), a scale (which rung of the ladder), and a ground (what it is shot against).
// The grammar is the whole film's: heroes are rare, grounds alternate, no composition repeats three times.
export const MOMENTS = ['hero', 'evidence', 'object', 'data', 'diagram', 'quote', 'transition'];
export const TYPE_MOVES = ['stackType', 'knockout', 'maskType', 'zoomThrough', 'surfaceType', 'pair', 'band', 'block', 'label'];
export const MATERIALS = ['flat', 'paper', 'ink', 'metal', 'print'];
export const SCALE = { hero: 300, figure: 200, title: 128, sub: 64, caption: 48 };
export const INK_TONES = ['dark', 'light', 'red'];
// Gawx: a big block, a vertical column, a line on the edge, or the centre — and the film rotates between them
export const TYPE_LAYOUTS = ['block', 'vertical', 'edge', 'centre'];
const HERO_MOVES = new Set(['stackType', 'knockout', 'maskType', 'zoomThrough', 'surfaceType']);
const HERO_MATERIALS = new Set(['paper', 'ink', 'metal', 'print']);
const LIGHT_GROUNDS = new Set(['paper-light']);
const chars = (w) => [...String(w || '')].filter((c) => !/\s/.test(c)).length;
const words = (r) => (Array.isArray(r.words) ? r.words : []);
const designChars = (r) => words(r).reduce((n, w) => n + chars(w.big), 0); // the head's characters; a Latin subline is not a head

// per-beat: the frame says what it is for, how the subject is placed, how the words are made and how big
export function frameDesignErrors(rows) {
  const R = (rows || []).filter((r) => r && r.moment != null);
  if (!R.length) return []; // legacy briefs (no moment) are not judged by this grammar
  const e = [];
  for (const r of R) {
    const tag = 'brief.' + r.beat;
    if (!MOMENTS.includes(r.moment)) e.push(tag + '.moment: "' + r.moment + '" is not one of ' + MOMENTS.join(', '));
    if (!TYPE_MOVES.includes(r.typeMove)) e.push(tag + '.typeMove: "' + r.typeMove + '" is not one of ' + TYPE_MOVES.join(', '));
    if (!MATERIALS.includes(r.material)) e.push(tag + '.material: "' + r.material + '" is not one of ' + MATERIALS.join(', '));
    if (!(r.scale in SCALE)) e.push(tag + '.scale: "' + r.scale + '" is not one of ' + Object.keys(SCALE).join(', '));
    const heads = words(r).filter((w) => w.role === 'pair' || w.role === 'block');
    if (heads.length > 1) e.push(tag + '.words: ' + heads.length + ' pairs or blocks in one beat (one at most)');
    if (designChars(r) > 12) e.push(tag + '.words: ' + designChars(r) + ' characters of design type (twelve at most; a caption/source is not a head)');
    if (!TYPE_LAYOUTS.includes(r.typeLayout)) e.push(tag + '.typeLayout: "' + r.typeLayout + '" is not one of ' + TYPE_LAYOUTS.join(', '));
    if (r.moment === 'hero' && r.typeLayout === 'edge') e.push(tag + '.typeLayout: a hero is a block/vertical/centre, not a line on the edge');
    if (r.moment === 'hero') {
      if (r.scale !== 'hero') e.push(tag + '.scale: a hero beat is set at hero (300–500), not "' + r.scale + '"');
      if (!HERO_MOVES.has(r.typeMove)) e.push(tag + '.typeMove: a hero is set with ' + [...HERO_MOVES].join('/') + ', not a pair or a label');
      if (!HERO_MATERIALS.has(r.material)) e.push(tag + '.material: a hero title is made of paper/ink/metal/print, not "flat"');
      if (designChars(r) > 6) e.push(tag + '.words: a hero title is six characters at most (it is a block, not a sentence)');
      if (['evidence-card', 'map-table'].includes(r.composition)) e.push(tag + '.composition: a hero over ' + r.composition + ' — the title is its own composition (title-footage / hero-object / figure-card)');
    }
    if (r.moment === 'evidence' && !['evidence-card', 'figure-card', 'split-compare'].includes(r.composition)) e.push(tag + '.composition: evidence is shown as evidence-card/figure-card/split-compare, not "' + r.composition + '"');
    if (r.moment === 'data' && !['count-field', 'figure-card', 'map-table', 'queue', 'sequence-line'].includes(r.composition)) e.push(tag + '.composition: data is count-field/figure-card/map-table/queue/sequence-line, not "' + r.composition + '"');
    if (r.moment === 'diagram' && r.composition !== 'custom' && r.composition !== 'hero-object') e.push(tag + '.composition: a diagram is "custom" (its picture told in full) or hero-object');
    if (r.moment === 'data' && r.scale === 'hero') e.push(tag + '.scale: data is a figure/title, not a hero (hero is for a title)');
    // a material is a colour on a ground: light paper on a light ground disappears; dark ink on a dark ground disappears
    const darkGround = ['place-dark', 'halftone-dark'].includes(r.ground && r.ground.kind);
    const lightGround = ['paper-light', 'chart-table'].includes(r.ground && r.ground.kind);
    if (r.material === 'paper' && lightGround) e.push(tag + '.material: paper on a ' + (r.ground && r.ground.kind) + ' ground is light on light (use ink/print, or a dark ground)');
    if (r.material === 'ink' && !INK_TONES.includes(r.ink)) e.push(tag + '.ink: an ink title says its colour (dark/light/red) — one of ' + INK_TONES.join(', '));
    if (r.material === 'ink' && darkGround && r.ink === 'dark') e.push(tag + '.ink: dark ink on a dark ground disappears (use light/red ink, or paper)');
    if (r.material === 'ink' && lightGround && r.ink === 'light') e.push(tag + '.ink: light ink on a light ground disappears (use dark ink)');
  }
  return e;
}

// the film's mix: rare heroes, alternating grounds, no composition three in a row, light/dark and materials present
export function momentMixErrors(rows, beats) {
  const R = (beats || []).map((b) => (rows || []).find((r) => r.beat === b)).filter((r) => r && r.moment != null);
  if (!R.length) return [];
  const e = [], n = R.length;
  const heroes = R.filter((r) => r.moment === 'hero');
  const maxHeroes = Math.max(1, Math.ceil(n * 0.25));
  if (heroes.length < 1) e.push('mix: no hero beat in ' + n + ' (a film needs at least one 300–500px title)');
  if (heroes.length > maxHeroes) e.push('mix: ' + heroes.length + ' heroes in ' + n + ' (at most ' + maxHeroes + '; a hero is rare)');
  for (let i = 1; i < R.length; i++) if (R[i].moment === 'hero' && R[i - 1].moment === 'hero') e.push('mix: heroes back to back at ' + R[i - 1].beat + '/' + R[i].beat + ' (a hero does not follow a hero)');
  for (let i = 3; i < R.length; i++) {
    const g = R.slice(i - 3, i + 1).map((r) => r.ground && r.ground.kind);
    if (g[0] && g.every((x) => x === g[0])) e.push('mix: four ' + g[0] + ' grounds in a row at ' + R[i].beat + ' (deep and light grounds alternate)');
    const c = R.slice(i - 3, i + 1).map((r) => r.composition);
    if (c[0] && c.every((x) => x === c[0])) e.push('mix: ' + c[0] + ' four times in a row at ' + R[i].beat + ' (the composition rotates)');
  }
  const light = R.filter((r) => LIGHT_GROUNDS.has(r.ground && r.ground.kind)).length / n;
  if (light < 0.15 || light > 0.5) e.push('mix: light grounds ' + Math.round(light * 100) + '% of the film (15–50%: a film alternates paper and dark)');
  const layouts = [...new Set(R.map((r) => r.typeLayout))].filter(Boolean);
  if (layouts.length && layouts.length < 3) e.push('mix: only ' + layouts.length + ' type layouts (' + layouts.join(', ') + '); a film rotates block/vertical/edge/centre (three at least)');
  if (layouts.length && !layouts.includes('vertical')) e.push('mix: no vertical column in the film (Gawx sets a big word as a vertical column at least once)');
  for (let i = 2; i < R.length; i++) {
    const l = R.slice(i - 2, i + 1).map((r) => r.typeLayout);
    if (l[0] && l.every((x) => x === l[0])) e.push('mix: ' + l[0] + ' three beats in a row at ' + R[i].beat + ' (the layout rotates)');
  }
  const made = R.filter((r) => ['paper', 'ink', 'metal', 'print'].includes(r.material)).length / n;
  if (made < 0.3) e.push('mix: only ' + Math.round(made * 100) + '% of beats plan a material title (30% at least: paper/ink/metal/print, not all flat)');
  return e;
}

export function designMix(rows, beats) {
  const R = (beats || []).map((b) => (rows || []).find((r) => r.beat === b)).filter((r) => r && r.moment != null);
  const count = (k, f) => R.filter(f).length;
  return {
    beats: R.length,
    heroes: count('hero', (r) => r.moment === 'hero'),
    evidence: count('evidence', (r) => r.moment === 'evidence'),
    data: count('data', (r) => r.moment === 'data'),
    diagram: count('diagram', (r) => r.moment === 'diagram'),
    object: count('object', (r) => r.moment === 'object'),
    transition: count('transition', (r) => r.moment === 'transition'),
    lightShare: R.length ? count('light', (r) => LIGHT_GROUNDS.has(r.ground && r.ground.kind)) / R.length : 0,
    materialShare: R.length ? count('made', (r) => ['paper', 'ink', 'metal', 'print'].includes(r.material)) / R.length : 0,
    moves: [...new Set(R.map((r) => r.typeMove))],
  };
}
