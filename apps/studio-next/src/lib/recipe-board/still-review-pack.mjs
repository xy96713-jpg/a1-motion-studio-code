// Read-only evidence preparation. This is not a review answer, receipt or gate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { reviewSubmissionStatus } from './agenttask.mjs';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const unknown = why => ({status:'unknown',why});
function file(root, name) {
 if (!name) return unknown('not supplied');
 const p=path.resolve(root,name);
 try {const b=fs.readFileSync(p); return {path:p,hash:hash(b),bytes:b.length,status:'available'};} catch {return {...unknown('file unavailable'),path:p};}
}
export async function buildStillReviewPack({root,outDir,expectedBeats,inputFiles=[],shots=[],reviewBinding=null}) {
 root=path.resolve(root); outDir=path.resolve(outDir); fs.mkdirSync(outDir,{recursive:true});
 const inputs=inputFiles.map(p=>file(root,p));
 const inputHash=hash(JSON.stringify(inputs));
 const rows=[];
 for (const s of shots) {
  const original=file(root,s.frame), images={'original-size':original,downscaled:unknown('original unavailable'),'layout-overlay':unknown('same-version measured geometry not supplied')};
  let measurements=unknown('original unavailable');
  if(original.status==='available') {
   const bytes=fs.readFileSync(original.path), meta=await sharp(bytes).metadata();
   Object.assign(original,{width:meta.width,height:meta.height,role:'original-size'});
   const dest=path.join(outDir,`${rows.length}-${String(s.beat).replace(/[^A-Za-z0-9_-]/g,'_')}-downscaled.png`);
   await sharp(bytes).resize({width:480,withoutEnlargement:true}).png().toFile(dest);
   const dm=await sharp(dest).metadata();
   images.downscaled={...file(root,dest),role:'downscaled',sourceHash:original.hash,width:dm.width,height:dm.height};
   const stats=await sharp(bytes).stats();
   measurements={status:'measured',method:'sharp decoded raster statistics; not semantic/ink geometry',width:meta.width,height:meta.height,channels:stats.channels.map(c=>({min:c.min,max:c.max,mean:c.mean,stdev:c.stdev})),crossElementGeometry:unknown('no frame-bound ink/object boxes')};
  }
  const version=s.renderBinding ? {status:inputs.length && inputs.every(x=>x.status==='available') && s.renderBinding.inputHash===inputHash && s.renderBinding.frameHash===original.hash ? 'bound':'stale',binding:s.renderBinding,scope:'Caller supplied render-time binding; not independent attestation'} : unknown('render-time input/frame binding absent');
  const lp=s.layoutPreflight;
  const layoutPreflight=version.status==='bound' && lp?.frameHash===original.hash && ['pass','fail','unknown'].includes(lp?.result?.status) ? {...lp,status:lp.result.status,scope:'Runtime declared contract only; final pixel and aesthetic judgments are separate'} : unknown('layout contract absent or not bound to this render');
  const g=s.geometry;
  if(original.status==='available' && g?.frameHash===original.hash && g.method && g.boxes?.length && g.boxes.every(b=>b.id && [b.x,b.y,b.w,b.h].every(Number.isFinite) && b.w>0 && b.h>0)) {
   const pairs=[];
   for(let i=0;i<g.boxes.length;i++) for(let j=i+1;j<g.boxes.length;j++) {const a=g.boxes[i],b=g.boxes[j];pairs.push({a:a.id,b:b.id,leftDelta:b.x-a.x,centerDelta:(b.x+b.w/2)-(a.x+a.w/2),rightDelta:(b.x+b.w)-(a.x+a.w),verticalGap:b.y-(a.y+a.h)});}
   measurements.crossElementGeometry={status:'measured-from-supplied-boxes',method:g.method,frameHash:g.frameHash,boxes:g.boxes,pairs,scope:'Coordinates are not inferred from pixels; optical/semantic correctness needs independent review.'};
   const svg=Buffer.from(`<svg width="${original.width}" height="${original.height}">${g.boxes.map(b=>`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#00ffcc" stroke-width="2"/><line x1="${b.x}" y1="0" x2="${b.x}" y2="${original.height}" stroke="#ff00bb" stroke-width="1"/>`).join('')}</svg>`);
   const dest=path.join(outDir,`${rows.length}-layout-overlay.png`);
   await sharp(original.path).composite([{input:svg}]).png().toFile(dest);
   images['layout-overlay']={...file(root,dest),role:'layout-overlay',sourceHash:original.hash,geometryHash:hash(JSON.stringify(g)),width:original.width,height:original.height};
  }
  const refs=(s.references||[]).map(r=>{
   const frame=file(root,r.frame),source=file(root,r.source||r.module),evidence=file(root,r.evidence?.file);
   const pins={frame:r.frameHash?(r.frameHash===frame.hash?'matched':'stale'):'unknown',source:r.sourceHash?(r.sourceHash===source.hash?'matched':'stale'):'unknown'};
   return {key:r.key||null,frame,source,pins,frameRole:r.frameRole||'unknown',historicalAcceptance:r.acceptance||null,method:r.method||null,target:r.target||null,evidence:{...evidence,locator:r.evidence?.locator||null},targetFrameHash:original.hash||null,status:!Object.values(pins).includes('stale') && frame.hash && source.hash && evidence.hash && r.method && r.target && r.evidence?.locator ? 'declared-linked-not-visually-verified':'unknown'};
  });
  const references=refs.length?{status:refs.every(r=>r.status!=='unknown')?'declared-linked-not-visually-verified':'unknown',items:refs}:unknown('reference consumption not supplied');
  rows.push({beat:s.beat,images,version,measurements,layoutPreflight,references,assets:(s.assets||[]).map(p=>file(root,p)),layoutKey:s.layoutKey||null,pendingJudgment:['Inspect original and playback scale for readability, clipping and optical alignment across text/object/evidence groups.','Compare claimed reference method with actual frame and source; file availability is not consumption.','Judge focus, semantic clarity and relation to adjacent shots; no style quota.']});
 }
 const ids=rows.map(s=>s.beat), missing=expectedBeats.filter(b=>!ids.includes(b));
 const duplicates=[...new Set(ids.filter((b,i)=>ids.indexOf(b)!==i))],unexpected=[...new Set(ids.filter(b=>!expectedBeats.includes(b)))];
 const boardRisks=[];
 for(const [kind,entries] of [['repeated-frame',rows.map(s=>[s.images['original-size'].hash,s.beat])],['repeated-asset',rows.flatMap(s=>s.assets.map(a=>[a.hash,s.beat]))],['repeated-layout-declaration',rows.map(s=>[s.layoutKey,s.beat])]]) {
  const groups=new Map();for(const [key,beat] of entries) if(key) groups.set(key,[...(groups.get(key)||[]),beat]);
  for(const [key,beats] of groups) if(beats.length>1) boardRisks.push({kind,key,beats,status:'review-note',why:'Shared bytes/declaration may be intentional. Judge semantic change and adjacent-shot rhythm; no quota or automatic rejection.'});
 }
 const complete=expectedBeats.length>0 && !missing.length && !duplicates.length && !unexpected.length && rows.every(s=>s.version.status==='bound' && Object.values(s.images).every(i=>i.status==='available') && s.references.status!=='unknown');
 const pack={contract:'A1StillReviewMaterials/v1',inputHash,inputs,expectedBeats,shots:rows,coverage:{missing,duplicates,unexpected,provided:[...new Set(ids)]},boardRisks,complete,completenessScope:'Evidence inventory only; never reviewed/approved',visualInspection:'unknown',aestheticVerdict:'not-assessed',reviewChain:{schema:reviewBinding?.task?.schema || 'work/recipe-board-v1/routing/morph-review.schema.json',submissionContract:'A1TaskSubmission/v1',status:reviewBinding?reviewSubmissionStatus(reviewBinding.cfg,reviewBinding.project,reviewBinding.step,reviewBinding.task,{writerStep:reviewBinding.writerStep}):unknown('existing review task/receipt not supplied')},boardNotes:['Coverage is an inventory, not proof anyone viewed the frames.','Independent whole-board review required; no palette, medium or layout quotas.','Undeclared assets/layouts remain unknown; exact-hash repetition cannot detect visually similar crops or redesigns.']};
 pack.checklistScope='Unanswered prompts for the existing review schema; not a review answer';
 const lines=['# Static review materials — NOT an approval',`Input hash: ${inputHash}`,`Inventory complete: ${complete}; visual inspection: unknown; aesthetic verdict: not-assessed.`, '', '## Whole-board coverage', ...expectedBeats.map(b=>`- ${b} — ${ids.includes(b)?'provided (not viewed)':'MISSING'}`),`Duplicate identities: ${duplicates.join(', ')||'none'}`,`Unexpected identities: ${unexpected.join(', ')||'none'}`,'', '## Whole-board independent judgment', '- [ ] Inspect every expected beat, not merely the supplied file count.', '- [ ] Judge repeated assets/crops/layouts in narrative order and adjacent-shot contrast. Repetition may be intentional.', '- [ ] Check reading order, information progression and reference-method adaptation across the board; do not add style quotas.', ...boardRisks.map(r=>`- NOTE ${r.kind}: ${r.beats.join(', ')} — ${r.why}`)];
 for(const s of rows) {
  lines.push('',`## ${s.beat}`,`Version: ${s.version.status}; reference consumption: ${s.references.status}`);
  for(const [role,image] of Object.entries(s.images)) lines.push(`- ${role}: ${image.path||'unknown'} (${image.status}); SHA256 ${image.hash||'unknown'}`);
  lines.push('Objective measurements (not an aesthetic result):','```json',JSON.stringify({measurements:s.measurements,layoutPreflight:s.layoutPreflight},null,2),'```');
  for(const r of s.references.items||[]) lines.push(`- Reference ${r.key}: method ${r.method||'unknown'} → target ${r.target||'unknown'}; evidence ${r.evidence.path||'unknown'} @ ${r.evidence.locator||'unknown'}; ${r.status}`);
  for(const item of s.pendingJudgment) lines.push(`- [ ] ${item}`);
 }
 lines.push('', '## Existing review chain', `Answer schema: ${pack.reviewChain.schema}`, 'Keep the existing forAnswer / independentReview.writerStep binding. Submit through submitTaskAnswer; verify with reviewSubmissionStatus. Do not manufacture receipts or copy these unchecked prompts into checked.done=true.', 'For each defect give visible location, compared elements, severity and a concrete repair. No score is assigned by this generator.');
 const checklist=path.join(outDir,'review-checklist.md');fs.writeFileSync(checklist,lines.join('\n')+'\n');pack.checklist=file(root,checklist);
 fs.writeFileSync(path.join(outDir,'review-pack.json'),JSON.stringify(pack,null,2)+'\n');
 return pack;
}
// Recheck immediately before attaching this pack to the existing review task.
// Hash integrity does not establish that a reviewer opened a file.
export function verifyStillReviewPack(pack) {
 const errors=[];
 function visit(v) {
  if(!v || typeof v!=='object') return;
  if(v.path && v.hash) {const now=file('.',v.path);if(now.hash!==v.hash) errors.push(`changed or missing: ${v.path}`);}
  for(const child of Object.values(v)) if(child && typeof child==='object') visit(child);
 }
 visit(pack);
 for(const s of pack.shots||[]) {
  const h=s.images?.['original-size']?.hash;
  for(const role of ['downscaled','layout-overlay']) if(s.images?.[role]?.status==='available' && s.images[role].sourceHash!==h) errors.push(`${s.beat}: stale ${role}`);
  if(s.version.status==='bound' && (s.version.binding.frameHash!==h || s.version.binding.inputHash!==pack.inputHash)) errors.push(`${s.beat}: stale render binding`);
 }
 return {ok:errors.length===0,errors,scope:'byte integrity only; not completeness, viewing evidence or aesthetic approval'};
}
