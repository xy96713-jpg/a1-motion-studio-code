import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const file='scripts/lib/bound-screen-review-duration-v1.mjs';assert.ok(fs.existsSync(file),'RED: bound review duration validator missing');
const {assertBoundScreenReviewDuration:validate}=await import('./lib/bound-screen-review-duration-v1.mjs');
const r=JSON.parse(fs.readFileSync('work/morning-cap-recovery/closeout/ED-04-candidate.json')),w=JSON.parse(fs.readFileSync('work/morning-cap-recovery/closeout/ed04-workspace.before.json')),s=w.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==='ED-04');
assert.equal(validate(s,r,7234),7234);let count=0;
for(const change of [x=>delete x.reviewOnlyDuration,x=>x.reviewOnlyDuration.durationMs=8000,x=>x.reviewOnlyDuration.formalDurationMs=7234,x=>x.source.versionId='wrong',x=>x.video.sha256='0'.repeat(64),x=>x.capExport=x.video,x=>x.captureReport.sha256='0'.repeat(64),x=>x.kind='CONTINUOUS_VERIFIED_SOURCE_REPAIR',x=>x.productionAdmission=true,x=>x.reviewOnlyDuration.scope='PRODUCTION',x=>x.reviewOnlyDuration.rawSource.sha256='0'.repeat(64),x=>x.narrationSource.sha256='0'.repeat(64),x=>x.reviewOnlyDuration.capProjectConfig.path='work/fake.cap/project-config.json',x=>x.reviewOnlyDuration.receipt.sha256='0'.repeat(64)]){const bad=structuredClone(r);change(bad);assert.throws(()=>validate(s,bad,7234));count++;}
assert.throws(()=>validate(s,r,8000));assert.throws(()=>validate({...s,timeRange:{durationMs:7234}},r,7234));
const ordinary=structuredClone(r);delete ordinary.reviewOnlyDuration;assert.equal(validate(s,ordinary,6584),6580);
console.log(JSON.stringify({status:'PASS',positive:2,negative:count+2}));
