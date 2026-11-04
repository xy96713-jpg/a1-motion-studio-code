#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=process.cwd();const boardPhase="visual-ai-design-board-v2-proof";const renderPhase="visual-ai-design-sequence-v2-proof";
const boardPath=path.join(root,"apps/studio-next/public/generated/system-line",boardPhase,"design-board.json");
const renderPath=path.join(root,"apps/studio-next/public/generated/system-line",renderPhase,"render-report.json");
const board=JSON.parse(fs.readFileSync(boardPath,"utf8"));const render=JSON.parse(fs.readFileSync(renderPath,"utf8"));
const shaFile=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`);};
const failures=[];const check=(id,pass,detail=null)=>{if(!pass)failures.push({id,detail});};
check("board-ready",board.status==="READY_FOR_STATIC_CANDIDATE_RENDER",board.status);
check("ai-designed-no-fallback",board.aiDesigned===true&&board.fallbackUsed===false,{aiDesigned:board.aiDesigned,fallbackUsed:board.fallbackUsed});
check("two-ai-pass-traces",board.traces?.length===2&&new Set(board.traces.map((trace)=>trace.pass)).size===2);
check("all-shots-ready",board.summary?.readyCount===board.summary?.shotCount&&board.summary?.blockedCount===0,board.summary);
check("independent-families",new Set(board.shots?.map((shot)=>shot.selectedTopology)).size>=4);
check("selected-candidate-preserved",board.shots?.every((shot)=>shot.candidateEvaluations?.some((candidate)=>candidate.selectedByAi&&candidate.topology===shot.selectedTopology&&candidate.selectableWithoutChangingAiDecision===true)));
check("material-source-grounding",board.shots?.every((shot)=>["typography-only","deterministic-shape"].includes(shot.materialRoute)||shot.materialBindings?.every((binding)=>binding.reviewed&&binding.sourceUri&&/^[a-f0-9]{64}$/u.test(binding.sha256))));
check("motion-ir-scenes",board.motionIr?.contract==="A1MotionIR/v2"&&board.motionIr?.scenes?.length===board.shots?.length&&board.motionIr.scenes.every((scene)=>scene.kineticTypography?.contract==="A1KineticTypographyPlan/v1"&&scene.actors?.length>=3));
const pixelFontRoles = new Set(["handwritten-pixel-accent", "terminal-metadata", "cjk-pixel-impact", "micro-pixel-label"]);
const consumedPixelFontRoles = [...new Set((board.shots || []).flatMap((shot) => (shot.wordActors || []).map((actor) => actor.fontRole).filter((role) => pixelFontRoles.has(role))))];
check("pixel-font-roles-consumed", consumedPixelFontRoles.length >= 3, consumedPixelFontRoles);
check("render-pass",render.status==="PASS"&&render.truth?.aiDesigned===true&&render.truth?.fallbackUsed===false);
check("complete-video",fs.existsSync(path.join(root,"apps/studio-next/public",render.video.publicUrl))&&render.video.durationSec===24);
check("six-proof-frames",render.proofFrames?.length===6&&render.proofFrames.every((frame)=>fs.existsSync(path.join(root,"apps/studio-next/public",frame.publicUrl))));
check("five-transition-pairs",render.transitionStrip?.frames?.length===10&&fs.existsSync(path.join(root,"apps/studio-next/public",render.transitionStrip.publicUrl)));
check("authority-unchanged",render.currentAuthority?.unchanged===true);
const hf=spawnSync("npx",["--yes","hyperframes@0.7.83","check","--json"],{cwd:path.join(root,"hyperframes/visual-ai-design-sequence-v2"),encoding:"utf8",maxBuffer:20*1024*1024});
check("hyperframes-command",hf.status===0,hf.stderr||hf.stdout);const hyperframes=hf.status===0?JSON.parse(hf.stdout):null;
check("hyperframes-clean",hyperframes?.ok===true&&hyperframes.lint.warningCount===0&&hyperframes.runtime.errorCount===0&&hyperframes.layout.totalIssueCount===0&&hyperframes.motion.errorCount===0&&hyperframes.contrast.warningCount===0);
const report={
  contract:"A1VisualAiDesignSequenceAuditReport/v2",phaseId:renderPhase,
  status:failures.length?"BLOCKED":"VISUAL_REJECTED_SYSTEM_REVISION_REQUIRED",failures,
  source:{boardPath:path.relative(root,boardPath),boardSha256:shaFile(boardPath),renderPath:path.relative(root,renderPath),renderSha256:shaFile(renderPath)},
  truth:{aiDesigned:board.aiDesigned,fallbackUsed:board.fallbackUsed,articleStrategyTrace:board.traces?.find((trace)=>trace.pass==="article-visual-strategy")||null,contextualShotTrace:board.traces?.find((trace)=>trace.pass==="contextual-shot-design")||null},
  summary:{shotCount:board.summary?.shotCount,readyCount:board.summary?.readyCount,independentRendererFamilies:new Set(board.shots?.map((shot)=>shot.selectedTopology)).size,motionActorCount:board.motionIr?.scenes?.reduce((sum,scene)=>sum+(scene.actors?.length||0),0),materialBindingCount:board.summary?.materialBindingCount,transitionPairCount:(render.transitionStrip?.frames?.length||0)/2,durationSec:render.video?.durationSec},
  hyperframes:hyperframes?{ok:hyperframes.ok,version:hyperframes._meta?.version,lintWarnings:hyperframes.lint.warningCount,runtimeErrors:hyperframes.runtime.errorCount,layoutIssues:hyperframes.layout.totalIssueCount,motionErrors:hyperframes.motion.errorCount,contrastWarnings:hyperframes.contrast.warningCount}:null,
  visualReview:{status:"REJECTED_BY_INDEPENDENT_VISUAL_AUDIT",contactSheet:render.contactSheet,transitionStrip:render.transitionStrip,video:render.video,rejectionEvidence:{sourceThreadId:"019fb19f-8eed-7521-8278-3d25fc16e324",verdict:"The six-shot candidate remains constrained by card and panel primitives and does not meet the material-first editorial reference bar.",blockers:["floating-model-logo-cards","white-document-card-and-sidebar-primitives","shared-black-paper-blue-yellow-panel-grammar",...(consumedPixelFontRoles.length < 3 ? ["pixel-font-role-consumption-missing"] : [])]}},
  typography:{contract:"A1CreatorMaterialPixelType/v1",consumedPixelFontRoles,assetPlan:"apps/studio-next/public/generated/system-line/creator-material-pixel-type-v1/plan.json"},
  gates:{humanVisualApproval:"REJECTED",rendererAdoptionAllowed:false,h47ExpansionAllowed:false,currentAuthorityUnchanged:render.currentAuthority?.unchanged===true,nextRequiredProof:"creator-material-pixel-type-v1-three-static-frames"},
};
const publicPath=path.join(root,"apps/studio-next/public/generated/system-line",renderPhase,"audit-report.json");const artifactPath=path.join(root,".codex-artifacts/system-progress-system-line",renderPhase,"audit-report.json");writeJson(publicPath,report);writeJson(artifactPath,report);console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
