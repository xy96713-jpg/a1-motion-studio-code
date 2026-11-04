// Run against an explicitly isolated proof fixture; never use a production project.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { stepStills } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
const cfg = boardConfig();
assert(cfg.repoRoot.startsWith('/Users/a1/.hermes/cache/scratch/'));
const root = path.join(cfg.dataDir,'projects/banana-design');
const answerFile = path.join(root,'tasks/stills.answer.json');
const original = fs.readFileSync(answerFile);
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wrapper = path.join(cfg.repoRoot,'count-chrome.sh'), count = path.join(cfg.repoRoot,'chrome-count.txt');
const previous = process.env.CHROME_PATH;
try {
  fs.writeFileSync(wrapper, `#!/bin/sh\nprintf x >> '${count}'\nexec '${chrome}' "$@"\n`, {mode:0o700});
  fs.rmSync(count,{force:true}); process.env.CHROME_PATH = wrapper;
  const answer = JSON.parse(original);
  answer.hairline = {key:'hairline_test',figure:'exploded',phaseMs:192,intensity:0.8};
  answer.art = [...(answer.art || []), {key:'missing_test',file:'missing-test-do-not-create.png'}];
  fs.writeFileSync(answerFile, JSON.stringify(answer));
  const result = await stepStills(cfg,'banana-design',{log(){}});
  assert.equal(result.state,'rejected',JSON.stringify(result));
  assert.equal(fs.readFileSync(count,'utf8'), 'x', 'stepStills must launch Hairline once');
  assert(result.errors.some(e => /missing_test|missing-test/.test(e)), JSON.stringify(result));
  console.log('real stepStills launches the Hairline browser once and fails on missing art');
} finally {
  fs.writeFileSync(answerFile,original); fs.rmSync(wrapper,{force:true}); fs.rmSync(count,{force:true});
  if (previous === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH=previous;
}
