import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {captionSourcesForBeat,numberErrors} from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
test('academic selector implementation invalidates the normal consumer key',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'caption-key-'));
 try {
  const url=new URL('../apps/studio-next/src/lib/recipe-board/chapter.mjs',import.meta.url).href;
  const loader=path.join(dir,'loader.mjs'),original=fs.readFileSync(new URL(url),'utf8');
  const marker="c.publisher === 'UF/IFAS'";assert.ok(original.includes(marker));
  const measure=source=>{
   fs.writeFileSync(path.join(dir,'chapter.txt'),source);
   fs.writeFileSync(loader,`import fs from 'node:fs';export async function load(url,ctx,next){if(url===${JSON.stringify(url)})return {format:'module',source:fs.readFileSync(${JSON.stringify(path.join(dir,'chapter.txt'))},'utf8'),shortCircuit:true};return next(url,ctx);}`);
   const r=spawnSync(process.execPath,['--no-warnings','--loader',pathToFileURL(loader).href,'--input-type=module','-e',`import {checksHash} from ${JSON.stringify(url)};console.log(checksHash())`],{encoding:'utf8',timeout:30000});
   assert.equal(r.status,0,r.stderr);return r.stdout.trim();
  };
  const first=measure(original);assert.notEqual(measure(original.replace(marker,"c.publisher === 'XX/IFAS'")),first);assert.equal(measure(original),first);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
// A deliberately small, genuine PDF fixture: publication header, title and author.
function pdf(text){const stream='BT /F1 12 Tf 50 750 Td '+text.map((s,i)=>(i?'0 -18 Td ':'')+'('+s+') Tj').join('\n')+' ET';const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];let out='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${o}\nendobj\n`;});const x=Buffer.byteLength(out);return out+'xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;}
for(const kind of ['publicationId','year'])test('academic source exact '+kind,()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'academic-caption-'));try{
 const uf=kind==='publicationId',file=path.join(root,uf?'source.txt':'source.pdf'),archive=path.join(root,'archive.html');
 const url=uf?'https://ask.ifas.ufl.edu/publication/MG040':'https://www.apsnet.org/edcenter/apsnetfeatures/Documents/2005/PanamaDisease1.pdf';
 fs.writeFileSync(file,uf?'Banana Growing in the Florida Home Landscape\nPublication #HS10\nUF/IFAS':pdf(['Feature Story August 2005','Panama Disease:','An Old Nemesis Rears its Ugly Head','Randy C. Ploetz','August 2005 APSnet Feature']));
 fs.writeFileSync(archive,`<link rel="canonical" href="${url}"><meta property="og:title" content="HS10/MG040: Banana Growing in the Florida Home Landscape">`);
 const c=uf?{publisher:'UF/IFAS',publicationId:'HS10',title:'Banana Growing in the Florida Home Landscape',label:'繁殖關係示意',archive:{file:archive,sha256:hash(archive)}}:{publisher:'APS',year:2005,title:'Panama Disease: An Old Nemesis Rears its Ugly Head',author:'Randy C. Ploetz',authorLabel:'Ploetz',label:'品種轉換概念示意'};
 const b={file,sha256:hash(file),source:'real',generated:false,kind:'text',url,caption:uf?'繁殖關係示意 · UF/IFAS · HS10':'品種轉換概念示意 · APS · Ploetz · 2005',...(uf?{}:{year:2005}),citation:c};
 const check=(v=b,text=v.caption,key='B04')=>numberErrors([text],'',{sources:captionSourcesForBeat({[key]:v},'B04',{},root)});
 assert.deepEqual(check(),[]);
 for(const v of [{...b,shotId:'B05'},{...b,citation:undefined},{...b,sha256:'0'.repeat(64)},{...b,file:file+'.missing'},{...b,generated:true},{...b,caption:b.caption+' · 900億美元'},{...b,citation:{...c,publicationId:'HS99',year:2006}},{...b,year:2006,citation:{...c,year:2006}},{...b,url:'https://example.org/publication/MG040'}])assert.ok(check(v).length,JSON.stringify(v));
 assert.ok(check(b,b.caption,'B05').length);for(const t of ['10億美元','2005億美元','非出处數字 900',b.caption+' 99'])assert.ok(check(b,t).length);
 if(uf)assert.ok(check({...b,caption:'繁殖關係示意 · UF/IFAS · HS99',citation:{...c,publicationId:'HS99'}}).length);
 else assert.ok(check({...b,caption:'品種轉換概念示意 · APS · Ploetz · 2006',year:2006,citation:{...c,year:2006}}).length);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
