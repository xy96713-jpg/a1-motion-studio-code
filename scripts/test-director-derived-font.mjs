import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {shapedFont} from '../apps/studio-next/src/lib/recipe-board/house.mjs';
const source=path.resolve(import.meta.dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'derived-font-bytes-'));
process.env.A1_PYTHON=path.join(source,'work/external-source-tool-canaries-v1/.venv/bin/python');
try{
 const dir=path.join(root,'work/recipe-board-v1');fs.mkdirSync(path.join(dir,'routing'),{recursive:true});fs.mkdirSync(path.join(dir,'fonts/house'),{recursive:true});
 fs.copyFileSync(path.join(source,'work/recipe-board-v1/routing/house-rules.json'),path.join(dir,'routing/house-rules.json'));
 const file=path.join(dir,'fonts/house/kokka-mincho.ttf');fs.copyFileSync(path.join(source,'work/recipe-board-v1/fonts/house/kokka-mincho.ttf'),file);fs.appendFileSync(file,Buffer.from([0]));
 const out=shapedFont('House Kokka',.72,root), before=fs.statSync(out).mtimeMs, stat=fs.statSync(file);
 await new Promise(r=>setTimeout(r,30));const bytes=fs.readFileSync(file);bytes[bytes.length-1]=1;fs.writeFileSync(file,bytes);fs.utimesSync(file,stat.atime,stat.mtime);
 shapedFont('House Kokka',.72,root);assert.ok(fs.statSync(out).mtimeMs>before,'same-size source font mutation with preserved mtime must rebuild derived Tall font');
 console.log('derived font source-byte binding passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
