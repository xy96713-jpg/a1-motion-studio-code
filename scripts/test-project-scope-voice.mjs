import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { stepVoice, voiceState } from '../apps/studio-next/src/lib/recipe-board/voice.mjs';
import { runProject } from '../apps/studio-next/src/lib/recipe-board/run.mjs';

const scratch = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'rb-scope-voice-'));
try {
  const repo = process.cwd(), data = path.join(scratch, 'work/recipe-board-v1');
  fs.mkdirSync(path.join(data, 'projects'), { recursive: true });
  for (const name of ['routing', 'recipes', 'themes', 'prompts', 'worlds']) {
    const src = path.join(repo, 'work/recipe-board-v1', name);
    if (fs.existsSync(src)) fs.symlinkSync(src, path.join(data, name));
  }
  const cfg = boardConfig({ RECIPE_BOARD_REPO_ROOT: scratch, RECIPE_BOARD_SOURCE_ROOT: repo, RECIPE_BOARD_NAS_OUTPUT_ROOT: '' });
  const bin = path.join(scratch, 'bin'), marker = path.join(scratch, 'provider-called');
  fs.mkdirSync(bin); fs.writeFileSync(path.join(bin, 'say'), `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 });
  const oldPath = process.env.PATH; process.env.PATH = `${bin}:${oldPath}`;
  function fixture(id, scope) {
    const dir = path.join(data, 'projects', id); fs.mkdirSync(dir);
    const project = { id, voice: { tts: true }, ...(scope === undefined ? {} : { scope }) };
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(project));
    fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ beats: [{ id: 'B01', text: 'hello' }] }));
    return dir;
  }
  const dir = fixture('stills', 'STILLS_ONLY');
  fs.mkdirSync(path.join(dir, 'voice')); fs.writeFileSync(path.join(dir, 'voice', 'tts.m4a'), 'preserve');
  assert.throws(() => stepVoice(cfg, 'stills'), /STILLS_ONLY/);
  assert.equal(fs.readFileSync(path.join(dir, 'voice', 'tts.m4a'), 'utf8'), 'preserve');
  assert.equal(fs.existsSync(marker), false);
  process.env.PATH = oldPath;
  const logs = [];
  const report = await runProject(cfg, 'stills', { dry: true, log: x => logs.push(x) });
  assert.equal(report.state.voice.state, 'scope-restricted');
  assert.match(logs.join('\n'), /voice.*STILLS_ONLY/i);
  const restricted = await runProject(cfg, 'stills', { from: 'voice', to: 'voice', log: () => {} });
  assert.equal(restricted.state.voice.state, 'scope-restricted');
  assert.equal(fs.readFileSync(path.join(dir, 'voice', 'tts.m4a'), 'utf8'), 'preserve');
  assert.equal(fs.existsSync(marker), false);
  const env = { ...process.env, PATH: `${bin}:${oldPath}`, RECIPE_BOARD_REPO_ROOT: scratch, RECIPE_BOARD_SOURCE_ROOT: repo, RECIPE_BOARD_NAS_OUTPUT_ROOT: '' };
  const script = path.join(repo, 'scripts/recipe-board.mjs');
  const dry = spawnSync(process.execPath, [script, 'run', '--dry', '--json', '--project', 'stills'], { encoding: 'utf8', env });
  assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /voice:.*STILLS_ONLY/);
  assert.equal(JSON.parse(dry.stdout.trim().split('\n').at(-1)).state.voice.state, 'scope-restricted');
  const cli = spawnSync(process.execPath, [script, 'voice', '--project', 'stills'], { encoding: 'utf8', env });
  assert.notEqual(cli.status, 0); assert.match(cli.stderr, /STILLS_ONLY/);
  assert.equal(fs.existsSync(marker), false);
  process.env.PATH = `${bin}:${oldPath}`;
  for (const [id, scope] of [['ordinary', 'RESEARCH_ONLY'], ['legacy', undefined]]) {
    fixture(id, scope); assert.equal(voiceState(cfg, id).state, 'due');
    assert.throws(() => stepVoice(cfg, id), /say failed/);
    assert.equal(fs.existsSync(marker), true); fs.rmSync(marker);
  }
  process.env.PATH = oldPath;
  console.log('project scope voice: OK');
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
