// Read-only banana integration. All generated evidence stays in the caller's scratch directory.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { directorIntentErrors } from '../apps/studio-next/src/lib/recipe-board/directorroutes.mjs';
import { greyboxInput, eventReviewEvidence, eventReviewErrors } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
import { stillsGroup, boardApproved } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
import { sha256 } from '../apps/studio-next/src/lib/recipe-board/typepreflight.mjs';
const repo=process.cwd(), cfg={repoRoot:repo,sourceRoot:repo,dataDir:path.join(repo,'work/recipe-board-v1')};
const out=process.argv[2];if(!out)throw Error('explicit scratch output required');fs.mkdirSync(out,{recursive:true});
const root=path.join(cfg.dataDir,'projects/banana-design'), answer=path.join(root,'tasks/filmdesign.answer.json');
const before=sha256(answer), design=JSON.parse(fs.readFileSync(answer)), ids=['B10','B11','B12'];
const rows=design.beats.filter(b=>ids.includes(b.beat));assert.equal(rows.length,3);
const scoped=rows.map(b=>({...b,activeRevision:true}));
const failures=scoped.map(b=>({beat:b.beat,errors:directorIntentErrors(b)}));assert(failures.every(b=>b.errors.some(e=>e.includes('required'))));
const inputs=(await greyboxInput(cfg,'banana-design')).filter(b=>ids.includes(b.beat)).map(b=>({...b,activeRevision:true}));
const src=path.join(root,'out/greybox/greybox.mp4'), dest=path.join(out,'greybox.mp4');
if(!fs.existsSync(dest))fs.symlinkSync(src,dest);
const missingTimes=eventReviewEvidence(out,inputs,sha256(answer));assert(missingTimes.every(e=>e.status==='unknown'&&e.frames.length===0));
// Explicit probe marks only: not production-director semantic annotations.
// Deliberately off midpoint; proves extraction follows the provided contract.
const marked=inputs.map(b=>({...b,directorIntent:{...b.directorIntent,eventTimes:{start:0,key:Math.min(1.25,b.dur/3),end:b.dur-0.1}}}));
const events=eventReviewEvidence(out,marked,sha256(answer));assert.equal(events.length,3);assert(events.every(e=>e.frames.length===3&&e.status==='measured'));
for(let i=0;i<events.length;i++) assert.equal(events[i].frames[1].time,marked[i].at+marked[i].directorIntent.eventTimes.key);
assert(eventReviewErrors({},events).length,'unreviewed frames must not pass semantic review');
const coverage=stillsGroup({beats:scoped},inputs).shots.map(s=>s.shotId);assert.deepEqual(coverage,ids);
assert.equal(sha256(answer),before);
const report={scope:'real B10-B12 inputs with in-memory activeRevision=true; NOT a submitted redesign',unchangedAnswerHash:before,designApproved:boardApproved(cfg,'banana-design'),contractFailures:failures,stillsCoverage:coverage,missingTimes, timingScope:'explicit probe marks, NOT production semantic completion annotations',events,semanticReview:'unknown: independent reviewer not run',fontRender:'not run: no production candidate rendered',formalOutputsChanged:false};
fs.writeFileSync(path.join(out,'integration.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:path.join(out,'integration.json'),coverage,frames:events.flatMap(e=>e.frames).length,semanticReview:report.semanticReview},null,2));
