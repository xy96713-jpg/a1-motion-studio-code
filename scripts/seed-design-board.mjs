#!/usr/bin/env node
// Seed a design board from design-options; frames/motion stay TODO until built.
import fs from 'node:fs';
import path from 'node:path';
export function seedBoard({ options, project, line, visualThesis, previewDir }) {
  const dirs = (options?.options || []).map((o) => ({
    id: o.id,
    thesis: o.thesis,
    medium: o.direction,
    composition: o.composition,
    reproduction: o.reproduction || null,
    build: o.build,
    reference: previewDir ? path.posix.join(previewDir, 'opt-' + (Number(String(o.id).replace(/\D/g, '')) || 1) + '.png') : '',
    frame: '',
    motion: '',
    checks: { composite: 'pending' },
    status: 'draft',
  }));
  return {
    contract: 'A1DesignBoard/v2', project: project || '', line: line || options?.shot || '',
    visualThesis: visualThesis || 'TODO: one visual thesis from the brief',
    world: {
      name: 'TODO: world name',
      space: 'TODO: space/material',
      material: 'TODO: material surface',
      light: 'TODO: key/fill/rim',
      cameraGrammar: 'TODO: lens/height/move',
      typeSystem: 'TODO: type scale/place/relation',
      seamGrammar: 'TODO: seam types/motives',
    },
    worldTest: null, heroAsset: null,
    directions: dirs, selected: null, userDecision: null, lookLock: null,
    sourceOptions: options?.contract || null,
  };
}
function opt(argv, k, d) { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }
export function main(argv = process.argv.slice(2)) {
  const optionsFile = opt(argv, '--options', 'work/recipe-board-v1/projects/banana-design/design-options.json');
  const out = opt(argv, '--out');
  if (!out) { console.error('usage: seed-design-board.mjs --options design-options.json --out design-board.json [--project id] [--visual-thesis "..."] [--preview-dir path]'); return 2; }
  const options = JSON.parse(fs.readFileSync(optionsFile, 'utf8'));
  if ((options.options || []).length < 6) { console.error('SEED FAIL: options < 6'); return 1; }
  const board = seedBoard({ options, project: opt(argv, '--project'), line: opt(argv, '--line'), visualThesis: opt(argv, '--visual-thesis'), previewDir: opt(argv, '--preview-dir') });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(board, null, 1) + '\n');
  console.log('SEEDED: ' + board.directions.length + ' directions -> ' + out);
  return 0;
}
if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) process.exit(main());
