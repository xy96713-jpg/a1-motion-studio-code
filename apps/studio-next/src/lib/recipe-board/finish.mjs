// The film's finish (film.py): a whole cut graded and textured as one strip of film, after its pieces are joined (the
// white model, out/animatic.mp4; the reel, out/reel.mp4), so chapters and cards share one grain, one grade, one lens.
// The user 2026-10-27: 客观研究透博主这种风格 … 胶片模拟什么的 (Gawx Art and the creators who work as he does);
// measured in style-lab/RESEARCH-film-finish-20261027.md. A film made on the six-stage line takes it by default;
// project.json `finish` (or the style's) says otherwise: { kind: 'film', preset: 'gawx' | 'soft' } or { kind: 'none' }.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadProject } from './store.mjs';
import { assertScopeAllows } from './project-scope.mjs';
import { readStyle } from './filmlook.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FINISH_PRESETS = ['gawx', 'soft'];

// (pure) the finish a project takes
export function finishFor(project = {}, style = null) {
  const f = project.finish ?? style?.finish ?? (project.process === 'six-stage' ? { kind: 'film', preset: 'gawx' } : null);
  if (!f || f.kind !== 'film') return null;
  return { kind: 'film', preset: FINISH_PRESETS.includes(f.preset) ? f.preset : 'gawx' };
}
export function finishOf(cfg, id) {
  let project = {};
  try { project = loadProject(cfg, id) || {}; } catch { return null; }
  return finishFor(project, readStyle(cfg, project.style));
}

const probe = (file, entries) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', entries, '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();
const codeHash = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(HERE, 'film.py'))).update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16);

// grade a joined cut in place (its sound kept); the clean cut stays beside it as <name>.clean.mp4 for the checks
export function applyFinish(cfg, id, file, { log = () => {} } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'final');
  const f = finishOf(cfg, id);
  if (!f || !fs.existsSync(file)) return null;
  const clean = file.replace(/\.mp4$/, '.clean.mp4');
  fs.renameSync(file, clean);
  const [w, h] = probe(clean, 'stream=width,height').split(',').map(Number), fps = probe(clean, 'stream=r_frame_rate');
  const tmp = file.replace(/\.mp4$/, '.grading.mp4');
  const t0 = Date.now();
  execFileSync('bash', ['-c', 'set -o pipefail; ffmpeg -loglevel error -i "$1" -f rawvideo -pix_fmt rgb24 - | python3 "$2" stream "$3" "$4" --preset "$5" | ffmpeg -loglevel error -y -f rawvideo -pix_fmt rgb24 -s "$3"x"$4" -r "$6" -i - -i "$1" -map 0:v -map "1:a?" -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -c:a copy -shortest "$7"',
    'finish', clean, path.join(HERE, 'film.py'), String(w), String(h), f.preset, fps, tmp], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 16 << 20 });
  fs.renameSync(tmp, file);
  fs.writeFileSync(file.replace(/\.mp4$/, '.finish.json'), JSON.stringify({ ...f, code: codeHash(), source: path.basename(clean), at: new Date().toISOString() }, null, 1) + '\n');
  log(`  finish: film (${f.preset}) over ${path.basename(file)} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return f;
}
