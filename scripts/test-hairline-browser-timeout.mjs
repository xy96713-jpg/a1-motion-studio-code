import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prepareFixedHairline } from '../apps/studio-next/src/lib/recipe-board/hairline-still.mjs';

test('a nonresponsive browser launch times out and is reaped', async () => {
  const root = await fs.mkdtemp(path.join(process.env.TMPDIR, 'hairline-hung-'));
  const executable = path.join(root, 'chrome');
  const pidFile = path.join(root, 'pid');
  const previous = process.env.CHROME_PATH;
  try {
    await fs.writeFile(executable, `#!/bin/sh\necho $$ > '${pidFile}'\nexec sleep 8\n`, {mode:0o700});
    process.env.CHROME_PATH = executable;
    const start = Date.now();
    await assert.rejects(prepareFixedHairline(root, {key:'hairline_test',figure:'exploded',phaseMs:192,intensity:0.8}, {timeoutMs:1500}), /timeout/i);
    assert(Date.now() - start < 5000, 'launch did not time out promptly');
    const pid = Number(await fs.readFile(pidFile,'utf8'));
    await new Promise(r => setTimeout(r,100));
    assert.throws(() => process.kill(pid,0), /ESRCH/);
  } finally {
    if (previous === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = previous;
    await fs.rm(root,{recursive:true,force:true});
  }
});
