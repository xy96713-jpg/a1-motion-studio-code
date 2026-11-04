// Art templates: a theme says which parts of each card are generated art, so written shots get
// layered art without anyone writing prompts per shot.
//
// Theme JSON:
//   artLibrary: { "<name>": { prompt, refs?, transparent?, size?, trim?, defaults? } }
//     prompt may hold {subject} (the slot's `gen` description) and other {field} placeholders, filled
//     from the slot's own fields (e.g. a poster card's `tint`) or the template's `defaults`.
//   artPlan: { "<card>": { "<slot>": "<name>", "<slot>.plate": "<name>", "backdrop": "<name>" } }
//   an entry may be { use: "<name>", fill: { ink } } to also set slot fields the art needs (dark ink on paper)
//
// Rules (SYSTEM_MAP 画面分工): art never replaces a fact, and never depicts a real person (templates whose
// subject comes from a description must say so in their prompt). An image slot gets art only when it has no
// real material (asset, video, screenshot) and no material need other than stock footage is bound to
// it; {subject} comes from the slot's `gen` description, and without one the slot is left alone.
// Panels (card faces) and plates (paper under text) are pure style and always take their template.
// Applied art carries `template: "<name>"`; re-applying refreshes those and never touches hand-written art.
import fs from 'node:fs';
import path from 'node:path';
import { loadRecipe, loadShots, loadTheme, projectPaths, projectTheme } from './store.mjs';

const isTemplated = (art) => !!art?.template;
// Fact slots are named "<slot>" in the first scene and "<scene>:<slot>" in later ones.
export const factKey = (scene, slot) => (scene ? `${scene}:${slot}` : slot);
const hasMaterial = (fill) => !!(fill && (fill.asset || fill.video || fill.screenshot));

function artFrom(library, ref, subject, fields = {}) {
  const name = typeof ref === 'string' ? ref : ref?.use;
  const base = library[name];
  if (!base) throw new Error(`art template not in theme artLibrary: ${name}`);
  const { use, fill, ...over } = typeof ref === 'object' ? ref : {};
  const { defaults = {}, ...rest } = { ...base, ...over };
  const art = { ...rest, template: name };
  if (art.prompt.includes('{subject}')) {
    if (!subject) return null;
    art.prompt = art.prompt.replaceAll('{subject}', subject);
  }
  // card colours are light tints with dark type on them (the reference's 闭源 / 开源 cards): a bare
  // "red" or "green" from the writer would come back saturated and swallow black type
  const SOFT = { red: 'soft salmon red', green: 'soft lime green', blue: 'soft powder blue', yellow: 'soft butter yellow', orange: 'soft apricot', black: 'charcoal grey' };
  art.prompt = art.prompt.replace(/\{(\w+)\}/g, (m, k) => (k === 'tint' && SOFT[String(fields[k]).toLowerCase()]) || fields[k] || defaults[k] || m);
  return art;
}

// art written by hand (an object, not from a template); a string the writer copied from an example is not art
const ownArt = (a) => !!a && typeof a === 'object' && !isTemplated(a);

// Apply a card's templates to one slots object (top level or a scene). Returns what changed.
function applyToSlots(recipe, slots, plan, library, factSlots, scene = 0) {
  const changed = [];
  for (const [key, ref] of Object.entries(plan)) {
    if (key === 'backdrop') continue;
    const [name, part] = key.split('.');
    const slot = recipe.slots[name];
    if (!slot) continue;
    let fill = slots[name];
    // a plan entry set to null takes the inherited part away, and a plate it once laid goes with it (a world theme drops
    // the base's torn-paper strips: the user 2026-10-25, 之后也不要这种纸条撕纸设计)
    if (ref == null) { if (part === 'plate' && fill && typeof fill === 'object' && fill.plate && isTemplated(fill.plate.art)) { delete fill.plate; delete fill.ink; changed.push(key); } continue; }   // (its ink was the plate's: dark words left on the dark ground)
    if (part === 'plate') {
      if (!fill) continue;
      if (typeof fill === 'string') fill = slots[name] = { text: fill };
      if (ownArt(fill.plate?.art)) continue;
      const art = artFrom(library, ref);
      fill.plate = { ...(fill.plate || {}), art };
      if (typeof ref === 'object' && ref.fill) Object.assign(fill, ref.fill);
      changed.push(key);
    } else if (slot.kind === 'panel') {
      if (fill?.color || ownArt(fill?.art)) continue;
      slots[name] = { ...(fill || {}), art: artFrom(library, ref) };
      changed.push(key);
    } else if (slot.kind === 'image') {
      if (hasMaterial(fill) || factSlots.has(factKey(scene, name)) || ownArt(fill?.art)) continue;
      const art = artFrom(library, ref, fill?.gen, fill || {});
      if (!art) continue;
      slots[name] = { ...(fill || {}), art };
      changed.push(key);
    }
  }
  return changed;
}

// The art plan for one shot: mutates and returns the list of applied keys.
// A scene with its own card uses that card's plan (`recipeFor` loads it).
export function applyArtTemplates(recipe, shot, theme, { factSlots = new Set(), recipeFor = null } = {}) {
  const library = theme.artLibrary || {};
  const plan = theme.artPlan?.[shot.recipe] || {};
  shot.slots ||= {};
  const changed = applyToSlots(recipe, shot.slots, plan, library, factSlots);
  for (const [i, scene] of (shot.scenes || []).entries()) {
    if (!scene.slots) continue;
    const own = scene.recipe && scene.recipe !== shot.recipe && recipeFor;
    const scenePlan = own ? theme.artPlan?.[scene.recipe] || {} : plan;
    changed.push(...applyToSlots(own ? recipeFor(scene.recipe) : recipe, scene.slots, scenePlan, library, factSlots, i).map((k) => `scenes[${i}].${k}`));
  }
  if (plan.backdrop && (!shot.backdrop || isTemplated(shot.backdrop.art))) {
    shot.backdrop = { art: artFrom(library, plan.backdrop) };
    changed.push('backdrop');
  }
  return changed;
}

// A fact slot whose real picture was searched for round after round and never found (materials.mjs SEARCH_ROUNDS) is
// stood in, not left a TODO plate (the user 2026-10-27: 搜不到就多搜几轮 不行就3d展示概念或ai生图): art of what the slot
// shows, drawn in the film's own look and plainly an illustration, no person's face, no words; the card marks it 示意
// (compose.mjs standIn). A real picture bound later replaces it (materials.mjs bindShots writes the slot whole).
export function standInArt(what, look) {
  return { prompt: `${what}. An illustration in this film's look: ${look || 'quiet, graded, photographic light'}. Plainly a designed illustration, not a news photograph: simplified forms, the film's palette. No people's faces. Text-free, no words, no letters, no numbers, no logos.`, transparent: false, template: 'stand-in' };
}
export function standInSlots(shot, needs, gone, look) {
  const done = [];
  for (const n of needs) {
    const key = n.scene ? `${n.shotId}~${n.scene}` : n.shotId;
    if (n.shotId !== shot.shotId || !gone.has(key) || !n.bind || n.bind === 'backdrop') continue;
    const slots = n.scene ? shot.scenes?.[n.scene]?.slots : shot.slots;
    const fill = slots?.[n.bind];
    if (!slots || hasMaterial(fill) || (fill?.art && !isTemplated(fill.art))) continue;
    const what = (typeof fill === 'object' && fill?.gen) || n.original;
    if (fill?.art?.template === 'stand-in' && fill.art.prompt.startsWith(what)) continue;
    slots[n.bind] = { ...(typeof fill === 'object' ? fill : {}), art: standInArt(what, look), standIn: true };
    done.push(n.scene ? `scenes[${n.scene}].${n.bind}` : n.bind);
  }
  return done;
}

// Slots that hold facts: a bound material need of any kind except stock footage.
export function factSlotsByShot(cfg, id) {
  const file = path.join(projectPaths(cfg, id).root, 'materials', 'needs.json');
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const n of JSON.parse(fs.readFileSync(file, 'utf8')).needs || []) {
    if (n.kind === 'stock' || !n.bind) continue;
    (out[n.shotId] ||= new Set()).add(factKey(n.scene || 0, n.bind));
  }
  return out;
}

// Apply templates to every shot of a project (or `only`), writing changed shots back.
export async function fillProjectArt(cfg, id, { only, log = () => {} } = {}) {
  const themeId = projectTheme(cfg, id);
  const theme = loadTheme(cfg, themeId);
  const facts = factSlotsByShot(cfg, id);
  const p = projectPaths(cfg, id);
  const mdir = path.join(p.root, 'materials'), rj = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
  const needs = rj(path.join(mdir, 'needs.json'), { needs: [] }).needs || [];
  const gone = new Set(Object.entries(rj(path.join(mdir, 'rounds.json'), { needs: {} }).needs || {}).filter(([, r]) => r.gaveUp).map(([k]) => k));
  const look = gone.size ? (await import('./filmlook.mjs')).filmWorld(cfg, id)?.prompt : null;
  let shots = 0, pieces = 0;
  for (const shot of loadShots(cfg, id, only)) {
    const recipe = loadRecipe(cfg, shot.recipe, themeId);
    const before = JSON.stringify(shot);
    const changed = applyArtTemplates(recipe, shot, theme, { factSlots: facts[shot.shotId], recipeFor: (r) => loadRecipe(cfg, r, themeId) });
    if (gone.size) changed.push(...standInSlots(shot, needs, gone, look));
    if (!changed.length || JSON.stringify(shot) === before) continue;
    fs.writeFileSync(path.join(p.shots, `${shot.shotId}.json`), JSON.stringify(shot, null, 1) + '\n');
    shots++; pieces += changed.length;
    log(`${shot.shotId.padEnd(10)} ${shot.recipe.padEnd(22)} ${changed.join(', ')}`);
  }
  return { shots, pieces };
}
