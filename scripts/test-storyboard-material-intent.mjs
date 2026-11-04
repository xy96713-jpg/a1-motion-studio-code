import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { stepStoryboard } from '../apps/studio-next/src/lib/recipe-board/storyboard.mjs';
import { toNeed } from '../apps/studio-next/src/lib/recipe-board/writer.mjs';

const Ajv = createRequire(new URL('../apps/studio-next/package.json', import.meta.url))('ajv');
const original = boardConfig();
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));

test('generated manual storyboard task exposes executable evidence choices', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storyboard-intent-'));
  try {
    const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
    for (const item of fs.readdirSync(original.dataDir)) if (item !== 'projects') fs.symlinkSync(path.join(original.dataDir, item), path.join(dataDir, item));
    const id = 'banana-design', dir = path.join(dataDir, 'projects', id); fs.mkdirSync(dir, { recursive: true });
    for (const file of ['project.json', 'plan.json', 'brief.json']) fs.copyFileSync(path.join(original.dataDir, 'projects', id, file), path.join(dir, file));
    const cfg = { ...original, dataDir, nasOutputRoot: null };
    const result = await stepStoryboard(cfg, id, { agent: 'manual' });
    assert.notEqual(result.state, 'blocked', result.reason);
    const task = read(path.join(dir, 'tasks/storyboard.task.json'));
    const rules = (Array.isArray(task.rules) ? task.rules : [task.rules]).map(p => fs.readFileSync(path.join(cfg.repoRoot, p), 'utf8')).join('\n');
    assert.match(rules, /素材意图/);
    assert.match(rules, /截图不能当.*录屏/);
    const schema = read(path.join(cfg.repoRoot, task.schema));
    const validate = new Ajv({ allErrors: true }).compile(schema.properties.shots.items.properties.evidence.items);
    const beat = { text: 'fixture', onScreen: { keywords: [] } };
    for (const [kind, form] of [['event','video'], ['place','photo'], ['org','webpage'], ['software','recording']]) {
      const e = { kind, form, what: '真实画面', entity: 'subject', queryEn: 'subject historical footage' };
      assert.ok(validate(e), JSON.stringify(validate.errors));
      const n = toNeed('B01', { ...e, original: e.what, slot: 'background' }, beat);
      assert.equal(n.form, form);
      if (form === 'video') { assert.notDeepEqual(n.preferredMedia, ['IMAGE']); assert.deepEqual(n.youtube, [e.queryEn]); }
      if (form === 'photo') assert.deepEqual(n.preferredMedia, ['IMAGE']);
      if (form === 'webpage') assert.equal(n.page.queryEn, e.queryEn);
      if (form === 'recording') assert.equal(n.kind, 'presenter');
    }
    const legacy = toNeed('B01', { kind: 'event', original: '旧素材', slot: 'background', queryEn: 'old footage' }, beat);
    assert.equal(legacy.form, undefined); assert.deepEqual(legacy.youtube, ['old footage']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
