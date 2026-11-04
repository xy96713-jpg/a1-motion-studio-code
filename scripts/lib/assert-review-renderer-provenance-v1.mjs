import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {motionReviewHash} from '../../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Read bytes only: never import/execute a work recipe. Exact reviewed content
// registry is intentionally not an arbitrary work/ path allowlist.
export function assertReviewRendererProvenance(root,record) {
 const read=(file)=>{
  if(typeof file!=='string'||path.isAbsolute(file)||file.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('motion-review-renderer-path-invalid');
  let p=fs.realpathSync(root);
  for(const part of file.split('/')) {p=path.join(p,part);if(fs.lstatSync(p).isSymbolicLink())throw Error('motion-review-renderer-symlink');}
  if(!fs.statSync(p).isFile())throw Error('motion-review-renderer-not-file');
  return fs.readFileSync(p);
 };
 if(!Array.isArray(record.rendererFiles)||!record.rendererFiles.length)throw Error('motion-review-renderer-path-invalid');
 const hasWork=record.rendererFiles.some(f=>! /^(remotion-renderer\/src|scripts|apps\/studio-next\/src\/lib)\//u.test(f));
 if(hasWork) {
  const pin=JSON.parse(fs.readFileSync(new URL('./ed20-reviewed-renderer-content-v1.json',import.meta.url)));
  if(record.rendererRecipe?.id!==pin.id||record.rendererRecipe?.evidenceKind!=='CURRENT_CONTENT_BINDING_NOT_EXECUTION_ATTESTATION')throw Error('motion-review-controlled-recipe-required');
  if(record.shotId!==pin.shotId||motionReviewHash(record.source)!==motionReviewHash(pin.source)||motionReviewHash(record.rendererFiles)!==motionReviewHash(pin.rendererFiles)||record.video?.sha256!==pin.output.sha256||record.video?.path!==pin.output.path)throw Error('motion-review-controlled-recipe-binding');
  for(const entry of pin.files)if(sha(read(entry.path))!==entry.sha256)throw Error('motion-review-controlled-recipe-content-changed');
  if(sha(read(record.video.path))!==pin.output.sha256)throw Error('motion-review-controlled-recipe-output-changed');
 }
 const actual=motionReviewHash(record.rendererFiles.map(file=>[file,sha(read(file))]));
 if(actual!==record.rendererSha256)throw Error('motion-review-renderer-changed');
 return {status:'PASS',evidenceKind:hasWork?'CURRENT_CONTENT_BINDING_NOT_EXECUTION_ATTESTATION':'CURRENT_RENDERER_CONTENT_BINDING'};
}
