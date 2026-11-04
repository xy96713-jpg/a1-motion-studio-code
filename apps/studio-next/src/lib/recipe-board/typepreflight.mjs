import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {missingGlyphs} from './house.mjs';
export const sha256=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function assertCurrent(receipt,files){
 if(receipt?.status!=='pass')throw Error('missing successful type preflight');
 if(!files.length)throw Error('missing input identity');
 for(const file of files)if(receipt.bindings?.[file]!==sha256(file))throw Error('stale type preflight: '+file);
 return receipt;
}
export function measuredFontErrors(drawn, fonts) {
 if(!drawn?.length)return ['type preflight unknown: no measured type'];
 const errors=[];
 for(const d of drawn){
  const family=String(d.face||'').replace(/ Tall$/,''), font=fonts.find(f=>f.family===d.face);
  if(!font){errors.push('type preflight unknown font: '+d.face);continue;}
  try{fontEvidence({file:font.path,family,text:d.text});}catch(e){errors.push('type preflight font: '+e.message);}
 }
 return [...new Set(errors)];
}
export function fontEvidence({file,family,text}) {
 const missing=missingGlyphs(family,text,{file});
 if(missing.length) throw Error(`${family}: missing glyph ${missing.join('')} (${file})`);
 return {file,family,text,sha256:sha256(file),cmap:'pass'};
}
