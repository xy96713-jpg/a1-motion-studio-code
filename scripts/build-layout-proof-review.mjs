// Supplemental final-display evidence; not the formal review task or an approval.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {buildStillReviewPack,verifyStillReviewPack} from '../apps/studio-next/src/lib/recipe-board/still-review-pack.mjs';
const root=path.resolve(import.meta.dirname,'..'),base='work/banana-representative-stills-reference-20261030/layout-proof';
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p))),H=b=>crypto.createHash('sha256').update(b).digest('hex');
const runtime=read(base+'/after-runtime.json'),pixels=read(base+'/pixel-measurements.json').after;
const frameHash=H(fs.readFileSync(path.join(root,base,'after.png')));
assert.equal(pixels.sha256,frameHash);assert.equal(runtime.renderBinding.frameHash,frameHash);
for(const i of runtime.renderInputs)assert.equal(H(fs.readFileSync(i.path)),i.hash,'render input changed: '+i.path);
const boxes=['title','evidence','source'].map(id=>{const [x,y,r,b]=pixels[id].pixelBoundsLTRB;return {id,x,y,w:r-x,h:b-y};});
assert(boxes.every(b=>b.x>=120 && b.y>=96 && b.x+b.w<=1800 && b.y+b.h<=935));assert(pixels.axisDelta<=6);
const pack=await buildStillReviewPack({root,outDir:path.join(root,base,'review'),expectedBeats:['B10'],inputFiles:runtime.renderInputs.map(i=>i.path),shots:[{beat:'B10',frame:base+'/after.png',renderBinding:runtime.renderBinding,geometry:{frameHash,method:pixels.scope,boxes},layoutPreflight:{...runtime.layoutPreflight,frameHash,finalOutput:{status:'measured',frameHash,method:pixels.scope,safe:[120,96,1800,935],axisDelta:pixels.axisDelta,scope:'B10 held final-output threshold bounds only; not OCR, occlusion, full-film coverage or aesthetic approval'}},assets:[base+'/pixel-measurements.json',base+'/after-runtime.json']}]});
assert.equal(pack.shots[0].version.status,'bound');assert.equal(pack.shots[0].layoutPreflight.status,'pass');
const verification=verifyStillReviewPack(pack);assert(verification.ok,JSON.stringify(verification));
fs.writeFileSync(path.join(root,base,'review','verification.json'),JSON.stringify(verification,null,2));
console.log(JSON.stringify({pack:base+'/review/review-pack.json',version:pack.shots[0].version.status,layout:pack.shots[0].layoutPreflight.status,finalOutput:pack.shots[0].layoutPreflight.finalOutput,visualInspection:pack.visualInspection,aestheticVerdict:pack.aestheticVerdict,complete:pack.complete,inputScope:'Explicit proof render inputs only; formal stepStills pack has broader engine/font inventory',verification},null,2));
