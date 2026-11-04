import fs from 'node:fs';
import path from 'node:path';
import {prepareHypitPersonCardRequestV1} from '../apps/studio-next/src/lib/a1-hypit-person-card-scene-v1.mjs';

// Pure preparation, no Build/browser/provider. Refuse an existing destination instead of replacing evidence.
const [configPath,baseRequestPath,outputPath]=process.argv.slice(2);
if(!configPath||!baseRequestPath||!outputPath)throw new Error('Usage: node scripts/prepare-hypit-person-card-scene-v1.mjs config.json existing-request.json new-output-directory');
const prepared=prepareHypitPersonCardRequestV1(JSON.parse(fs.readFileSync(baseRequestPath,'utf8')),JSON.parse(fs.readFileSync(configPath,'utf8')));
const output=path.resolve(outputPath);
fs.mkdirSync(output,{recursive:false});
for(const source of prepared.scene.sources)fs.writeFileSync(path.join(output,source.path),source.content,{flag:'wx'});
fs.writeFileSync(path.join(output,'prepared-request.json'),JSON.stringify(prepared.request,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(output,'event-and-qa-plan.json'),JSON.stringify({configSha256:prepared.scene.configSha256,
  compilerSha256:prepared.scene.compilerSha256,events:prepared.scene.events,qa:prepared.scene.qa,
  requiredDecisionBinding:prepared.requiredDecisionBinding,executionAuthorized:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PREPARED',output,configSha256:prepared.scene.configSha256,
  files:prepared.scene.sources.map(({path,sha256})=>({path,sha256})),executionAuthorized:false}));
