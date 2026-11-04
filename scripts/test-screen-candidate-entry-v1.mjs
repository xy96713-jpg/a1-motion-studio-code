import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
// Exercise the real entry and locked reconciler in an isolated filesystem.
// Only code/dependencies are symlinked; production state is never writable here.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-candidate-entry-'));
const workspaceRelative = 'apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json';
const bytes = fs.readFileSync(path.join(root, workspaceRelative));
const workspace = JSON.parse(bytes);
try {
  fs.mkdirSync(path.join(temp, 'scripts'), {recursive: true});
  fs.mkdirSync(path.dirname(path.join(temp, workspaceRelative)), {recursive: true});
  fs.writeFileSync(path.join(temp, workspaceRelative), bytes);
  fs.symlinkSync(path.join(root, 'apps/studio-next/src'), path.join(temp, 'apps/studio-next/src'), 'dir');
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
  for (const name of ['integrate-current-screen-production-v1.mjs', 'reconcile-shot-motion-review-v1.mjs']) {
    fs.copyFileSync(path.join(root, 'scripts', name), path.join(temp, 'scripts', name));
  }
  fs.mkdirSync(path.join(temp, 'scripts/lib'), {recursive: true});
  fs.copyFileSync(path.join(root, 'scripts/lib/bound-screen-review-duration-v1.mjs'),path.join(temp, 'scripts/lib/bound-screen-review-duration-v1.mjs'));
  fs.writeFileSync(path.join(temp, 'input.json'), '{}');
  const run = (args, expectedError) => {
    const result = spawnSync(process.execPath, [path.join(temp, 'scripts/integrate-current-screen-production-v1.mjs'), 'candidate', ...args], {cwd: temp, encoding: 'utf8', timeout: 30000});
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expectedError);
    assert.deepEqual(fs.readFileSync(path.join(temp, workspaceRelative)), bytes);
  };
  for (const args of [[], ['input.json'], ['input.json', 'bad'], ['input.json', 'A'.repeat(64)], ['input.json', workspace.workspaceSha256, 'extra']]) {
    run(args, /usage: candidate input.json expectedWorkspaceSha256/);
  }
  run(['missing.json', workspace.workspaceSha256], /ENOENT/);
  fs.writeFileSync(path.join(temp, 'invalid.json'), '{');
  run(['invalid.json', workspace.workspaceSha256], /SyntaxError/);
  const stale = workspace.workspaceSha256 === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
  run(['input.json', stale], /motion-review-cas:/);
  // Matching CAS reaches the original validator, not a wrapper-only mock.
  run(['input.json', workspace.workspaceSha256], /motion-review-shot-missing/);
  // Replacement validation is reached through the real locked record entry.
  const shot = workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.motionReviewReceipt?.video?.sha256 && s.artifactPublicUrl);
  const staticRelative = `apps/studio-next/public${shot.artifactPublicUrl}`;
  fs.mkdirSync(path.dirname(path.join(temp,staticRelative)),{recursive:true});
  fs.copyFileSync(path.join(root,staticRelative),path.join(temp,staticRelative));
  fs.writeFileSync(path.join(temp,'replacement.json'),JSON.stringify({shotId:shot.shotId,source:shot.motionReviewPlan.source,video:{sha256:'f'.repeat(64)}}));
  const replacement = spawnSync(process.execPath,[path.join(temp,'scripts/reconcile-shot-motion-review-v1.mjs'),'record','replacement.json',workspace.workspaceSha256],{cwd:temp,encoding:'utf8',timeout:30000});
  assert.notEqual(replacement.status,0);assert.match(replacement.stderr,/motion-replacement-old-new-sha-required/);
  assert.deepEqual(fs.readFileSync(path.join(temp,workspaceRelative)),bytes);
  assert.equal(fs.existsSync(path.join(temp, '.codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/.production-write.lock')), false);
  assert.deepEqual(fs.readFileSync(path.join(root, workspaceRelative)), bytes);
  console.log('PASS candidate entry: 5 usage cases, missing/malformed JSON, real stale CAS rejection, matching CAS reaches original validator; no production writes');
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
