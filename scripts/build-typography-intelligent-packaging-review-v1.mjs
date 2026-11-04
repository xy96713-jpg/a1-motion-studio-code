#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {compileTypographyArticleDecisionPlanV1} from "../apps/studio-next/src/lib/a1-typography-article-decision-plan-v1.mjs";
import {A1_TYPOGRAPHY_EXCLUDED_REFERENCE_CELLS_V1, A1_TYPOGRAPHY_REFERENCE_MECHANISMS_V1} from "../apps/studio-next/src/lib/a1-typography-user-style-profile-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const sourceFile=path.join(root,"work/typography-director-v2/blind-fixtures/report.json");
const outputDir=path.join(root,"work/typography-intelligent-packaging-v1");
const anchorFile=path.join(root,"work/typography-visual-reset/gawx-source-study/chinese-adaptation-board-v2.png");
const sha=(value)=>crypto.createHash("sha256").update(value).digest("hex");
const xml=(value)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const source=JSON.parse(fs.readFileSync(sourceFile,"utf8"));
const articles=source.reports.map((report)=>compileTypographyArticleDecisionPlanV1({
  articleId:report.articleId,genre:report.genre,programMode:report.assignments[0]?.programMode,assignments:report.assignments,
}));
if(articles.length!==6||new Set(articles.map((article)=>article.genre)).size<3)throw new Error("typography-decision-holdout-coverage-invalid");

const families=new Map();
const styleMechanisms=new Map();
for(const article of articles)for(const decision of article.decisions){
  const referenceCell=decision.userStyle?.selectedReferenceCell;
  if(referenceCell){
    const currentStyle=styleMechanisms.get(referenceCell)||{count:0,mechanismId:decision.userStyle.selectedMechanismId,name:decision.userStyle.selectedMechanism.name};
    currentStyle.count+=1;
    styleMechanisms.set(referenceCell,currentStyle);
  }
  const id=decision.familyDecision.selectedFamilyId;
  if(!id)continue;
  const current=families.get(id)||{count:0,sourceContextProvided:0};
  current.count+=1;
  if(decision.familyDecision.sourceContextProvided)current.sourceContextProvided+=1;
  families.set(id,current);
}
const styleReference={path:path.relative(root,anchorFile),sha256:sha(fs.readFileSync(anchorFile)),use:"user-liked Gawx mechanism reference; article-level reference only, no automatic per-shot cell assignment"};
const body={contract:"A1TypographyIntelligentPackagingReview/v1",status:"REVIEW_ONLY",sourceReport:path.relative(root,sourceFile),sourceReportSha256:sha(fs.readFileSync(sourceFile)),
  styleReference,articleCount:articles.length,genreCount:new Set(articles.map((article)=>article.genre)).size,beatCount:articles.reduce((sum,article)=>sum+article.summary.shotCount,0),
  familyDistribution:Object.fromEntries([...families.entries()].sort(([a],[b])=>a.localeCompare(b))),
  sourceContextSelections:articles.reduce((sum,article)=>sum+article.summary.sourceContextSelections,0),
  roleEnvelopeOnlySelections:articles.reduce((sum,article)=>sum+article.summary.contextBlockers,0),
  sequenceFailures:articles.reduce((sum,article)=>sum+article.sequenceLedger.failures.length,0),
  articles,proofBoundary:{usesExistingRoleAuthority:true,usesExistingFamilySelector:true,usesExistingSequenceLedger:true,actualFrameBindings:0,referenceCellAssignments:0,imageGenerationPerformed:false,productionAdmission:false}};
fs.mkdirSync(outputDir,{recursive:true});
fs.writeFileSync(path.join(outputDir,"decision-plan.json"),`${JSON.stringify(body,null,2)}\n`);

const width=1440,cardW=700,cardH=300,gap=16,top=110;
const familyLabel={COMPRESSED_MING:"压缩明朝",EDITORIAL_MING:"编辑明朝",HEAVY_GOTHIC:"粗黑字",SLANTED_GROTESK:"倾斜黑体",HANDWRITTEN_ACCENT:"手写字",PIXEL_MICRO:"像素微标"};
const roleLabel={PRESENTER_HERO:"人物主标题",FULLSCREEN_HERO:"全屏主标题",CONCLUSION_STAMP:"结论标题",PRESENTER_MARKER:"人物短标",EXPLANATION_DIAGRAM:"流程解释",OBJECT_ATTACHED_LABEL:"物体标注",OBJECT_SURFACE_TYPE:"表面文字",CAPTION:"字幕"};
const genreLabel={"evidence-explainer":"证据讲解","product-tutorial":"产品教程","personal-opinion":"个人观点"};
const cards=articles.map((article,index)=>{
  const x=20+(index%2)*(cardW+gap),y=top+Math.floor(index/2)*(cardH+gap);
  const quiet=article.summary.routeCounts.NO_TYPE||0,source=(article.summary.routeCounts.SOURCE_BOUND_COPY||0),styled=article.summary.routeCounts.TYPE_FAMILY_CANDIDATE||0;
  const selected=article.decisions.filter((item)=>item.familyDecision.selectedFamilyId).slice(0,2);
  const lines=selected.length?selected.map((item,i)=>{
    const ordinal=String(item.order).padStart(2,"0"),family=familyLabel[item.familyDecision.selectedFamilyId]||item.familyDecision.selectedFamilyId;
    return `<text x="${x+22}" y="${y+143+i*65}" fill="#eee9dc" font-size="17">${ordinal} · ${xml(roleLabel[item.typographyRole]||item.typographyRole)} → ${xml(family)}</text><text x="${x+42}" y="${y+166+i*65}" fill="#9ca9a5" font-size="14">${xml(item.sourceCopy.slice(0,24))} · 等待真实画面与邻镜</text>`;
  }).join(""):`<text x="${x+22}" y="${y+160}" fill="#9ca9a5" font-size="16">保留原始画面；当前文章没有新增标题字族候选。</text>`;
 const mechanismLines=article.decisions.filter((item)=>item.userStyle?.selectedReferenceCell).slice(0,2).map((item,index)=>{
   const mechanism=item.userStyle.selectedMechanism;
   return `<text x="${x+22}" y="${y+252+index*17}" fill="#c8ff36" font-size="12">参考 ${mechanism.cell} · ${xml(mechanism.name)} · ${xml(item.semanticEvent)}</text>`;
 }).join("");
  const firstMechanism=article.decisions.find((item)=>item.userStyle?.selectedReferenceCell);
  const mechanism=firstMechanism?.userStyle.selectedMechanism;
  const mechanismLine=mechanism?`<text x="${x+22}" y="${y+258}" fill="#c8ff36" font-size="12">参考 ${mechanism.cell} · ${xml(mechanism.name)} · ${xml(firstMechanism.semanticEvent)}；其他镜头详见决策 JSON</text>`:"";
  return `<g><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#121718" stroke="#34403f"/><rect x="${x}" y="${y}" width="6" height="${cardH}" fill="#c8ff36"/><text x="${x+22}" y="${y+34}" fill="#eee9dc" font-size="19" font-weight="700">${xml(genreLabel[article.genre]||article.genre)} · ${xml(article.articleId)}</text><text x="${x+22}" y="${y+65}" fill="#9ca9a5" font-size="14">${article.summary.shotCount} 镜 · 整篇节奏审计通过</text><text x="${x+22}" y="${y+91}" fill="#71807a" font-size="13">无字 ${quiet} · 来源原字 ${source} · 需要新增文字 ${styled}</text><text x="${x+22}" y="${y+116}" fill="#f4b64a" font-size="13">字族建议 ${article.summary.familySelections} · 需绑定真实底片 ${article.summary.contextBlockers}</text>${lines}${mechanismLine}<text x="${x+22}" y="${y+290}" fill="#71807a" font-size="12">参考机制仅为提案 · 实际画面审美与合成尚未验证</text></g>`;
}).join("");
const mechanismSummary=Object.entries(A1_TYPOGRAPHY_REFERENCE_MECHANISMS_V1).map(([id,item])=>`${item.cell} ${item.name}`).join(" · ");
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="1060" viewBox="0 0 ${width} 1060"><rect width="100%" height="100%" fill="#080b0b"/><g font-family="Arial,sans-serif"><text x="20" y="35" fill="#c8ff36" font-size="22" font-weight="700">文章字体决策 · 6 篇盲测 / 3 类内容</text><text x="20" y="65" fill="#a8b2ad" font-size="15">镜头职责 → 是否加字 → 字族建议 → 参考机制；每个机制按内容选用，不套统一版式。</text><text x="20" y="88" fill="#71807a" font-size="12">${xml(mechanismSummary)} · 06 已按用户反馈排除（近似普通字幕）。</text>${cards}</g></svg>`;
fs.writeFileSync(path.join(outputDir,"decision-sheet.svg"),svg);
await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir,"decision-sheet.png"));
const styleRows=Object.values(A1_TYPOGRAPHY_REFERENCE_MECHANISMS_V1).map((item,index)=>
  `<text x="972" y="${145+index*92}" fill="#c8ff36" font-size="17" font-weight="700">${item.cell} · ${xml(item.name)}</text><text x="972" y="${171+index*92}" fill="#eee9dc" font-size="13">适合：${xml(item.sceneFit.join(" / "))}</text><text x="972" y="${193+index*92}" fill="#9ca9a5" font-size="12">关系：${xml(item.traits.slice(0,2).join("、"))}</text><text x="972" y="${215+index*92}" fill="#7fcfc0" font-size="11">字族候选：${xml(item.preferredFamilyIds.join(" / "))}</text>`).join("");
const profileSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="740" viewBox="0 0 1440 740"><rect width="100%" height="100%" fill="#080b0b"/><g font-family="Arial,sans-serif"><text x="24" y="38" fill="#c8ff36" font-size="23" font-weight="700">用户参考风格档案 · 按镜头选手法</text><text x="24" y="64" fill="#a8b2ad" font-size="14">提取文字与画面的关系；不套统一模板、不复制参考文案。06 已排除：接近普通字幕。</text><rect x="20" y="82" width="920" height="560" fill="#111" stroke="#394341"/><text x="24" y="680" fill="#8f9994" font-size="13">录屏保留原生界面；口播允许主标题穿插；物件文字必须绑定真实物体或空间锚点。</text>${styleRows}<text x="972" y="628" fill="#f4b64a" font-size="15">不确定画面关系时：先补真实镜头上下文，不猜构图。</text></g></svg>`;
const profileBoard=await sharp(anchorFile).resize(920,560,{fit:"contain",background:"#111"}).png().toBuffer();
const excludedCellOverlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="740"><rect x="480" y="455" width="300" height="185" rx="8" fill="#101314" fill-opacity=".93" stroke="#ef596a" stroke-width="3"/><text x="630" y="525" text-anchor="middle" fill="#ef596a" font-family="Arial" font-size="25" font-weight="700">06 · 已排除</text><text x="630" y="559" text-anchor="middle" fill="#eee9dc" font-family="Arial" font-size="17">接近普通字幕</text><text x="630" y="588" text-anchor="middle" fill="#9ca9a5" font-family="Arial" font-size="13">不作为包装参考</text></svg>`);
const profilePlate=await sharp(Buffer.from(profileSvg)).composite([{input:profileBoard,left:20,top:82},{input:excludedCellOverlay,left:0,top:0}]).png().toBuffer();
const profileSheetPath=path.join(outputDir,"style-preference-sheet.png");
fs.writeFileSync(profileSheetPath,profilePlate);
const fixtures=articles.map((article)=>({id:article.articleId,genre:article.genre,status:article.sequenceLedger.failures.length===0?"PASS_REVIEW_ONLY":"FAIL",beatCount:article.summary.shotCount}));
const styleRhythm={strongType:articles.reduce((sum,article)=>sum+article.styleSequencePlan.counts.strongType,0),quietLine:articles.reduce((sum,article)=>sum+article.styleSequencePlan.counts.quietLine,0),noType:articles.reduce((sum,article)=>sum+article.styleSequencePlan.counts.noType,0),sourceNative:articles.reduce((sum,article)=>sum+article.styleSequencePlan.counts.sourceNative,0),strongToQuietTransitions:articles.reduce((sum,article)=>sum+article.styleSequencePlan.contrastTransitions.length,0),repeatedStrongRuns:articles.reduce((sum,article)=>sum+article.styleSequencePlan.repeatedStrongRuns.length,0),fixedFrequencyRule:false};
const report={contract:"A1TypographyIntelligentPackagingBuildReport/v1",status:body.sequenceFailures?"FAIL":"PASS",passScope:"semantic-role-and-reference-mechanism-planning-only",articleCount:body.articleCount,genreCount:body.genreCount,beatCount:body.beatCount,fixtures,
  familyDistribution:body.familyDistribution,styleMechanismDistribution:Object.fromEntries([...styleMechanisms.entries()].sort(([a],[b])=>a.localeCompare(b))),styleRhythm,excludedReferenceCells:A1_TYPOGRAPHY_EXCLUDED_REFERENCE_CELLS_V1,sourceContextSelections:body.sourceContextSelections,roleEnvelopeOnlySelections:body.roleEnvelopeOnlySelections,sequenceFailures:body.sequenceFailures,
  sourceContextBlocker:"No real hold frames or adjacent frames were included in the six blind fixtures; selected families and reference cells are mechanism proposals only.",referenceBindingStatus:"REFERENCE_CELL_SELECTED_PER_BEAT_ATTACHMENT_NOT_DISPATCHED",imageGenerationPerformed:false,productionAdmission:false,
  actualPixelVisualReview:"NOT_RUN",userStyleMechanismsAreProposals:true,
  stylePreferenceSheet:{file:"work/typography-intelligent-packaging-v1/style-preference-sheet.png",sha256:sha(fs.readFileSync(profileSheetPath))},
  decisionPlanSha256:sha(Buffer.from(JSON.stringify(body))),visibleArtifact:{file:"work/typography-intelligent-packaging-v1/decision-sheet.png",sha256:sha(fs.readFileSync(path.join(outputDir,"decision-sheet.png")))} };
fs.writeFileSync(path.join(outputDir,"build-report.json"),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
