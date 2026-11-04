import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {motionReviewHash} from '../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs';
const root=path.resolve(import.meta.dirname,'..');
const record=JSON.parse(fs.readFileSync('work/ed20-handoff-timing-candidate-20260911/ED-20-1b96e2f87769/receipt.json'));
record.video=JSON.parse(fs.readFileSync('work/ed20-auto-closeout/record-draft-NOT-SUBMITTABLE.json')).video;
record.rendererRecipe={id:'ed20-handoff-timing-content-v1',evidenceKind:'CURRENT_CONTENT_BINDING_NOT_EXECUTION_ATTESTATION'};
const {assertReviewRendererProvenance:check}=await import('./lib/assert-review-renderer-provenance-v1.mjs');
assert.doesNotThrow(()=>check(root,record),'exact content-bound real ED20 recipe must be accepted without executing it');
for(const mutate of [r=>delete r.rendererRecipe,r=>r.rendererRecipe.id='arbitrary',r=>r.source.durationMs++,r=>r.video.sha256='0'.repeat(64),r=>r.rendererFiles.push('work/arbitrary.mjs'),r=>r.rendererSha256='0'.repeat(64)]) {
 const r=structuredClone(record);mutate(r);assert.throws(()=>check(root,r));
}
const temp=fs.mkdtempSync('/tmp/ed20-recipe-test-');
try {
 const pin=JSON.parse(fs.readFileSync('scripts/lib/ed20-reviewed-renderer-content-v1.json'));
 for(const entry of [...pin.files,pin.output]){const dest=path.join(temp,entry.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,entry.path),dest);}
 assert.doesNotThrow(()=>check(temp,record));
 const recipe=path.join(temp,record.rendererFiles.at(-1));const original=fs.readFileSync(recipe);
 fs.appendFileSync(recipe,'\n// drift');assert.throws(()=>check(temp,record),/content-changed/);fs.writeFileSync(recipe,original);
 fs.unlinkSync(recipe);fs.symlinkSync(path.join(root,record.rendererFiles.at(-1)),recipe);assert.throws(()=>check(temp,record),/symlink/);
 fs.unlinkSync(recipe);fs.writeFileSync(recipe,original);
 const props=pin.files.find(f=>f.path.endsWith('/props.json'));fs.appendFileSync(path.join(temp,props.path),' ');assert.throws(()=>check(temp,record),/content-changed/);
} finally {fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS exact recipe + 6 binding negatives + content drift + symlink + props drift; read-only validator');
