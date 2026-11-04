// Static evidence preparation only. Reads the existing representative delivery; never renders or submits.
import fs from 'node:fs';
import path from 'node:path';
import { buildStillReviewPack, verifyStillReviewPack } from '../apps/studio-next/src/lib/recipe-board/still-review-pack.mjs';
const root=path.resolve(import.meta.dirname,'..');
const base='work/banana-representative-stills-reference-20261030';
const outDir=path.join(root,'work/still-review-materials-20261030');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const refs=read(`${base}/reference-inputs.json`), plan=read('work/recipe-board-v1/projects/banana-design/plan.json');
const selected=['B02','B04','B10'];
const target={B02:'real mesh, common ground and practical/ambient light separation',B04:'shared 2D material plane for illustration and type',B10:'evidence interior and honest source raster'};
const p=await buildStillReviewPack({root,outDir,expectedBeats:plan.beats.map(b=>b.id),inputFiles:[`${base}/tasks/stills.task.json`,`${base}/tasks/stills.answer.json`,`${base}/candidate.mjs`,`${base}/reference-inputs.json`,`${base}/runtime-type-check.json`,'work/recipe-board-v1/projects/banana-design/plan.json','work/recipe-board-v1/HOUSE.md','work/recipe-board-v1/TYPE.md'],shots:selected.map(beat=>({beat,frame:`${base}/${beat}.png`,references:refs.selectedReferences.filter(r=>r.beats.includes(beat)).map(r=>({key:r.module,frame:r.frame,source:r.module,frameHash:r.frameSHA256,sourceHash:r.moduleSHA256,frameRole:'source-reference',acceptance:r.status,method:r.consumed,target:target[beat],evidence:{file:`${base}/runtime-type-check.json`,locator:`actual[shot=${beat}].runtime (historical telemetry, not hash-bound render proof)`}}))}))});
const verification=verifyStillReviewPack(p);
fs.writeFileSync(path.join(outDir,'verification.json'),JSON.stringify(verification,null,2)+'\n');
console.log(JSON.stringify({pack:path.join(outDir,'review-pack.json'),checklist:p.checklist.path,expected:p.expectedBeats.length,provided:p.coverage.provided,missing:p.coverage.missing,complete:p.complete,verification,roles:p.shots.map(s=>({beat:s.beat,version:s.version.status,overlay:s.images['layout-overlay'].status,reference:s.references.status}))},null,2));
if(!verification.ok) process.exitCode=1;
