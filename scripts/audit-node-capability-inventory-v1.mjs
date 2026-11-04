#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';

const root=path.resolve(import.meta.dirname,'..');
const library=path.join(root,'apps/studio-next/src/lib');
const registered={
  'a1-node-material-adapter-v1.mjs':'material',
  'a1-node-external-media-discovery-adapter-v1.mjs':'external-media-discovery',
  'a1-node-media-file-adapter-v1.mjs':'media-files',
  'a1-node-imagegen-tool-adapter-v1.mjs':'image-generation',
  'a1-node-xyq-video-adapter-v1.mjs':'ai-video',
  'a1-node-screen-recording-adapter-v1.mjs':'recording',
  'a1-node-cap-export-adapter-v1.mjs':'cap-export',
  'a1-node-asset-treatment-adapter-v1.mjs':'asset-treatment',
  'a1-node-typography-adapter-v1.mjs':'typography',
  'a1-node-editable-typography-adapter-v1.mjs':'editable-typography',
  'a1-node-diagram-adapter-v1.mjs':'diagram',
  'a1-node-composite-adapter-v1.mjs':'layer-compositor',
  'a1-node-remotion-render-adapter-v1.mjs':'remotion-render',
  'a1-node-article-source-discovery-adapter-v1.mjs':'article-source-discovery',
  'a1-node-hypit-render-adapter-v1.mjs':'hypit-render',
  'a1-node-sequence-assembly-adapter-v1.mjs':'sequence-assembly',
  'a1-node-media-file-svg-adapter-v1.mjs':'media-files',
  'a1-node-minimax-video-adapter-v1.mjs':'ai-video',
};
const specialized={
  'a1-node-imagegen-result-adapter-v1.mjs':'subsumed by image-generation dispatch and result recovery',
  'a1-node-remote-generation-adapter-v1.mjs':'provider lifecycle helper consumed by ai-video',
  'a1-node-frame-review-plan-adapter-v1.mjs':'source sampling study adapter; injected only by source-review workflows',
  'a1-node-ffmpeg-scdet-candidate-adapter-v1.mjs':'source cut-detection study factory; requires a trusted ffmpeg binding',
};
export function auditNodeCapabilityInventoryV1({files,registry,definitions,registrySource,installedRecordingSource}) {
const failures=[];
for(const file of files){
  if(registered[file]){
    const installed=file==='a1-node-screen-recording-adapter-v1.mjs'
      ?registrySource.includes('./a1-node-screen-recording-installed-context-v1.mjs')&&installedRecordingSource.includes(`./${file}`)
      :registrySource.includes(`./${file}`);
    if(!installed||!registry[registered[file]]||!definitions[registered[file]])failures.push(`REGISTERED_MODULE_UNREACHABLE:${file}`);
  } else if(!specialized[file]) failures.push(`UNCLASSIFIED_ADAPTER:${file}`);
}
for(const [file,id] of Object.entries(registered)) if(!files.includes(file)) failures.push(`REGISTERED_FILE_MISSING:${id}`);
for(const file of Object.keys(specialized)) if(!files.includes(file)) failures.push(`SPECIALIZED_FILE_MISSING:${file}`);
const expected=new Set([...Object.values(registered),'hyperframes-render']);
for(const id of Object.keys(definitions)) if(!expected.has(id)) failures.push(`UNCLASSIFIED_REGISTRY_MODULE:${id}`);
for(const [id,adapter] of Object.entries(registry)){
  const callable=typeof adapter.execute==='function'&&adapter.enabled!==false;
  if(adapter.available!==callable||definitions[id]?.available!==callable)failures.push(`REGISTRY_AVAILABILITY_DRIFT:${id}`);
}
return {contract:'A1NodeCapabilityInventoryAudit/v1',status:failures.length?'FAIL':'PASS',
  adapterFileCount:files.length,registered:[...new Set(Object.values(registered))].sort(),
  specialized:Object.entries(specialized).map(([file,reason])=>({file,reason})),
  modules:Object.entries(registry).map(([id,adapter])=>({id,available:definitions[id]?.available===true,
    implementationSha256:adapter.implementationSha256||null,executionProof:'NOT_RUN_BY_INVENTORY',productionAdmission:false})),
  unavailable:Object.entries(definitions).filter(([,definition])=>!definition.available).map(([id])=>id),failures,
  evidenceBoundary:'Installed registry classification and availability only; no source/input qualification, provider call, render or production admission.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
  const files=fs.readdirSync(library).filter(name=>/^a1-node-.*-adapter-v1\.mjs$/u.test(name)).sort();
  const {registry,definitions}=createNodeAdapterRegistry();
  const result=auditNodeCapabilityInventoryV1({files,registry,definitions,
    registrySource:fs.readFileSync(path.join(library,'a1-node-module-execution-v1.mjs'),'utf8'),
    installedRecordingSource:fs.readFileSync(path.join(library,'a1-node-screen-recording-installed-context-v1.mjs'),'utf8')});
  console.log(JSON.stringify(result,null,2));
  if(result.failures.length)process.exitCode=1;
  if(process.argv.includes('--output')){
    const filename=path.resolve(process.argv[process.argv.indexOf('--output')+1]);
    if(!filename.startsWith(path.join(root,'work')+path.sep))throw Error('INVENTORY_OUTPUT_SCOPE');
    fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  }
}
