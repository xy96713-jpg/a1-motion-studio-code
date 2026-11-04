import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {engineCodeHash} from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'director-font-cache-'));
try {
 const dir=path.join(root,'work/recipe-board-v1');fs.mkdirSync(path.join(dir,'routing'),{recursive:true});fs.mkdirSync(path.join(dir,'fonts/house'),{recursive:true});
 fs.writeFileSync(path.join(dir,'routing/house-rules.json'),JSON.stringify({fonts:{dir:'work/recipe-board-v1/fonts/house',allowed:[{family:'House Kokka',file:'test.ttf'}]}}));
 const file=path.join(dir,'fonts/house/test.ttf');fs.writeFileSync(file,'font-a');const cfg={repoRoot:root};
 const before=engineCodeHash(cfg);fs.writeFileSync(file,'font-b');assert.notEqual(engineCodeHash(cfg),before,'same-size font byte change must invalidate chapter AND stills cache');
 const changed=engineCodeHash(cfg);fs.unlinkSync(file);assert.notEqual(engineCodeHash(cfg),changed,'missing font must invalidate cache');
} finally {fs.rmSync(root,{recursive:true,force:true});}
console.log('director consumer font-byte cache passed');
