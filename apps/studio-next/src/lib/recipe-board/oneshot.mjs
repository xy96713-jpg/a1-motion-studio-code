// One-shot acceptance: a hero shot is decided on its target frame and a blind A/B, not on how many
// checks it passes. The target is the approved picture; the proof is the new render. If the proof does
// not win the blind review and clear the pass bar on every dimension, the target stays — and the
// experiment is over (no third variant of the same shortcut).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { projectPaths } from './store.mjs';

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
export const ONESHOT_CONTRACT = 'A1RecipeBoardOneShot/v1';
export const ONESHOT_MIN = 4;

const mean = (o) => { const v = Object.values(o || {}).filter((x) => Number.isFinite(x)); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null; };
const min = (o) => { const v = Object.values(o || {}).filter((x) => Number.isFinite(x)); return v.length ? Math.min(...v) : null; };

// blind: { target: { scores: { ... } }, proof: { scores: { ... } }, better: 'target' | 'proof' }
export function oneShotDecision({ target, proof, blind, minScore = ONESHOT_MIN } = {}) {
  const e = [];
  for (const [name, x] of [['target', target], ['proof', proof]]) {
    if (!x?.file || !fs.existsSync(x.file)) e.push(`${name}: file does not exist`);
    else if (x.hash && x.hash !== sha256(x.file)) e.push(`${name}: hash does not match the bytes`);
  }
  const ts = blind?.target?.scores, ps = blind?.proof?.scores;
  if (!ts || !ps) e.push('blind: both target and proof need scores');
  if (!['target', 'proof'].includes(blind?.better)) e.push('blind.better: target or proof');
  if (e.length) return { contract: ONESHOT_CONTRACT, decision: 'rejected', errors: e };
  const tm = mean(ts), pm = mean(ps), pmin = min(ps), tmin = min(ts);
  const useProof = blind.better === 'proof' && pm >= minScore && pmin >= minScore;
  return {
    contract: ONESHOT_CONTRACT,
    decision: useProof ? 'use-proof' : 'keep-target',
    target: { file: target.file, hash: xhash(target) },
    proof: { file: proof.file, hash: xhash(proof) },
    blind: { targetMean: tm, targetMin: tmin, proofMean: pm, proofMin: pmin, better: blind.better, minScore },
    why: useProof
      ? `the proof wins the blind review and every dimension is ${minScore} or more (mean ${pm})`
      : `the target stays: proof mean ${pm}, lowest ${pmin} (the bar is ${minScore} on every dimension); ${blind.better === 'target' ? 'the blind review prefers the target' : 'the proof did not win'}`,
    stopRule: 'do not try a third variant of the same shortcut; change the route or keep the target',
  };
}

const xhash = (x) => x.hash || sha256(x.file);

export function stepOneShot(cfg, id, beat, { target, proof, blind } = {}, { log = console.log } = {}) {
  if (!beat) throw new Error('oneshot: --beat <Bxx>');
  const p = projectPaths(cfg, id);
  const decision = oneShotDecision({ target: { file: path.resolve(target || ''), hash: null }, proof: { file: path.resolve(proof || ''), hash: null }, blind });
  const out = path.join(p.out, 'oneshot'); fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${beat}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...decision, project: id, beat, at: new Date().toISOString() }, null, 2) + '\n');
  log(`  oneshot ${beat}: ${decision.decision}${decision.errors ? ` (${decision.errors.join('; ')})` : ` — ${decision.why}`}`);
  return { ...decision, file };
}
