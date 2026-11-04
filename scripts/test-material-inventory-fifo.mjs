import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { taskMaterialInventory } from '../apps/studio-next/src/lib/recipe-board/material-inventory.mjs';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-fifo-'));
try {
  const projects = path.join(base, 'projects'), root = path.join(projects, 'fixture');
  const materials = path.join(root, 'materials'), clips = path.join(materials, 'clips');
  fs.mkdirSync(clips, { recursive: true });
  const png = path.join(clips, 'valid.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xsAAAAASUVORK5CYII=', 'base64'));
  const secret = path.join(base, 'secret.png'); fs.writeFileSync(secret, 'PRIVATE-INVENTORY-SECRET');
  fs.writeFileSync(path.join(materials, 'bindings.json'), JSON.stringify({ shots: {
    B01: { file: png, kind: 'image' }, B02: { file: secret, kind: 'image' },
  } }));
  const fifo = path.join(root, 'project.json');
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
  assert.ok(fs.lstatSync(fifo).isFIFO());
  const moduleUrl = pathToFileURL(path.resolve(import.meta.dirname, '../apps/studio-next/src/lib/recipe-board/material-inventory.mjs')).href;
  const code = `import {taskMaterialInventory} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(taskMaterialInventory({dataDir:process.argv[1]},'fixture')))`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code, base], { encoding: 'utf8', timeout: 3000, killSignal: 'SIGKILL' });
  assert.ifError(child.error); assert.equal(child.status, 0, child.stderr);
  assert.ok(!child.stdout.includes('PRIVATE-INVENTORY-SECRET'));
  const result = JSON.parse(child.stdout);
  assert.equal(result.status, 'unverified');
  assert.equal(result.materials.B01[0].file, png);
  assert.deepEqual(result.materials.B01[0].metadata, { bytes: fs.statSync(png).size, width: 1, height: 1, format: 'png' });
  assert.equal(result.diagnostics.B02[0].status, 'unknown'); assert.equal(result.diagnostics.B02[0].file, null);
  for (const id of ['../x', '..', 'A', '', 'a/b', 'x'.repeat(65)]) assert.throws(() => taskMaterialInventory({dataDir: base}, id), /invalid project id/);
  fs.writeFileSync(path.join(projects, 'notdir'), 'x');
  assert.equal(taskMaterialInventory({dataDir: base}, 'notdir').status, 'unknown');
  fs.symlinkSync(root, path.join(projects, 'linked'));
  assert.equal(taskMaterialInventory({dataDir: base}, 'linked').status, 'unknown');
  const linkBase = path.join(base, 'linkbase'); fs.mkdirSync(linkBase); fs.symlinkSync(projects, path.join(linkBase, 'projects'));
  assert.equal(taskMaterialInventory({dataDir: linkBase}, 'fixture').status, 'unknown');
  console.log('PASS taskMaterialInventory FIFO and path boundaries');
} finally { fs.rmSync(base, { recursive: true, force: true }); }
