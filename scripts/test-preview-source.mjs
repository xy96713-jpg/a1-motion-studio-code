import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { previewModuleSource } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-preview-source-'));
try {
  fs.writeFileSync(path.join(root,'old.mjs'),'old'); fs.writeFileSync(path.join(root,'candidate.mjs'),'candidate');
  const shot = path.join(root,'check-shot.json'); fs.writeFileSync(shot,JSON.stringify({params:{module:'/candidate.mjs'}}));
  const result = previewModuleSource({repoRoot:root},shot);
  assert.equal(result.code,'candidate'); assert.equal(result.file,path.join(fs.realpathSync(root),'candidate.mjs'));
  fs.writeFileSync(shot,JSON.stringify({params:{module:'https://example.com/module.mjs'}}));
  assert.throws(()=>previewModuleSource({repoRoot:root},shot),/local module/);
  console.log('preview binding reads the rendered candidate, not the older canonical module');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
