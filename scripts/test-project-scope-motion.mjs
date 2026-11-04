import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { renderGreybox, stepGreybox } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
import { buildMotion, renderMotion, renderMotionAsync } from '../apps/studio-next/src/lib/recipe-board/motion.mjs';
import { previewChapter, animaticChapter, stepChapters, renderFinal } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { buildFinal, buildAnimatic } from '../apps/studio-next/src/lib/recipe-board/animatic.mjs';
import { buildReel } from '../apps/studio-next/src/lib/recipe-board/sequence.mjs';
import { scopeRestriction } from '../apps/studio-next/src/lib/recipe-board/project-scope.mjs';
const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'rb-scope-motion-'));
try {
  const repo = process.cwd(), data = path.join(root, 'work/recipe-board-v1');
  fs.mkdirSync(path.join(data, 'projects', 'stills'), {recursive:true});
  for (const n of ['routing', 'recipes', 'themes', 'prompts', 'worlds']) if (fs.existsSync(path.join(repo, 'work/recipe-board-v1', n))) fs.symlinkSync(path.join(repo, 'work/recipe-board-v1', n), path.join(data, n));
  const dir = path.join(data,'projects/stills');
  fs.writeFileSync(path.join(dir,'project.json'), JSON.stringify({id:'stills',scope:'STILLS_ONLY'}));
  fs.mkdirSync(path.join(dir,'out'), {recursive:true}); fs.writeFileSync(path.join(dir,'out','preview.mp4'),'old-preview');
  const cfg = boardConfig({RECIPE_BOARD_REPO_ROOT:root, RECIPE_BOARD_SOURCE_ROOT:repo, RECIPE_BOARD_NAS_OUTPUT_ROOT:''});
  const operations = [() => renderGreybox(cfg,'stills',{}), () => stepGreybox(cfg,'stills'), () => buildMotion(cfg,'stills',{}), () => previewChapter(cfg,'stills','B01'), () => animaticChapter(cfg,'stills',{}), () => stepChapters(cfg,'stills'), () => renderFinal(cfg,'stills',{}), () => buildFinal(cfg,'stills'), () => buildAnimatic(cfg,'stills')];
  for (const call of operations) await assert.rejects(call(), /SCOPE_RESTRICTED.*STILLS_ONLY/);
  assert.throws(() => buildReel(cfg,'stills'), /SCOPE_RESTRICTED.*STILLS_ONLY/);
  const motionDir = path.join(dir, 'motion', 'B01'); fs.mkdirSync(motionDir, {recursive:true});
  assert.throws(() => renderMotion(motionDir, { skipScope: true }), /SCOPE_RESTRICTED.*STILLS_ONLY/);
  await assert.rejects(renderMotionAsync(motionDir, { skipScope: true }), /SCOPE_RESTRICTED.*STILLS_ONLY/);
  const external = path.join(root,'external'); fs.mkdirSync(external); const linked=path.join(dir,'linked'); fs.symlinkSync(external,linked);
  assert.throws(() => renderMotion(linked), /SCOPE_RESTRICTED.*STILLS_ONLY/);
  await assert.rejects(renderMotionAsync(external,{out:path.join(dir,'out','bad.mp4')}), /SCOPE_RESTRICTED.*STILLS_ONLY/);
  assert.equal(fs.existsSync(path.join(motionDir, 'renders')), false);
  assert.equal(fs.readFileSync(path.join(dir,'out','preview.mp4'),'utf8'),'old-preview');
  assert.deepEqual(fs.readdirSync(path.join(dir,'out')), ['preview.mp4']);
  for (const op of ['voice','greybox','motion','chapter','animatic','final','reel']) assert.equal(scopeRestriction({},op),null);
  assert.equal(scopeRestriction({scope:'STILLS_ONLY'},'stills'),null);
  const env = {...process.env, RECIPE_BOARD_REPO_ROOT:root, RECIPE_BOARD_SOURCE_ROOT:repo, RECIPE_BOARD_NAS_OUTPUT_ROOT:''};
  const cli = spawnSync(process.execPath,[path.join(repo,'scripts/recipe-board.mjs'),'animatic','--project','stills'],{encoding:'utf8',env});
  assert.notEqual(cli.status,0); assert.match(cli.stderr,/SCOPE_RESTRICTED.*STILLS_ONLY/);
  for (const args of [['greybox'], ['chapter','--only','B01','--preview']]) {
    const c = spawnSync(process.execPath,[path.join(repo,'scripts/recipe-board.mjs'),...args,'--project','stills'],{encoding:'utf8',env});
    assert.notEqual(c.status,0); assert.match(c.stderr,/SCOPE_RESTRICTED.*STILLS_ONLY/);
  }
  const runCli = (id, args) => spawnSync(process.execPath,[path.join(repo,'scripts/recipe-board.mjs'),'run','--project',id,...args],{encoding:'utf8',env});
  const blocked = runCli('stills',['--only','B01','--from','render','--to','render']);
  assert.notEqual(blocked.status,0); assert.match(blocked.stderr,/MATERIALS_ONLY_SCOPE_UNSUPPORTED/);
  const stillRun = runCli('stills',['--from','voice','--to','render','--skip','brief,storyboard,write,facts,screen,materials,fetch,art,stage','--json']);
  assert.equal(stillRun.status,0,stillRun.stderr);
  assert.match(stillRun.stdout,/render\s+0 stills/);
  assert.equal(JSON.parse(stillRun.stdout.trim().split('\n').at(-1)).state.voice.state,'scope-restricted');
  fs.mkdirSync(path.join(data,'projects','legacy')); fs.writeFileSync(path.join(data,'projects','legacy','project.json'), JSON.stringify({id:'legacy'}));
  for (const id of ['stills','legacy']) {
    const result = runCli(id,['--dry','--only','B01','--json']);
    assert.equal(result.status,0,result.stderr);
    const report = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(report.state.voice.state === 'scope-restricted', id === 'stills');
  }
  // Execute the actual old-preview route with only the store import resolved for Node.
  const preview = path.join(dir,'out','chapters','B01','preview.mp4'); fs.mkdirSync(path.dirname(preview),{recursive:true}); fs.writeFileSync(preview,'historical-preview');
  const routeSource = fs.readFileSync(path.join(repo,'apps/studio-next/src/app/api/recipe-board/preview/route.ts'),'utf8');
  const alias = '@/lib/recipe-board/store.mjs'; assert.ok(routeSource.includes(alias));
  const ts = createRequire(path.join(repo,'apps/studio-next/package.json'))('typescript');
  const compiled = ts.transpileModule(routeSource.replace(alias,pathToFileURL(path.join(repo,'apps/studio-next/src/lib/recipe-board/store.mjs')).href),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const routeFile=path.join(root,'preview-route.mjs'); fs.writeFileSync(routeFile,compiled);
  Object.assign(process.env,{RECIPE_BOARD_REPO_ROOT:root,RECIPE_BOARD_SOURCE_ROOT:repo,RECIPE_BOARD_NAS_OUTPUT_ROOT:''});
  const route=await import(pathToFileURL(routeFile)); const request=new Request('http://fixture/?project=stills&chapter=B01');
  const response=await route.GET(request); assert.equal(response.status,200); assert.equal(await response.text(),'historical-preview');
  assert.equal((await route.HEAD(request)).status,200); assert.equal(route.POST,undefined);
  assert.equal(fs.readFileSync(preview,'utf8'),'historical-preview');
  console.log('project scope motion: OK (guards, CLI, historical preview GET/HEAD)');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
