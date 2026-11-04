// How the line is doing, in numbers (user, 2026-10-23: 怎么反复有问题 能不能做到没问题最优呢): per passage, the shots
// reviewed, the versions a shot took before it passed (or so far), the share that passed their first review, and the
// scorecard items the reviews still name. Read from the passages' reviews (layers.mjs), nothing written.
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths } from './store.mjs';

// (pure) one passage's reviews { hash: { shot, verdict, by, at, problems } } -> its numbers
export function passageMetrics(reviews) {
  const byShot = {};
  for (const v of Object.values(reviews || {})) if (v && v.shot) (byShot[v.shot] ||= []).push(v);
  const items = {};
  let versions = 0, first = 0, passed = 0;
  for (const list of Object.values(byShot)) {
    list.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
    versions += list.length; if (list[0].verdict === 'pass') first++; if (list.at(-1).verdict === 'pass') passed++;
    for (const v of list) if (v.verdict === 'fix' && v.by !== 'code') for (const p of v.problems || []) { const m = String(p.say || '').match(/^\s*\[([a-z-]+)\]/); const k = m ? m[1] : `(${p.kind})`; items[k] = (items[k] || 0) + 1; }
  }
  const n = Object.keys(byShot).length;
  return { shots: n, versions: n ? +(versions / n).toFixed(1) : 0, firstPass: n ? +(first / n).toFixed(2) : 0, passing: passed, items };
}
export function lineMetrics(cfg, id) {
  const root = path.join(projectPaths(cfg, id).out, 'passages'), out = {};
  for (const seg of fs.existsSync(root) ? fs.readdirSync(root) : []) { const f = path.join(root, seg, 'reviews.json'); if (fs.existsSync(f)) out[seg] = passageMetrics(JSON.parse(fs.readFileSync(f, 'utf8'))); }
  return out;
}
