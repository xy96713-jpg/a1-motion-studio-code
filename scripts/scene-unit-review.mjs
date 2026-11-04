#!/usr/bin/env node
// Reference scene-unit review: what is the recurring unit (single vs bunch/hand), how many fingers share a crown.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { codexExecutable } from '../apps/studio-next/src/lib/recipe-board/director.mjs';
const opt=(a,k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;};
const img=opt(process.argv,'--image'), out=opt(process.argv,'--out'), role=opt(process.argv,'--role','scene');
if(!img||!out){console.error('usage: scene-unit-review.mjs --image ref.png --out unit.json [--role scene]');process.exit(2);}
const bin=codexExecutable(); if(!bin) throw new Error('Codex CLI not found');
const prompt=['Inspect the attached reference image as a production designer.','Return ONLY valid JSON, no markdown, with this shape:',
'{"contract":"A1SceneUnit/v1","unit":"single|bunch|hand|other","fingersMin":1,"fingersMax":1,"sharedCrown":true,"recurring":true,"evidence":"...","confidence":0.0,"whatToModel":"..."}',
'Rule: a bunch/hand has multiple banana fingers joined at one crown/stem; a single has one finger per stem.',
'If the image shows a shelf of banana bunches, unit must be bunch or hand, fingersMin/Max from the image, sharedCrown true.',
'Do not invent; inspect the image.'].join(String.fromCharCode(10));
const r=spawnSync(bin,['exec','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--color','never','-i',img,'-'],{input:prompt,encoding:'utf8',timeout:180000,maxBuffer:20<<20});
if(r.status!==0) throw new Error('codex review failed: '+String(r.stderr).slice(-400));
const text=(r.stdout||'')+(r.stderr||''); const lines=text.split(String.fromCharCode(10)).map(x=>x.trim()).filter(x=>x.startsWith('{')&&x.endsWith('}')); if(!lines.length) throw new Error('no JSON in review output');
const data=JSON.parse(lines[lines.length-1]); data.role=role; data.image=img; data.reviewedAt=new Date().toISOString(); data.reviewer='codex-scene-unit';
fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(data,null,1)+'\n'); console.log('SCENE UNIT',JSON.stringify(data));
