import assert from 'node:assert/strict';
import fs from 'node:fs';
import {refineScreenReviewDirection,reviewCameraEnvelope,projectVerifiedFocusRect} from '../apps/studio-next/src/lib/a1-screen-review-direction-v1.mjs';
const plan=JSON.parse(fs.readFileSync('work/screen-production-integration-v1/plan.json'));
const directions=JSON.parse(fs.readFileSync('work/screen-production-integration-v1/review-directions.json'));
const directed = plan.items.filter(i=>i.director);
assert.deepEqual(directed.map(i=>i.shotId).sort(),Object.keys(directions).sort(), 'Every configured direction must compile');
for(const item of directed){
 const report=JSON.parse(fs.readFileSync(item.reportPath)),spec=directions[item.shotId];
 const result=refineScreenReviewDirection(item,item.binding,item.selected,report,spec);
 const samples=result.scene.screenDirection.samples;
 assert.ok(spec.framing==='CONTEXT_WIDE' ? samples.every(s=>s.camera.scale===1) : Math.max(...samples.map(s=>s.camera.scale))>=1.2);
 assert.ok(result.director.resultHoldMs>=800);
 for(const s of samples){const c=s.camera;assert.ok(c.x>=.5/c.scale-1e-8&&c.x<=1-.5/c.scale+1e-8);assert.ok(c.y>=.5/c.scale-1e-8&&c.y<=1-.5/c.scale+1e-8);}
 assert.throws(()=>refineScreenReviewDirection(item,item.binding,item.selected,report,{...spec,sourceSha256:'stale'}),/STALE/);
 assert.throws(()=>refineScreenReviewDirection(item,item.binding,item.selected,report,{...spec,startEvent:'missing'}),/EVENT_MISSING/);
 assert.throws(()=>refineScreenReviewDirection(item,item.binding,item.selected,report,{...spec,targetKey:'unverified'}),/VERIFIED_TARGET/);
 if(spec.focus){const sample=samples.find(s=>s.atMs>2000),a=sample.actors[0],c=sample.camera,t=result.director.target;assert.ok(Math.abs(a.rect.x-(480+(t.x-c.x)*960*c.scale))<1e-6);assert.equal(samples[0].actors[0].opacity,0);assert.ok(samples.at(-1).actors[0].opacity<.01);}
 if(spec.resetEvent)assert.equal(samples.at(-1).camera.scale,1);
 else assert.deepEqual(samples.at(-1).camera,samples.at(-30).camera);
}
console.log('PASS: verified target, source binding, visible scale, safe crop, result hold and state cut');

// Actual return used to drop from full target influence to zero at the event.
const timing={startMs:1000,endMs:1500,resetMs:4000,contextStartMs:200};
assert.equal(reviewCameraEnvelope(4000,timing).target,1);
assert.equal(reviewCameraEnvelope(4650,timing).target,0);
const values=Array.from({length:301},(_,i)=>reviewCameraEnvelope(i*1000/60,timing));
assert.ok(Math.max(...values.slice(1).map((v,i)=>Math.abs(v.target-values[i].target)))<.07);
assert.ok(Math.max(...values.slice(1).map((v,i)=>Math.abs(v.context-values[i].context)))<.06);
console.log('PASS: camera acquisition and return have no one-frame reset');

for(const scale of [1,1.2,1.6])for(const x of [.4,.5,.6]){
 const target={x:.46,y:.46,width:.08,height:.08},camera={x,y:.5,scale};
 const r=projectVerifiedFocusRect(target,camera);assert.ok(r);
 assert.ok(Math.abs((r.x-480)/(960*scale)+x-target.x)<1e-12);
 assert.ok(Math.abs(r.width/(960*scale)-target.width)<1e-12);
}
assert.equal(projectVerifiedFocusRect({x:.9,y:.2,width:.2,height:.1},{x:.5,y:.5,scale:1}),null);
assert.equal(projectVerifiedFocusRect({x:.1,y:.2,width:.1,height:.1},{x:.8,y:.5,scale:2}),null);
console.log('PASS: exact focus transform and invalid-target omission');
