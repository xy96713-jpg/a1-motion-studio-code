import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {researchStaticCoreOnlyV1} from '../apps/studio-next/src/lib/a1-research-static-scope-v1.mjs';
import {researchStaticSampleIsCurrentV1} from '../apps/studio-next/src/lib/a1-research-static-package-binding-v1.mjs';
const [taskId,outputName,evidencePath]=process.argv.slice(2);
if(![taskId,outputName].every(v=>/^[a-z0-9][a-z0-9-]{0,95}$/.test(v||'')))throw Error('TASK_AND_OUTPUT_SELECTORS_REQUIRED');
const root=fs.realpathSync(process.cwd()),taskRoot=path.join(root,'work',taskId),out=path.join(taskRoot,outputName);
const planPath=path.join(taskRoot,'shot-task-plan-v1.json'),manifestPath=path.join(taskRoot,'research-task-manifest-v1.json');
const planBytes=fs.readFileSync(planPath),manifestBytes=fs.readFileSync(manifestPath),plan=JSON.parse(planBytes),manifest=JSON.parse(manifestBytes);
const hash=b=>createHash('sha256').update(b).digest('hex');
if(plan.projectId!==taskId||manifest.taskId!==taskId||plan.scope!=='RESEARCH_ONLY'||plan.productionAdmission!==false||plan.shots.length>500)throw Error('RESEARCH_INVENTORY_SCOPE');
if(fs.existsSync(out))throw Error('OUTPUT_ALREADY_EXISTS_USE_SAVED_RECEIPT');
fs.mkdirSync(out);
const artifacts=new Map(manifest.artifacts.map(a=>[a.id,a])),sequences=new Map(manifest.sequences.map(s=>[s.sequenceId,s]));
let evidence=null,evidenceBytes=null;
if(evidencePath){
  const file=path.resolve(root,evidencePath);if(!file.startsWith(path.join(root,'work')+path.sep)||fs.realpathSync(file)!==file||fs.statSync(file).size>4*1024*1024)throw Error('REFERENCE_EVIDENCE_SCOPE');
  evidenceBytes=fs.readFileSync(file);evidence=JSON.parse(evidenceBytes);
  if(evidence.contract!=='A1ReferenceSequenceStateEvidence/v1'||evidence.source.sha256!==plan.source.videoSha256)throw Error('REFERENCE_EVIDENCE_SOURCE_CHANGED');
}
const cache=new Map();let bytesRead=0;
async function verifyImage(declared){
  if(!declared?.sha256||!declared.path)return null;
  const key=declared.path+':'+declared.sha256;if(cache.has(key))return cache.get(key);
  const result=(async()=>{
    const file=path.resolve(root,declared.path);
    if(!file.startsWith(path.join(root,'work')+path.sep)||fs.realpathSync(file)!==file)throw Error('IMAGE_PATH_SCOPE');
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let bytes;
    try{const before=fs.fstatSync(fd);if(!before.isFile()||before.size>16*1024*1024)throw Error('IMAGE_READ_BUDGET');
      bytes=fs.readFileSync(fd);bytesRead+=bytes.length;const after=fs.fstatSync(fd);
      if(['dev','ino','size','mtimeMs','ctimeMs'].some(k=>before[k]!==after[k])||hash(bytes)!==declared.sha256
        ||declared.bytes&&bytes.length!==declared.bytes)throw Error('IMAGE_BYTES_CHANGED');
    }finally{fs.closeSync(fd);}
    const meta=await sharp(bytes,{limitInputPixels:80*1024*1024}).metadata();
    const alphaMinimum=meta.hasAlpha?(await sharp(bytes).stats()).channels.at(-1).min:255;
    const thumbnail=await sharp(bytes).resize(316,178,{fit:'contain',background:'#181a1f'}).flatten({background:'#181a1f'}).png().toBuffer();
    return {path:declared.path,sha256:declared.sha256,bytes:bytes.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha,alphaMinimum,thumbnail};
  })();cache.set(key,result);return result;
}
const records=[];
for(const [order,shot] of plan.shots.entries()){
  const seq=sequences.get(shot.id);if(!seq)throw Error('MISSING_SOURCE_SEQUENCE');
  const hold=seq.referenceAnchors?.find(a=>a.state==='HOLD')?.sourceFrame;
  const candidates=manifest.candidates.filter(c=>c.sequenceIds?.includes(shot.id)&&c.mediaClass==='STATIC_FRAME_SET'&&!/STALE|RETIRED|SUPERSEDED/.test(c.status||''));
  const samples=candidates.flatMap((candidate,index)=>(candidate.staticSamples||[]).map(sample=>({candidate,sample,index,coreOnly:researchStaticCoreOnlyV1(candidate,sample)})));
  samples.sort((a,b)=>Number(a.coreOnly)-Number(b.coreOnly)
    ||Number(b.candidate.localReview?.status==='PASS')-Number(a.candidate.localReview?.status==='PASS')
    ||Math.abs((a.sample.sourceFrame??1e9)-(hold??0))-Math.abs((b.sample.sourceFrame??1e9)-(hold??0))||b.index-a.index);
  let selected=null,image=null;const errors=[];
  for(const item of samples){try{image=await verifyImage(artifacts.get(item.sample.imageArtifactId));if(image){selected=item;break;}}catch(error){errors.push({candidateId:item.candidate.id,message:error.message});}}
  const supplied=selected?.sample.referenceArtifactId;
  const bound=shot.referenceProductionDesign?.references||[];
  const source=evidence?.stateFrames[shot.id]?.find(f=>f.sourceFrame===selected?.sample.sourceFrame)||evidence?.stateFrames[shot.id]?.find(f=>f.state==='HOLD');
  const originalReference=source?{path:path.relative(root,path.resolve(path.dirname(path.dirname(path.resolve(root,evidencePath))),source.artifactPath)),sha256:source.artifactSha256,sourceFrame:source.sourceFrame}:null;
  const ref=originalReference||artifacts.get(supplied)||bound.find(r=>r.sourceFrame===selected?.sample.sourceFrame)||bound.find(r=>r.state==='HOLD')
    ||artifacts.get(seq.referenceDesignArtifacts?.[0]);
  let reference=null;try{reference=await verifyImage(ref);}catch(error){errors.push({kind:'reference',message:error.message});}
  const metadata=v=>v?{path:v.path,sha256:v.sha256,bytes:v.bytes,width:v.width,height:v.height,hasAlpha:v.hasAlpha,alphaMinimum:v.alphaMinimum}:null;
  const currentGoal=Boolean(selected&&researchStaticSampleIsCurrentV1({plan,shot,candidate:selected.candidate,sample:selected.sample,imageSha256:image?.sha256,referenceSha256:artifacts.get(supplied)?.sha256}));
  const record={shotId:shot.id,order,reference:metadata(reference),image:metadata(image),
    candidateId:selected?.candidate.id||null,sourceFrame:selected?.sample.sourceFrame??null,
    previousReviewStatus:selected?.candidate.localReview?.status||null,coreOnly:selected?.coreOnly||false,
    referenceMatchesSample:Boolean(supplied&&reference?.path===artifacts.get(supplied)?.path||ref?.sourceFrame===selected?.sample.sourceFrame),
    currentGoal,compatibility:currentGoal?'CURRENT_GOAL_BOUND':'UNREVIEWED_FOR_CURRENT_FACTUAL_FACELESS_BRIEF',status:image?'EXISTING_BYTES_VERIFIED_NOT_WHOLE_SHOT_APPROVAL':'MISSING_FULL_FRAME_CANDIDATE',
    errors,sourceText:shot.sourceText,originalCopy:shot.exactCopy,referenceThumbnail:reference?.thumbnail,imageThumbnail:image?.thumbnail};
  records.push(record);
}
if(!fs.readFileSync(planPath).equals(planBytes)||!fs.readFileSync(manifestPath).equals(manifestBytes))throw Error('INVENTORY_INPUT_CHANGED');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function label(text,w,h,size=18,color='#c5c9d0'){return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="12" y="${size+8}" font-family="sans-serif" font-size="${size}" fill="${color}">${esc(text)}</text></svg>`);}
const pages=[];
for(let start=0;start<records.length;start+=9){
  const subset=records.slice(start,start+9),items=[{input:label(`STATIC INVENTORY | ${taskId} | ${start+1}-${start+subset.length} / ${records.length} | NOT APPROVED`,2016,60,23),left:0,top:0}];
  subset.forEach((r,i)=>{const x=i%3*672,y=60+Math.floor(i/3)*282;
    items.push({input:label(`${r.shotId} | SOURCE REF / RETAINED CANDIDATE`,672,42,20),left:x,top:y});
    items.push({input:r.referenceThumbnail||label('REFERENCE UNAVAILABLE',316,178),left:x+12,top:y+42});
    items.push({input:r.imageThumbnail||label('NO REGISTERED STATIC FRAME',316,178,16,'#dcb067'),left:x+344,top:y+42});
    const status=r.image?(r.coreOnly?'CORE ONLY | WHOLE FRAME MISSING':r.currentGoal?`CURRENT GOAL REVIEW: ${r.previousReviewStatus} | NOT WHOLE SHOT APPROVAL`:`OLD REVIEW: ${r.previousReviewStatus} | ADAPTATION NOT REVIEWED`):'MISSING | MAKE COMPLETE FRAME';
    items.push({input:label(status,672,48,15,r.coreOnly||!r.image?'#dcb067':'#9aafb8'),left:x,top:y+225});
  });
  const file=path.join(out,'comparison-'+String(pages.length+1).padStart(2,'0')+'.png');
  await sharp({create:{width:2016,height:60+Math.ceil(subset.length/3)*282,channels:3,background:'#24272d'}}).composite(items).png().toFile(file);
  pages.push({path:path.relative(root,file),sha256:hash(fs.readFileSync(file)),shotIds:subset.map(r=>r.shotId)});
}
const body={contract:'A1ResearchStaticInventory/v1',taskId,inputPlanSha256:hash(planBytes),manifestFileSha256:hash(manifestBytes),
  generatedAt:new Date().toISOString(),shotCount:records.length,candidateImageCount:records.filter(r=>r.image).length,coreOnlyCount:records.filter(r=>r.coreOnly).length,
  sourceReferenceCount:records.filter(r=>r.reference).length,currentGoalStaticPassCount:records.filter(r=>r.currentGoal&&r.previousReviewStatus==='PASS'&&!r.coreOnly).length,
  ...(evidence?{referenceEvidence:{path:evidencePath,sha256:hash(evidenceBytes),sourceVideoSha256:evidence.source.sha256}}:{}),
  missingCandidateShotIds:records.filter(r=>!r.image).map(r=>r.shotId),bytesRead,uniqueImageReads:cache.size,pages,
  scope:'DERIVED_PRIVATE_COMPARISON_ONLY_NO_NEW_SELECTION_OR_APPROVAL',productionAdmission:false,visualApproval:false,
  shots:records.map(({referenceThumbnail,imageThumbnail,...r})=>r)};
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify(body,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...body,shots:undefined,pages:pages.map(p=>p.path)}));
