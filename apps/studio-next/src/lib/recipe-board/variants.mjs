// Variants: the same card laid out more than one way, so a card that recurs in a film (a side card eight
// times) does not repeat itself. A recipe lists them (`variants`): `mirror` flips every slot left to right
// (a tilted prop tilts the other way); `slots` moves single slots (`box`, or `dy` / `dx` to shift one).
// The run gives each shot of such a card the next variant in turn, never the one its previous use had; a
// shot that names its own variant (`variant`, not `variantAuto`) keeps it.
// Also includes Variant Matrix & Whole-Film Anti-Repeat Solver (A1VariantMatrix/v1).
import fs from 'node:fs';
import path from 'node:path';
import { loadShots, projectPaths, readPlan } from './store.mjs';

const mirrorBox = ([x, y, w, h]) => [+(1 - x - w).toFixed(4), y, w, h];
export function applyVariant(recipe, name) {
  const v = recipe.variants?.[name];
  if (!v) return recipe;
  const slots = {};
  const anchor = v.anchor && recipe.slots[v.anchor]?.box;
  const anchorTo = anchor && mirrorBox(anchor);
  for (const [k, s0] of Object.entries(recipe.slots)) {
    let s = { ...s0 };
    if (v.mirror && anchor && k !== 'background') {
      s.box = [+(anchorTo[0] + (s0.box[0] - anchor[0])).toFixed(4), s0.box[1], s0.box[2], s0.box[3]];
      for (const key of ['boxWith', 'boxWithFact']) if (s[key]) s[key] = Object.fromEntries(Object.entries(s[key]).map(([o, b]) => [o, [+(anchorTo[0] + (b[0] - anchor[0])).toFixed(4), b[1], b[2], b[3]]]));
    } else if (v.mirror && k !== 'background') {
      s.box = mirrorBox(s.box);
      if (s.rotate) s.rotate = -s.rotate;
      if (s.align === 'left') s.align = s.alignMirror || 'left';
      for (const key of ['boxWith', 'boxWithFact']) if (s[key]) s[key] = Object.fromEntries(Object.entries(s[key]).map(([o, b]) => [o, mirrorBox(b)]));
    }
    const o = v.slots?.[k];
    if (o) {
      const { dx = 0, dy = 0, ...rest } = o;
      s = { ...s, ...rest, box: rest.box || [+(s.box[0] + dx).toFixed(4), +(s.box[1] + dy).toFixed(4), s.box[2], s.box[3]] };
    }
    slots[k] = s;
  }
  return { ...recipe, slots, variant: name };
}

export function assignVariants(cfg, id, { recipeFor }) {
  const order = new Map((readPlan(cfg, id)?.beats || []).map((b, i) => [b.id, i]));
  const shots = loadShots(cfg, id).sort((a, b) => (order.get(a.shotId) ?? 1e9) - (order.get(b.shotId) ?? 1e9));
  const last = {};
  const changed = [];
  for (const shot of shots) {
    const recipe = recipeFor(shot.recipe);
    const names = Object.keys(recipe?.variants || {});
    if (!names.length) continue;
    let pick = shot.variant;
    if (!pick || shot.variantAuto) {
      const prev = last[shot.recipe];
      const i = prev == null ? 0 : (names.indexOf(prev) + 1) % names.length;
      pick = names[i];
    }
    last[shot.recipe] = pick;
    if (shot.variant !== pick) {
      const file = path.join(projectPaths(cfg, id).shots, `${shot.shotId}.json`);
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      raw.variant = pick; raw.variantAuto = true;
      fs.writeFileSync(file, JSON.stringify(raw, null, 1) + '\n');
      changed.push(`${shot.shotId}:${pick}`);
    }
  }
  return changed;
}

const readJson = (f, d = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};

export function loadVariantMatrix(cfg) {
  if (!cfg?.dataDir) return null;
  return readJson(path.join(cfg.dataDir, 'routing', 'variant-matrix.json'), null);
}

export function inferSemanticAct(beat = {}, index = 0, total = 20) {
  const explicit = beat.semanticAct || beat.storyboardAct;
  const known = new Set([
    'phenomenon', 'name', 'ratio', 'mechanism', 'cause',
    'evidence', 'sequence', 'compare', 'turn', 'consequence', 'breath', 'close',
  ]);
  if (explicit && known.has(explicit)) return explicit;

  const text = String(beat.text ?? beat.narration ?? '');
  const why = String(beat.why ?? '');
  const combined = `${text}\n${why}`;

  if (index === 0 || beat.act === 'open') return 'phenomenon';
  if (index === total - 1 || beat.act === 'close') return 'close';
  if (beat.act === 'release' || /再来一次|再换一次|浩大的工程/.test(combined)) return 'breath';
  if (/隔离|育种|两条路|不堪一击|历史重演|和当年.*一样/.test(combined)) return 'compare';
  if (beat.act === 'turn' || /同样是克隆|换种|原地换/.test(combined)) {
    return /换种|更换|大麦克.*卡文迪什/.test(combined) && !/同样是克隆/.test(combined) ? 'compare' : 'turn';
  }
  if (/(?:\d+(?:\.\d+)?\s*(?:%|％|公顷|亿|万))/.test(text)) {
    if (/公顷/.test(text) && /洪都拉斯|河谷/.test(combined)) return 'sequence';
    if (/毁|受影响|168\.5/.test(combined)) return 'consequence';
    return 'ratio';
  }
  if (/宣布|紧急状态|已经发生过一次|报道|FoodNavigator/i.test(combined)) return 'evidence';
  if (/1990|2019|苏门答腊|马来西亚|哥伦比亚|首次确认/.test(combined)) return 'sequence';
  if (/吸芽|无可用种子|种子|一棵分一棵|繁殖/.test(combined)) return 'mechanism';
  if (/弱点|真菌|巴拿马病|克星|基因一样/.test(combined)) return 'cause';
  if (/卡文迪什|大麦克|品种|叫做|称为/.test(combined)) return 'name';

  return 'mechanism';
}

export function variantsForAct(actId, matrix) {
  if (!matrix?.acts) return null;
  const row = matrix.acts.find((a) => a.act === actId) || matrix.acts[0];
  return row ? { act: row.act, name: row.name, routeKind: row.routeKind, variants: row.variants } : null;
}

export function solveFilmVariants(beats = [], matrix = null, { preferredByBeat = {} } = {}) {
  if (!matrix?.acts?.length || !beats?.length) return [];
  const rules = matrix.budgetRules || {};
  const maxCarrier = rules.maxSameCarrierPerFilm ?? 2;
  const maxFamilyStreak = rules.maxConsecutiveSameFamily ?? 2;

  const carrierCounts = {};
  const familyHistory = [];
  const total = beats.length;

  return beats.map((b, idx) => {
    const id = b?.beat ?? b?.shotId ?? b?.id ?? `B${String(idx + 1).padStart(2, '0')}`;
    const act = inferSemanticAct(b, idx, total);
    const entry = variantsForAct(act, matrix);
    const variants = entry?.variants || {};
    const keys = Object.keys(variants);

    const preferred = preferredByBeat[id];
    let bestKey = keys[0] || 'A';
    let bestScore = -Infinity;

    for (const k of keys) {
      const v = variants[k];
      if (!v) continue;
      let score = 0;

      if (preferred === k) score += 100;

      const cCount = carrierCounts[v.carrier] || 0;
      if (cCount >= maxCarrier) score -= 50;
      else if (cCount === 1) score -= 8;

      const lastFam = familyHistory[familyHistory.length - 1];
      const prevFam = familyHistory[familyHistory.length - 2];
      if (lastFam && v.family !== lastFam) {
        score += 6;
      } else if (lastFam && prevFam && v.family === lastFam && v.family === prevFam && maxFamilyStreak <= 2) {
        score -= 25;
      }

      const keyIndex = keys.indexOf(k);
      if ((idx + keyIndex) % 3 === 0) score += 2;

      if (score > bestScore) {
        bestScore = score;
        bestKey = k;
      }
    }

    const chosen = variants[bestKey] || null;
    if (chosen?.carrier) {
      carrierCounts[chosen.carrier] = (carrierCounts[chosen.carrier] || 0) + 1;
    }
    if (chosen?.family) {
      familyHistory.push(chosen.family);
    }

    return {
      beat: id,
      semanticAct: act,
      actLabel: entry?.name || act,
      routeKind: entry?.routeKind || 'custom',
      chosenVariant: bestKey,
      chosen,
      alternatives: Object.fromEntries(keys.filter((k) => k !== bestKey).map((k) => [k, variants[k]])),
      allVariants: variants,
    };
  });
}

export function variantDiversityReport(solvedRows = [], matrix = null) {
  const maxCarrier = matrix?.budgetRules?.maxSameCarrierPerFilm ?? 2;
  const byCarrier = {};
  const byFamily = {};
  const warnings = [];

  for (const r of solvedRows) {
    const c = r?.chosen?.carrier || r?.carrier;
    const f = r?.chosen?.family || r?.family;
    if (c) (byCarrier[c] ||= []).push(r.beat);
    if (f) (byFamily[f] ||= []).push(r.beat);
  }

  for (const [c, list] of Object.entries(byCarrier)) {
    if (list.length > maxCarrier) {
      warnings.push(`carrier "${c}" used ${list.length} times (${list.join(', ')}) — exceeds budget of ${maxCarrier}`);
    }
  }

  return {
    totalBeats: solvedRows.length,
    uniqueCarriers: Object.keys(byCarrier).length,
    byCarrier,
    byFamily: Object.fromEntries(Object.entries(byFamily).map(([k, v]) => [k, v.length])),
    warnings,
  };
}
