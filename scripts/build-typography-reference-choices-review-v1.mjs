#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {compileTypographyReferenceChoicesV1} from "../apps/studio-next/src/lib/a1-typography-reference-choices-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputDir = path.join(root, "work/typography-reference-choices-review-v1");
const candidateArg = process.argv.indexOf("--eva-candidate");
if (candidateArg < 0 || !process.argv[candidateArg + 1]) throw new Error("pass --eva-candidate <review-image-path>");
const evaCandidatePath = path.resolve(process.argv[candidateArg + 1]);
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileFromPublicUrl = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const xml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const board = readJson(path.join(generatedRoot, "whole-film-static-board-v1/board-manifest.json"));
const film = readJson(path.join(root, "work/single-film-typography-vocabulary-director-v1/whole-film-typography-director-v3.json"));
const workspace = readJson(path.join(generatedRoot, "workspace.json"));
const ed01Context = workspace.production.shotIntelligence.videoPackagingContexts.items.find((item) => item.shotId === "ED-01");
assert.ok(ed01Context?.baseFrame?.publicUrl && ed01Context.baseFrame.sha256, "current ED-01 source binding required");

const examples = [
  {shotId:"ED-01", carrierType:"PRESENTER", source:"REAL_HOLD_FRAME", duty:"identity; compare EVA and incumbent"},
  {shotId:"ED-02", carrierType:"SCREEN_RECORDING", source:"CURRENT_SOURCE_PREVIEW", duty:"keep live interface native"},
  {shotId:"ED-08", carrierType:"PRESENTER", source:"CURRENT_SOURCE_PREVIEW", duty:"quiet presenter beat"},
  {shotId:"ED-10", carrierType:"FULLSCREEN_IMAGE", source:"CURRENT_BOARD_COMPOSITE", duty:"verdict; current design is not a clean base"},
  {shotId:"ED-14", carrierType:"FULLSCREEN_IMAGE", source:"CURRENT_BOARD_COMPOSITE", duty:"evidence copy stays source bound"},
  {shotId:"ED-17", carrierType:"FULLSCREEN_IMAGE", source:"CURRENT_BOARD_COMPOSITE", duty:"process diagram; no forced display title"},
];

const records = [];
for (const example of examples) {
  const assignment = film.assignments.find((item) => item.shotId === example.shotId);
  const item = board.timelineItems.find((entry) => entry.shotId === example.shotId);
  assert.ok(assignment && item?.preview?.publicUrl && item.preview.sha256, `current assignment and preview required: ${example.shotId}`);
  const binding = example.shotId === "ED-01" ? ed01Context.baseFrame : item.preview;
  const file = fileFromPublicUrl(binding.publicUrl);
  const bytes = fs.readFileSync(file);
  assert.equal(hash(bytes), binding.sha256, `source or preview SHA mismatch: ${example.shotId}`);
  const metadata = await sharp(bytes).metadata();
  assert.ok(metadata.width > 0 && metadata.height > 0, `image must decode: ${example.shotId}`);
  const sourceFrameKind = example.source === "REAL_HOLD_FRAME" ? "VERIFIED_REAL_SOURCE"
    : example.source === "CURRENT_SOURCE_PREVIEW" && item.preview.provenance === "VERIFIED_PRESENTER_SOURCE" ? "VERIFIED_REAL_SOURCE"
      : example.source;
  const decision = compileTypographyReferenceChoicesV1({
    typographyRole: assignment.typographyRole,
    carrierType: example.carrierType,
    semanticEvent: assignment.semanticEvent,
    exactCopy: assignment.exactCopy,
    heroCopy: example.shotId === "ED-01" ? assignment.generatedTypographyPlan?.displayGroups?.find((group) => /\p{Script=Han}/u.test(group)) : undefined,
    shotVisualContext: {frame:{sha256:binding.sha256,width:metadata.width,height:metadata.height}},
    sourceFrameKind,
    adjacentShotIds: board.timelineItems.slice(Math.max(0, board.timelineItems.indexOf(item)-1), board.timelineItems.indexOf(item)+2)
      .filter((neighbor) => neighbor.shotId !== example.shotId).map((neighbor) => neighbor.shotId),
  });
  records.push({shotId:example.shotId,duty:example.duty,sourceKind:sourceFrameKind,
    image:{file:path.relative(root,file),sha256:binding.sha256,width:metadata.width,height:metadata.height,provenance:item.preview.provenance},
    decision});
}

const evaBytes = fs.readFileSync(evaCandidatePath);
const evaMeta = await sharp(evaBytes).metadata();
assert.ok(evaMeta.width > 0 && evaMeta.height > 0, "EVA review candidate must decode");
const evaSample = {file:evaCandidatePath,sha256:hash(evaBytes),width:evaMeta.width,height:evaMeta.height,
  status:"REVIEW_ONLY_UNAPPROVED",use:"glyph-shape comparison only; generated frame is not clean source proof"};
const objectControl = compileTypographyReferenceChoicesV1({typographyRole:"OBJECT_ATTACHED_LABEL",carrierType:"OBJECT_DETAIL",
  semanticEvent:"DETAIL",exactCopy:"物件标注",sourceFrameKind:"MISSING_REAL_OBJECT_SOURCE"});
assert.equal(records[0].decision.evaAkiraCandidate.status,"ELIGIBLE_FOR_SOURCE_BOUND_COMPARISON");
assert.equal(records[1].decision.route,"KEEP_SOURCE_NATIVE");
assert.equal(records[2].decision.route,"KEEP_QUIET");
assert.equal(objectControl.evaAkiraCandidate.status,"NOT_ELIGIBLE_ON_THIS_INPUT");

fs.mkdirSync(outputDir,{recursive:true});
const tileW=620,tileH=350,gap=16,pad=20,cols=3,rows=3;
const width=pad*2+cols*tileW+(cols-1)*gap;
const height=pad*2+rows*tileH+(rows-1)*gap;
const canvas=sharp({create:{width,height,channels:4,background:"#0b0d0e"}});
const tiles=[
  ...records.map((record)=>({id:record.shotId,label:`${record.shotId}  ${record.decision.route}`,
    sub:`${record.sourceKind}  |  EVA: ${record.decision.evaAkiraCandidate.status === "ELIGIBLE_FOR_SOURCE_BOUND_COMPARISON" ? "COMPARE" : "HOLD"}`,
    file:path.join(root,record.image.file)})),
  {id:"EVA",label:"EVA / AKIRA  REVIEW CANDIDATE",sub:"ED-01 glyph direction; source preservation unproven",file:evaCandidatePath},
];
const layers=[];
for(let index=0;index<tiles.length;index++){
  const tile=tiles[index];
  const left=pad+(index%cols)*(tileW+gap),top=pad+Math.floor(index/cols)*(tileH+gap);
  const img=await sharp(tile.file).resize(tileW,tileH-72,{fit:"contain",background:"#181c1e"}).png().toBuffer();
  const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="72"><rect width="100%" height="100%" fill="#171c1e"/><text x="14" y="29" font-family="Arial" font-size="19" fill="#edf1ea">${xml(tile.label)}</text><text x="14" y="55" font-family="Arial" font-size="13" fill="#b1bfab">${xml(tile.sub)}</text></svg>`);
  layers.push({input:label,left,top},{input:img,left,top:top+72});
}
const missingLeft=pad+(tiles.length%cols)*(tileW+gap),missingTop=pad+Math.floor(tiles.length/cols)*(tileH+gap);
const missing=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}"><rect width="100%" height="100%" fill="#191c1e" stroke="#bd745b" stroke-width="2"/><text x="24" y="62" font-family="Arial" font-size="23" fill="#f1ded0">OBJECT DETAIL  /  UNPROVEN</text><text x="24" y="102" font-family="Arial" font-size="17" fill="#bdafa4">No verified real object frame and anchor</text><text x="24" y="134" font-family="Arial" font-size="17" fill="#bdafa4">in this bounded review input.</text><text x="24" y="180" font-family="Arial" font-size="14" fill="#b1bfab">Do not turn a generated diagram into object proof.</text></svg>`);
layers.push({input:missing,left:missingLeft,top:missingTop});
const summaryLeft=pad+2*(tileW+gap),summaryTop=pad+2*(tileH+gap);
const summary=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}"><rect width="100%" height="100%" fill="#18201b" stroke="#8fae8e" stroke-width="2"/><text x="24" y="60" font-family="Arial" font-size="23" fill="#ecf3e7">REVIEW CHECKPOINT</text><text x="24" y="108" font-family="Arial" font-size="18" fill="#c3d4c0">6 current-shot decisions</text><text x="24" y="143" font-family="Arial" font-size="18" fill="#c3d4c0">1 EVA comparison route, 0 approved</text><text x="24" y="178" font-family="Arial" font-size="18" fill="#c3d4c0">Screen / evidence / quiet beats protected</text><text x="24" y="230" font-family="Arial" font-size="16" fill="#a9b9a7">No new ImageGen or formal-board write.</text><text x="24" y="261" font-family="Arial" font-size="16" fill="#a9b9a7">Motion and production gates remain closed.</text></svg>`);
layers.push({input:summary,left:summaryLeft,top:summaryTop});
const boardPath=path.join(outputDir,"source-bound-decision-board.png");
await canvas.composite(layers).png().toFile(boardPath);
const report={contract:"A1TypographyReferenceChoicesReview/v1",status:"REVIEW_ONLY",currentBoardItemCount:board.timelineItems.length,
  examples:records,evaSample,objectControl,board:{file:path.relative(root,boardPath),sha256:hash(fs.readFileSync(boardPath))},
  proofBoundary:{actualCurrentPixelsInspected:true,realObjectCarrierProved:false,newTypographyGenerated:false,
    visualApproval:false,productionAdmission:false,workspaceOrStaticBoardMutated:false}};
fs.writeFileSync(path.join(outputDir,"report.json"),`${JSON.stringify(report,null,2)}\n`);
fs.writeFileSync(path.join(outputDir,"README.md"),`# 字体参考选择｜真实画面评审\n\n这张板把当前影片的真实源帧或当前静态板像素与可运行的参考选择结果并列，**不替换正式分镜或当前整片静态板**。\n\n- ED-01：真实口播底帧允许对照 EVA/Akira 窄字与现有参考机制；候选 v3 只作字形方向样例，尚未证明原片像素不变，也未获视觉批准。\n- ED-02：录屏保留原生界面，不加生成式主标题。\n- ED-08：干净口播保持无字。\n- ED-10：当前结论画面可讨论字体机制，但现有板图是完整合成，不能冒充可供生成的新底片。\n- ED-14：研究证据和译文保持来源绑定。\n- ED-17：当前是流程解释插画，不算真实物件镜头。真实物件特写与物件锚点在本轮没有证据，明确留为未验证。\n\n生成命令：\n\n\`\`\`sh\nnode scripts/test-typography-reference-choices-v1.mjs\nnode scripts/build-typography-reference-choices-review-v1.mjs --eva-candidate /absolute/path/to/ED-01-eva-akira-candidate-v3.png\n\`\`\`\n\n可审文件：[对照板](source-bound-decision-board.png)和 [逐镜决定及拒绝原因](report.json)。本轮只证明当前样例的可执行路由、文件 SHA 和画面可解码；没有做新字形生成、逐帧合成、整片动态评审或生产准入。\n`);
console.log(JSON.stringify({status:report.status,examples:records.map(({shotId,decision})=>({shotId,route:decision.route,eva:decision.evaAkiraCandidate.status})),
  objectControl:objectControl.evaAkiraCandidate.status,board:report.board,proofBoundary:report.proofBoundary},null,2));
