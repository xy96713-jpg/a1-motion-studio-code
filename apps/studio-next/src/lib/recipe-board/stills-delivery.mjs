// Export projection only. Never writes acceptance, review receipts or user gates.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function exportStills(cfg,id,{scope,out,acceptanceFile}={}) {
 if(!['diagnostic','design-review','mature'].includes(scope)||!out) throw new Error('export-stills requires --scope diagnostic|design-review|mature --out NEW_DIRECTORY');
 if(!acceptanceFile) {
  const {projectPaths}=await import('./store.mjs');
  const {renderInputs,stillReviewMaterialsStatus}=await import('./stills.mjs');
  const {reviewSubmissionStatus}=await import('./agenttask.mjs');
  const p=projectPaths(cfg,id).root,errors=[],load=f=>{try{return read(path.join(p,f));}catch{return null;}};
  const c=load('tasks/stills.check.json'),tasks=['stills-taste','stills-taste-2'].map(step=>({step,task:load(`tasks/${step}.task.json`),answer:load(`tasks/${step}.answer.json`)}));
  const {checksHash}=await import('./chapter.mjs');
  if(c?.checksHash!==checksHash()) errors.push('technical checker identity stale/unknown');
  if(!c?.ok||c.taskMode!=='stills') errors.push('technical unknown/failed: current still-only check required');
  const assets=Object.fromEntries(Object.entries(c?.assets||{}).map(([k,f])=>[k,path.resolve(p,f)]));
  if(!c?.renderInputs?.length||JSON.stringify(renderInputs(cfg,id,assets))!==JSON.stringify(c.renderInputs)) errors.push('technical inputs stale/unknown');
  const expected=(load('storyboard.json')?.shots||[]).map(b=>b.beat);
  const pack=tasks[0].task?.input?.stillReviewPack;
  const shots=(pack?.shots||[]).map(s=>({beat:s.beat,file:s.images['original-size'].path,hash:s.images['original-size'].hash}));
  const exact=(ids)=>expected.length>0&&ids.length===expected.length&&new Set(ids).size===expected.length&&expected.every(b=>ids.includes(b));
  if(!exact(shots.map(s=>s.beat))) errors.push('whole-film coverage missing/duplicate/unknown');
  if(c?.keyframes?.length!==shots.length) errors.push('technical frame coverage mismatch');
  for(const s of shots){const k=(c?.keyframes||[]).findIndex(f=>path.resolve(p,f)===s.file);if(k<0||c.renderBindings?.[k]?.frameHash!==s.hash||c.renderBindings?.[k]?.inputHash!==hash(JSON.stringify(c.renderInputs))) errors.push(`${s.beat}: technical render binding stale/unknown`);}
  for(const s of pack?.shots||[]) if(s.layoutPreflight?.status!=='pass') errors.push(`${s.beat}: layout failed/unknown`);
  const actors=[];
  for(const {step,task,answer} of tasks){
   const status=reviewSubmissionStatus(cfg,id,step,task,{writerStep:'stills'});if(!status.ok) errors.push(`${step}: ${status.why}`);else actors.push(status.reviewerThread);
   if(task?.forCheck!==c?.answerHash) errors.push(`${step}: check binding stale`);
   errors.push(...stillReviewMaterialsStatus(task).errors);
   if(JSON.stringify(task?.input?.stillReviewPack)!==JSON.stringify(pack)) errors.push(`${step}: review materials disagree`);
   const m=answer?.maturity;
   if(m?.scope!=='whole-film-stills'||!m.observation?.trim()||!['original-size','downscaled','whole-board'].every(role=>m.inspected?.includes(role))) errors.push(`${step}: whole-film inspection record unknown`);
   if(!Number.isFinite(m?.wholeFilmCoherence)||m.wholeFilmCoherence<4||m.wholeFilmCoherence>5) errors.push(`${step}: whole-film coherence below 4/unknown`);
   if(!exact((m?.beats||[]).map(b=>b.beat))) errors.push(`${step}: strict visual coverage unknown`);
   for(const b of m?.beats||[]){
    for(const k of ['clarity','compositionHierarchy','imageTextIntegration','materialSubjectCredibility','wholeFilmCoherence']) if(!Number.isFinite(b[k])||b[k]<4||b[k]>5) errors.push(`${b.beat}: ${k} below 4/unknown (${step})`);
    if(!b.observation?.trim()) errors.push(`${b.beat}: visual observation unknown`);
   }
   if(!exact((answer?.beats||[]).map(b=>b.beat))) errors.push(`${step}: native review coverage unknown`);
   for(const b of answer?.beats||[]) {
    for(const k of ['composition','figureGround','focus','ground','type','score']) if(!Number.isFinite(b[k])||b[k]<4||b[k]>5) errors.push(`${b.beat}: ${k} below 4/unknown (${step})`);
    if(b.hard?.length||b.checked?.some(x=>x.done!==true)) errors.push(`${b.beat}: unresolved visual issues`);
   }
  }
  if(new Set(actors).size!==2) errors.push('two distinct current independent reviewers required');
  if(scope==='mature'&&errors.length) throw new Error(`delivery blocked: ${errors.join('; ')}`);
  return publish({scope,out,shots,errors});
 }
 const a=read(acceptanceFile),errors=['snapshot acceptance is not a current native task/review chain'];
 const shots=(a.shots||[]).map(s=>({beat:s.beat,file:path.resolve(cfg.repoRoot,s.selected),hash:s.sha256,version:s.versionStatus,technical:s.technicalStatus}));
 for(const s of shots) if(s.version!=='current'||s.technical!=='pass') errors.push(`${s.beat}: ${s.version}/${s.technical}`);
 for(const s of a.shots||[]) if(s.visualConclusion!=='dual-local-comparable') errors.push(`${s.beat}: ${s.visualConclusion||'visual unknown'}`);
 if(scope==='mature') throw new Error(`delivery blocked: ${errors.join('; ')}`);
 return publish({scope,out,shots,errors});
}
function publish({scope,out,shots,errors}) {
 if(!shots.length||new Set(shots.map(s=>s.beat)).size!==shots.length) throw new Error('delivery blocked: empty or duplicate beats');
 // Validate all bytes before creating any output, including diagnostic exports.
 const bytes=shots.map(s=>{if(!/^[A-Za-z0-9_-]+$/.test(s.beat)) throw new Error('invalid beat');const b=fs.readFileSync(s.file);if(hash(b)!==s.hash) throw new Error(`delivery blocked: ${s.beat} image stale`);return b;});
 out=path.resolve(out);if(fs.existsSync(out)) throw new Error('export destination must not exist');
 fs.mkdirSync(out,{recursive:true});
 shots.forEach((s,i)=>fs.writeFileSync(path.join(out,`${s.beat}.png`),bytes[i]));
 const result={scope,mature:scope==='mature',userApproval:'not granted by exporter',acceptanceScope:'Still images only; no motion/audio approval. This package is a read-only projection, not acceptance authority.',errors,shots:shots.map(s=>({...s,exported:`${s.beat}.png`}))};
 fs.writeFileSync(path.join(out,'delivery.json'),JSON.stringify(result,null,2)+'\n');
 fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>${scope.toUpperCase()} — STILL IMAGES</title><h1>${scope.toUpperCase()} — STILL IMAGES</h1><p>${scope==='mature'?'Strict current still-review evidence passed; user approval remains separate.':'INTERNAL CANDIDATE / NOT A FINISHED DELIVERABLE. Design review scope only; failures remain visible.'}</p><p>${escape(result.acceptanceScope)}</p><ul>${errors.map(e=>`<li>${escape(e)}</li>`).join('')}</ul>${shots.map(s=>`<h2>${escape(s.beat)}</h2><img width="480" src="${s.beat}.png">`).join('')}`);
 return result;
}
