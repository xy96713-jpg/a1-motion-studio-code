#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const CONTRACT = "A1TypographyDesignReferenceBoard/v1";
const root = path.resolve(import.meta.dirname, "..");
const defaultDir = path.join(root, "work/typography-design-board-v1");
const baseFile = path.join(root, "work/typography-visual-reset/gawx-source-study/chinese-adaptation-board-v2.png");
const expectedBaseSha = "4108c6704ff21a30f6fa82a8726567dafdd82d231503b222e614793a399d49f6";
const atlasFile = path.join(root, "work/typography-imagegen-role-comparison-v1/ref-user-board.png");
const expectedAtlasSha = "ef43d7b172788cc782e8149c7f90e9c1f7b55cb5a4c45896fb8c6ea70c06d22b";
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const args = process.argv.slice(2);
const option = (name) => { const i=args.indexOf(name); return i < 0 ? null : args[i+1] || null; };
const escapeHtml = (value) => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const relativeUrl = (from,to) => path.relative(from,to).split(path.sep).join("/");
const atomicWrite = (file,bytes) => { const tmp=`${file}.tmp-${process.pid}`; fs.writeFileSync(tmp,bytes); fs.renameSync(tmp,file); };

function readBoard(dir) {
  const file=path.join(dir,"board.json");
  if(!fs.existsSync(file)) throw new Error("board-missing-run-init-first");
  const board=JSON.parse(fs.readFileSync(file,"utf8"));
  if(board.contract!==CONTRACT||!Array.isArray(board.liked)) throw new Error("board-contract-invalid");
  if(board.base.sha256!==expectedBaseSha||sha(fs.readFileSync(baseFile))!==expectedBaseSha) throw new Error("base-board-sha-mismatch");
  if(board.atlas && (board.atlas.sha256!==expectedAtlasSha||sha(fs.readFileSync(atlasFile))!==expectedAtlasSha)) throw new Error("atlas-board-sha-mismatch");
  return board;
}

function sourceCards(dir) {
  const gawxTitles=["阶段重字","巨字覆盖","满幅字网格","空间排版","极小问句","留给画面"];
  const atlasTitles=["开场问题","问题转折","判断句","方法主张","数据指标","双语锚定","空间轴线","手写层级","密度重置","英文黑体","英文衬线","收束身份"];
  const gawx=Array.from({length:6},(_,index)=>({
    id:`gawx-${String(index+1).padStart(2,"0")}`,source:"gawx",title:gawxTitles[index],
    crop:{left:index%2===0?8:656,top:[56,431,806][Math.floor(index/2)],width:638,height:368},
    note:"字与人物、景深或留白的片内关系；选择具体机制，不照抄场景",
  }));
  const atlas=Array.from({length:12},(_,index)=>({
    id:`atlas-${String(index+1).padStart(2,"0")}`,source:"atlas",title:atlasTitles[index],
    crop:{left:[28,666,1304][index%3],top:[106,500,894,1288][Math.floor(index/3)],width:608,height:370},
    note:"字组结构与阅读路径候选；图中的 Approved 不等于用户逐格批准",
  }));
  return {atlas:{file:relativeUrl(dir,atlasFile),sha256:expectedAtlasSha,role:"STRUCTURE_AND_READING_PATH_REFERENCE"},cards:[...gawx,...atlas]};
}

async function render(dir,board) {
  const base=fs.readFileSync(baseFile);
  const baseMeta=await sharp(base).metadata();
  const width=baseMeta.width;
  const catalogPresent=Array.isArray(board.cards);
  const activeCards=(board.cards||[]).filter((card)=>!(board.dismissedIds||[]).includes(card.id));
  const cards=[];
  for(const [index,item] of board.liked.filter((item)=>!(board.dismissedIds||[]).includes(item.id)).entries()) {
    const file=path.join(dir,item.file);
    const bytes=fs.readFileSync(file);
    if(sha(bytes)!==item.sha256) throw new Error(`liked-image-sha-mismatch:${item.id}`);
    const meta=await sharp(bytes).metadata();
    if(!meta.width||!meta.height) throw new Error(`liked-image-decode-failed:${item.id}`);
    const image=await sharp(bytes).resize(width-40,500,{fit:"contain",background:"#131719"}).png().toBuffer();
    const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="54"><rect width="100%" height="100%" fill="#171c1e"/><text x="20" y="34" font-family="Arial" font-size="24" fill="#e9f0e6">LIKED ${String(index+1).padStart(2,"0")}  /  ${escapeHtml(item.id)}</text></svg>`);
    cards.push({image,label});
  }
  const tileW=418,tileH=278,tileGap=11;
  const tileRows=Math.ceil(activeCards.length/3);
  const seedHeight=catalogPresent?(activeCards.length?96+tileRows*(tileH+tileGap)+20:300):baseMeta.height;
  const height=seedHeight+cards.length*574;
  if(!catalogPresent&&cards.length===0) atomicWrite(path.join(dir,"board.png"),base);
  else {
    const layers=[];
    if(activeCards.length){
      const header=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="96"><rect width="100%" height="100%" fill="#101314"/><text x="20" y="41" font-family="Arial" font-size="28" fill="#eef0ea">A1 TYPOGRAPHY / SINGLE REFERENCE BOARD</text><text x="20" y="70" font-family="Arial" font-size="16" fill="#b3c0b5">GAWX scene grammar + 12-cell structure atlas / ${activeCards.length} visible / ${(board.dismissedIds||[]).length} hidden</text></svg>`);
      layers.push({input:header,left:0,top:0});
      for(const [index,item] of activeCards.entries()){
        const source=item.source==="gawx"?baseFile:atlasFile;
        const crop=await sharp(source).extract(item.crop).resize(tileW,tileH-38,{fit:"contain",background:"#191c1d"}).png().toBuffer();
        const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="38"><rect width="100%" height="100%" fill="#202526"/><text x="12" y="25" font-family="Arial" font-size="17" fill="#eef0ea">${escapeHtml(item.id.toUpperCase())}</text></svg>`);
        const x=12+(index%3)*(tileW+tileGap),y=96+Math.floor(index/3)*(tileH+tileGap);
        layers.push({input:label,left:x,top:y},{input:crop,left:x,top:y+38});
      }
    }else if(catalogPresent){
      const empty=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="300"><rect width="100%" height="100%" fill="#101314"/><text x="30" y="90" font-family="Arial" font-size="30" fill="#eef0ea">ALL REFERENCE CELLS HIDDEN</text><text x="30" y="135" font-family="Arial" font-size="18" fill="#aebbae">Restore cells in the 4311 typography board to use them again.</text></svg>`);
      layers.push({input:empty,left:0,top:0});
    }else layers.push({input:base,left:0,top:0});
    let y=seedHeight;
    for(const card of cards){layers.push({input:card.label,left:0,top:y},{input:card.image,left:20,top:y+54});y+=574;}
    const image=await sharp({create:{width,height,channels:4,background:"#0b0d0e"}}).composite(layers).png().toBuffer();
    atomicWrite(path.join(dir,"board.png"),image);
  }
  const entries=board.liked.map((item,index)=>`<article><div class="meta"><b>${String(index+1).padStart(2,"0")} · ${escapeHtml(item.title)}</b><span>${escapeHtml(item.role||"待定职责")} / ${escapeHtml(item.carrier||"待定载体")}</span></div><img src="${escapeHtml(relativeUrl(dir,path.join(dir,item.file)))}" alt="${escapeHtml(item.title)}"><p>喜欢的点：${escapeHtml(item.why)}</p><p>用户反馈：${escapeHtml(item.feedback.quote)}</p><small>原图 SHA ${item.sha256} · 作为设计参考，不代表正式生产批准</small></article>`).join("\n");
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>A1 字体设计唯一参考板</title><style>body{margin:0;background:#0c0f10;color:#e9eee8;font:16px/1.6 system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:24px}h1{font-size:27px;margin:0}p{color:#b5c2b8}.tag{color:#d4ff5a}img{display:block;max-width:100%;height:auto}article{border-top:1px solid #3b4a42;padding:24px 0}.meta{display:flex;gap:20px;align-items:baseline}.meta span,small{color:#9aaa9d}article img{margin:14px 0;max-height:680px;object-fit:contain;background:#171b1c}footer{border-top:1px solid #3b4a42;padding:22px 0;color:#9aaa9d}</style><main><header><h1>A1 字体设计唯一参考板</h1><p class="tag">Gawx 六格片内排版 + 12 格字形结构，合在同一个评审入口。</p><p>当前保留 ${activeCards.length} 格、排除 ${(board.dismissedIds||[]).length} 格。请到 <a href="http://127.0.0.1:4311/system-line-visual-workbench">4311 工作台</a>使用每格右上角的 × 和恢复操作。</p></header><h2>当前保留的参考</h2><img src="board.png" alt="当前保留的字体参考板"><details><summary>查看两张来源原图</summary><img src="${escapeHtml(relativeUrl(dir,baseFile))}" alt="Gawx 六格原图"><img src="${escapeHtml(relativeUrl(dir,atlasFile))}" alt="12 格结构板原图"></details><section><h2>已追加的喜欢设计 · ${board.liked.length}</h2>${entries||"<p>目前尚未追加。EVA 候选和失败出图均未获你的喜欢反馈，不在主板里。</p>"}</section><footer>这是字体设计参考权威，不改变 system-line 的 workspace、静态板批准或制作门槛。每个新设计保留原图 SHA、用户反馈与适用语境。</footer></main></html>`;
  atomicWrite(path.join(dir,"index.html"),html);
}

async function main(){
  const command=args[0];
  const dir=path.resolve(option("--board-dir")||defaultDir);
  if(command==="init"){
    if(fs.existsSync(path.join(dir,"board.json"))) throw new Error("board-already-initialized");
    if(sha(fs.readFileSync(baseFile))!==expectedBaseSha) throw new Error("base-board-sha-mismatch");
    fs.mkdirSync(path.join(dir,"assets"),{recursive:true});
    const catalog=sourceCards(dir);
    const board={contract:CONTRACT,scope:"SINGLE_TYPOGRAPHY_DESIGN_REFERENCE_BOARD",version:1,
      base:{file:relativeUrl(dir,baseFile),sha256:expectedBaseSha,role:"PRIMARY_SCENE_TYPE_RELATION_REFERENCE",cells:{"01":"stage word","02":"giant glyph and subject overlap","03":"full-frame editorial spread","04":"spatial-axis type","05":"quiet question","06":"rejected subtitle-like negative control"}},
      ...catalog,dismissedIds:["gawx-06"],liked:[],policy:{appendOnlyAfterExplicitUserLike:true,onePrimaryBoard:true,sourceBoardImmutable:true,notProductionApproval:true,wholeAtlasAsGenerationInput:false},createdAt:new Date().toISOString()};
    atomicWrite(path.join(dir,"board.json"),`${JSON.stringify(board,null,2)}\n`);
    await render(dir,board);
  }else if(command==="merge-atlas"){
    const board=readBoard(dir);
    if(board.atlas||board.cards) throw new Error("board-atlas-already-merged");
    Object.assign(board,sourceCards(dir),{dismissedIds:["gawx-06"]});
    atomicWrite(path.join(dir,"board.json"),`${JSON.stringify(board,null,2)}\n`);
    await render(dir,board);
  }else if(command==="add-liked"){
    const file=option("--file"),title=option("--title"),why=option("--why"),feedback=option("--feedback");
    if(!file||!title||!why||!feedback) throw new Error("liked-entry-requires-file-title-why-and-explicit-user-feedback");
    const board=readBoard(dir);
    const bytes=fs.readFileSync(path.resolve(file));
    const meta=await sharp(bytes).metadata();
    if(!meta.width||!meta.height) throw new Error("liked-image-must-decode");
    const digest=sha(bytes);
    if(board.liked.some((item)=>item.sha256===digest)) throw new Error("liked-image-already-on-board");
    const id=`like-${String(board.liked.length+1).padStart(2,"0")}-${digest.slice(0,10)}`;
    const asset=`assets/${id}.${meta.format==="jpeg"?"jpg":meta.format}`;
    fs.mkdirSync(path.join(dir,"assets"),{recursive:true});
    atomicWrite(path.join(dir,asset),bytes);
    board.liked.push({id,title,why,role:option("--role")||null,carrier:option("--carrier")||null,file:asset,sha256:digest,
      feedback:{quote:feedback,threadId:option("--thread")||null,recordedAt:new Date().toISOString()},status:"USER_LIKED_DESIGN_REFERENCE_NOT_PRODUCTION_APPROVAL"});
    atomicWrite(path.join(dir,"board.json"),`${JSON.stringify(board,null,2)}\n`);
    await render(dir,board);
  }else if(command==="render") await render(dir,readBoard(dir));
  else if(command!=="status") throw new Error("usage: init|merge-atlas|status|render|add-liked [--board-dir dir] [--file image --title text --why text --feedback exact-user-quote --role role --carrier carrier --thread id]");
  const board=readBoard(dir);
  console.log(JSON.stringify({contract:board.contract,board:path.join(dir,"board.png"),page:path.join(dir,"index.html"),baseSha256:board.base.sha256,atlasSha256:board.atlas?.sha256||null,cardCount:board.cards?.length||0,dismissedCount:board.dismissedIds?.length||0,likedCount:board.liked.length,liked:board.liked.map(({id,title,sha256})=>({id,title,sha256})),productionApproval:false},null,2));
}

await main();
