import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {assertMotionReviewBinding,assertScreenRepairCandidate} from '../../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs';
// Single audited existing artifact exception, not a caller-controlled tolerance.
// The immutable pin binds current source, native Cap export, original audio and receipt.
const pinPath='work/morning-cap-recovery/closeout/ED-04-duration-pin.json';
const pinSha='4f628cf72368671bb5addd6363eb4f4a21af4a241a66a8f94bb96b3a94206db8';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function assertBoundScreenReviewDuration(shot,record,observedMs,{root=process.cwd()}={}) {
  assertMotionReviewBinding(shot,record);
  if (!record.reviewOnlyDuration) {
    if(Math.abs(observedMs-shot.timeRange.durationMs)>80)throw Error('candidate-media-contract-invalid:review-duration-declaration-required');
    return shot.timeRange.durationMs;
  }
  const bytes=fs.readFileSync(path.resolve(root,pinPath));
  if(hash(bytes)!==pinSha)throw Error('review-duration-pin-changed');
  const pin=JSON.parse(bytes);
  for(const key of Object.keys(pin)) {
    const actual=key==='video'?{path:record.video?.path,sha256:record.video?.sha256}:record[key];
    if(!isDeepStrictEqual(actual,pin[key]))throw Error('review-duration-binding-invalid:'+key);
  }
  if(Math.abs(observedMs-pin.reviewOnlyDuration.durationMs)>1)throw Error('review-duration-observed-mismatch');
  const load=entry=>{const file=fs.realpathSync(path.resolve(root,entry.path));if(!file.startsWith(fs.realpathSync(path.resolve(root,'work'))+path.sep))throw Error('review-duration-path');const bytes=fs.readFileSync(file);if(hash(bytes)!==entry.sha256)throw Error('review-duration-bytes-changed');return bytes;};
  for(const entry of [record.video,record.capExport,record.narrationSource,record.reviewOnlyDuration.capProjectConfig,record.reviewOnlyDuration.rawSource])load(entry);
  const report=JSON.parse(load(record.captureReport));assertScreenRepairCandidate(shot,record,report);
  const receipt=JSON.parse(load(record.reviewOnlyDuration.receipt));
  if(receipt.candidate.sha256!==record.video.sha256||receipt.source.rawSha256!==record.reviewOnlyDuration.rawSource.sha256||report.sourceVideo.sha256!==receipt.source.rawSha256||receipt.verification.nativeExportExitCode!==0||receipt.productionAdmission!==false)throw Error('review-duration-provenance-invalid');
  return pin.reviewOnlyDuration.durationMs;
}
