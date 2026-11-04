#!/usr/bin/env node
// Measure whether a built frame still matches the locked reference.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
export function compareFiles(locked, render, { minSsim = 0.55 } = {}) {
  const errors = [];
  if (!locked || !fs.existsSync(locked)) errors.push('locked reference missing: ' + locked);
  if (!render || !fs.existsSync(render)) errors.push('render missing: ' + render);
  if (errors.length) return { ok: false, ssim: null, minSsim, errors };
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', locked, '-i', render, '-lavfi', '[0:v]scale=960:540[a];[1:v]scale=960:540[b];[a][b]ssim', '-f', 'null', '-'], { encoding: 'utf8' });
  const text = (r.stdout || '') + (r.stderr || '');
  const m = text.match(/All:([0-9.]+)/);
  if (!m) return { ok: false, ssim: null, minSsim, errors: ['cannot parse ssim; ffmpeg exit ' + r.status] };
  const ssim = Number(m[1]);
  if (!Number.isFinite(ssim)) return { ok: false, ssim, minSsim, errors: ['ssim not finite'] };
  if (ssim < minSsim) errors.push('ssim ' + ssim.toFixed(3) + ' below ' + minSsim);
  return { ok: errors.length === 0, ssim, minSsim, errors };
}
function opt(argv, k, d) { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }
export function main(argv = process.argv.slice(2)) {
  const locked = opt(argv, '--locked');
  const render = opt(argv, '--render');
  const minSsim = Number(opt(argv, '--min-ssim', '0.55'));
  const r = compareFiles(locked, render, { minSsim });
  console.log(JSON.stringify(r, null, 1));
  return r.ok ? 0 : 1;
}
if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) process.exit(main());