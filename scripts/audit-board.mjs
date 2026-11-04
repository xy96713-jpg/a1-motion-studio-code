#!/usr/bin/env node
// Board contrast audit: node scripts/audit-board.mjs --manifest <json> [--out report.json]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const manifest = get('manifest'); if (!manifest) { console.error('usage: --manifest <json> [--out report.json]'); process.exit(2); }
const dir = path.dirname(path.resolve(manifest));
const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
const rows = [];
for (const f of m.frames || []) {
  const png = path.isAbsolute(f.png) ? f.png : path.join(dir, f.png);
  const r = spawnSync('node', [path.join(path.dirname(new URL(import.meta.url).pathname), 'audit-contrast.mjs'), '--png', png, '--box', f.box.join(','), '--label', f.label, ...(f.large ? ['--large'] : [])], { encoding: 'utf8' });
  let row; try { row = JSON.parse(r.stdout); } catch { row = { png, label: f.label, pass: false, ratio: 0, error: r.stderr }; }
  rows.push(row);
}
const report = { contract: 'A1ContrastAudit/v1', frames: rows, passed: rows.filter((x) => x.pass).length, failed: rows.filter((x) => !x.pass).length };
const out = get('out'); if (out) fs.writeFileSync(out, JSON.stringify(report, null, 1));
for (const r of rows) console.log((r.pass ? 'PASS' : 'FAIL'), r.label, 'ratio', r.ratio, 'need', r.need);
console.log('passed', report.passed, '/', rows.length);
process.exit(report.failed ? 1 : 0);
