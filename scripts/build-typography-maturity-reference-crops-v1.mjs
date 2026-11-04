#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root=path.resolve(import.meta.dirname,"..");
const boardDir=path.join(root,"work/typography-design-board-v1");
const out=path.join(root,"work/typography-maturity-lab-v1/references");
const board=JSON.parse(fs.readFileSync(path.join(boardDir,"board.json"),"utf8"));
const sha=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const ids=["gawx-02","gawx-03","gawx-04","atlas-05"];
fs.mkdirSync(out,{recursive:true});
const records=[];
for(const id of ids){
  const card=board.cards.find((item)=>item.id===id);
  if(!card||board.dismissedIds.includes(id))throw new Error(`reference-not-active:${id}`);
  const source=card.source==="gawx"?board.base:board.atlas;
  const file=path.resolve(boardDir,source.file);
  const bytes=fs.readFileSync(file);
  if(sha(bytes)!==source.sha256)throw new Error(`reference-source-sha-invalid:${id}`);
  const crop=await sharp(bytes).extract(card.crop).png().toBuffer();
  const output=path.join(out,`${id}.png`);
  fs.writeFileSync(output,crop);
  records.push({id,sourceSha256:source.sha256,crop:card.crop,file:path.relative(root,output),sha256:sha(crop),use:"ONE_SELECTED_USER_BOARD_CELL_FOR_REVIEW_ONLY_PROMPT"});
}
fs.writeFileSync(path.join(out,"manifest.json"),`${JSON.stringify({contract:"A1TypographyMaturityReferenceCrops/v1",records},null,2)}\n`);
console.log(JSON.stringify({status:"PASS",records:records.map(({id,sha256})=>({id,sha256}))}));
