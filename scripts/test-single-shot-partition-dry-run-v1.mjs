import assert from 'node:assert/strict';
import crypto from 'node:crypto';
// Synthetic deterministic pixels ONLY for tests; never a production fixture.
const module = await import('../apps/studio-next/src/lib/a1-single-shot-partition-dry-run-v1.mjs').catch(() => ({}));
assert.equal(typeof module.compilePartitionDryRun, 'function', 'source-bound memory compiler required');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const width=1920,height=1080,source=Buffer.alloc(width*height*4,255);
for(let p=0;p<width*height;p++) source[p*4]=p%251;
const masks=[Buffer.alloc(width*height),Buffer.alloc(width*height)];
for(let p=0;p<width*height;p++) masks[p%2][p]=255;
const binding={sourceRgbaSha256:sha(source),boardSha256:sha('board'),planSha256:sha('plan'),approvalSha256:sha('approval'),maskSha256s:masks.map(sha)};
const args={source,width,height,masks,binding,currentBinding:structuredClone(binding)};
const result=module.compilePartitionDryRun(args);
assert.equal(result.exactRgbaRecomposition,true);
assert.equal(result.admission.allowed,false);
assert.equal(result.width,1920);
for(const key of ['sourceRgbaSha256','boardSha256','planSha256','approvalSha256']) {
 const bad=structuredClone(binding);bad[key]=sha('stale');
 assert.throws(()=>module.compilePartitionDryRun({...args,binding:bad}),/binding/);
}
for(const mode of ['overlap','gap']) {
 const bad=masks.map(b=>Buffer.from(b));bad[1][0]=mode==='overlap'?255:0;if(mode==='gap')bad[0][0]=0;
 const b={...binding,maskSha256s:bad.map(sha)};
 assert.throws(()=>module.compilePartitionDryRun({...args,masks:bad,binding:b,currentBinding:b}),new RegExp(mode));
}
const bad=masks.map(b=>Buffer.from(b));bad[0][0]=0;
assert.throws(()=>module.compilePartitionDryRun({...args,masks:bad}),/mask-binding/);
const {runSingleShotPartitionDryRun}=await import('../apps/studio-next/src/lib/a1-single-shot-partition-server-v1.mjs');
await assert.rejects(()=>runSingleShotPartitionDryRun(process.cwd(),{action:'dry-run-package-layer-partition',shotId:'ED-17',workspaceSha256:'bad',audit:{status:'PASS'}}),/client-evidence-forbidden/);
console.log('PASS synthetic-only 1920x1080 exact RGBA; source/board/plan/approval/mask binding; overlap/gap rejection; admission blocked');
