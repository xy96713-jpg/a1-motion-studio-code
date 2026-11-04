import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { taskMaterialInventory } from '../apps/studio-next/src/lib/recipe-board/material-inventory.mjs';
const repo = path.resolve(import.meta.dirname, '..'), source = path.join(repo, 'work/recipe-board-v1/projects');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-legacy-'));
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
try {
 const clips=path.join(base,'projects/fixture/materials/clips'); fs.mkdirSync(clips,{recursive:true});
 const shots={}; const records=[['clara-auto','B55~2'],['hupo-auto2','meta-S6'],['hupo-auto2','opensrc-S6']];
 for (const [index,[project,key]] of records.entries()) {
  const root=path.join(source,project); const binding=JSON.parse(fs.readFileSync(path.join(root,'materials/bindings.json'))).shots[key];
  const original=path.resolve(root,binding.file), copy=path.join(clips,`${index}${path.extname(original)}`); fs.copyFileSync(original,copy);
  assert.equal(hash(copy),hash(original)); shots[`B${index}`]={kind:'image',file:copy};
 }
 const bad=path.join(clips,'bad.jpg'); fs.copyFileSync(shots.B0.file,bad); fs.appendFileSync(bad,Buffer.alloc(5000)); shots.BAD={kind:'image',file:bad};
 const corrupted=path.join(clips,'corrupt-seft.jpg'); fs.copyFileSync(shots.B0.file,corrupted); let corruptFd=fs.openSync(corrupted,'r+'); fs.writeSync(corruptFd,Buffer.from([255,255,255,127]),0,4,fs.statSync(corrupted).size-12); fs.closeSync(corruptFd); shots.CORRUPT={kind:'image',file:corrupted};
 const short=path.join(clips,'short.jpg'); const primary=fs.readFileSync(shots.B0.file).subarray(0,1751309); fs.writeFileSync(short,Buffer.concat([primary,Buffer.alloc(8),Buffer.from('PhotoEditor_Re_Edit_Data{}')])); shots.SHORT={kind:'image',file:short};
 const cut=path.join(clips,'cut.jpg'); fs.writeFileSync(cut,primary.subarray(0,-2)); shots.CUT={kind:'image',file:cut};
 // Synthetic SEFT fixtures assert structural recognition only, not payload validity.
 const u32 = n => { const b=Buffer.alloc(4); b.writeUInt32LE(n); return b; };
 const record = (type, size) => Buffer.concat([u32(type),u32(1),Buffer.from('A'),Buffer.alloc(size-9)]);
 function container(records, entries) {
  const data=Buffer.concat(records), dir=Buffer.concat([Buffer.from('SEFH'),u32(0),u32(entries.length),...entries.map(([type,offset,len])=>Buffer.concat([u32(type),u32(offset),u32(len)]))]);
  return Buffer.concat([primary,data,dir,u32(dir.length),Buffer.from('SEFT')]);
 }
 const a=record(1,20), b=record(2,20);
 const valid=container([a,b],[[1,40,20],[2,20,20]]);
 // Place SEFH across a 64 KiB read-window boundary.
 const wideSize=65536 + ((65536 - 2 - primary.length % 65536 + 65536) % 65536);
 const wideRecord=record(3,wideSize), wide=container([wideRecord],[[3,wideSize,wideSize]]);
 assert.equal((primary.length + wideSize) % 65536,65534);
 const cases={
  JPEG: primary, VALID: valid, WIDE: wide,
  OFFSET: container([a,b],[[1,0xffffffff,20],[2,20,20]]),
  OVERLAP: container([a,b],[[1,40,25],[2,20,20]]),
  GAP: container([a,b],[[1,40,15],[2,20,20]]),
  ZERO: container([a],[[1,20,0]]),
  OVERSIZE: container([a],[[1,20,0xffffffff]]),
  TRUNCATED: valid.subarray(0,valid.length-1),
  WIDECUT: wide.subarray(0,wide.length-5),
 };
 for (const [name,bytes] of Object.entries(cases)) { const file=path.join(clips,`${name}.jpg`); fs.writeFileSync(file,bytes); shots[name]={kind:'image',file}; }
 const trunc=path.join(clips,'truncated.jpg'); let fd=fs.openSync(trunc,'w'); fs.ftruncateSync(fd,33*1024*1024); fs.closeSync(fd); shots.HUGE={kind:'image',file:trunc};
 fs.writeFileSync(path.join(base,'projects/fixture/materials/bindings.json'),JSON.stringify({shots}));
 let maxRead=0; const readSync=fs.readSync; fs.readSync=function(fd, buffer, offset, length, position) { maxRead=Math.max(maxRead,length); return readSync.call(this,fd,buffer,offset,length,position); };
 let result; try { result=taskMaterialInventory({dataDir:base},'fixture'); } finally { fs.readSync=readSync; }
 assert.ok(maxRead<=64*1024,`read size ${maxRead}`);
 for(const b of ['B0','B1','B2','JPEG','VALID','WIDE']) { assert.equal(result.materials[b]?.[0].status,'present-unverified',b); assert.equal(result.materials[b][0].decoded,false); assert.equal(result.materials[b][0].qualityStatus,'unknown'); }
 assert.equal(result.materials.JPEG[0].metadata.format,'jpeg');
 assert.equal(result.materials.JPEG[0].metadata.trailingData,undefined);
 for (const b of ['VALID','WIDE']) assert.equal(result.materials[b][0].metadata.trailingData,'unverified-seft-container',b);
 assert.equal(result.materials.B0[0].metadata.trailingBytes,3444020); assert.equal(result.materials.B0[0].metadata.trailingData,'unverified-seft-container');
 assert.equal(result.materials.SHORT[0].metadata.trailingData,'unverified-photoeditor');
 for(const b of ['BAD','CORRUPT','CUT','HUGE','OFFSET','OVERLAP','GAP','ZERO','OVERSIZE','TRUNCATED','WIDECUT']) { assert.equal(result.diagnostics[b]?.[0].status,'unknown',b); assert.equal(result.materials[b],undefined,b); }
 console.log('PASS isolated legacy copies and limits');
} finally {fs.rmSync(base,{recursive:true,force:true});}
