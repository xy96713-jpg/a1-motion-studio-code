#!/usr/bin/env node
import {continueProductionV1} from '../apps/studio-next/src/lib/a1-production-continuation-v1.mjs';
import {bindExistingDesignResourcesV1} from '../apps/studio-next/src/lib/a1-production-resource-binding-v1.mjs';
import {adoptProductionWorkScopeV1,adoptStaticVisualQualityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {reconcileProductionExistingWorkV1,resolveExistingGenerationV1} from '../apps/studio-next/src/lib/a1-production-existing-work-v1.mjs';
import {prepareDirectorGlyphBatchV1,bindReviewedDirectorGlyphResultsV1,reviewDirectorGlyphBatchV1} from '../apps/studio-next/src/lib/a1-director-glyph-tasks-v1.mjs';
import {runProductionBatchV1} from '../apps/studio-next/src/lib/a1-production-batch-runner-v1.mjs';
import {runReferenceSequenceDirectorV1,runReferenceDesignBatchV1} from '../apps/studio-next/src/lib/a1-reference-visual-director-v2.mjs';
import {adoptGlobalDirectorPlanV1,adoptReferenceDesignBatchV1,adoptReferenceLayoutBatchV1} from '../apps/studio-next/src/lib/a1-director-production-plan-v1.mjs';
import {applyProductionMaterialSelectionsV1} from '../apps/studio-next/src/lib/a1-production-material-resolution-v1.mjs';
import {registerProductionBatchV1,reviewProductionBatchV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
import {prepareFullFrameBatchV1,bindFullFrameBatchV1,adoptSourcedFrameInputsV1,bindReviewedReferenceStatesV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {runProductionFramePlannerV1} from '../apps/studio-next/src/lib/a1-production-frame-planner-v1.mjs';
import {runProductionFramePipelineV1} from '../apps/studio-next/src/lib/a1-production-frame-pipeline-v1.mjs';

const adoption=async(fn,options,status)=>{const runtime=await fn(options);return {status,pending:runtime.pending,planSha256:runtime.inputPlanSha256};};
const operations={
 continue:{kind:'execution',label:'按当前目标连续推进至关卡',run:continueProductionV1},
 'set-static-quality':{kind:'metadata',label:'绑定整图近似审看标准',run:adoptStaticVisualQualityV1},
 'prepare-frames':{kind:'metadata',label:'准备多参考完整静帧',run:prepareFullFrameBatchV1},
 'plan-frames':{kind:'model',label:'自动选用项目素材并编排完整静帧',needsCodex:true,run:runProductionFramePlannerV1},
 'auto-frames':{kind:'execution',label:'自动编排、制作、审查并回收完整静帧',needsCodex:true,run:runProductionFramePipelineV1},
 'bind-source-card':{kind:'metadata',label:'绑定已核正文与资料卡输入',run:adoptSourcedFrameInputsV1},
 'bind-state-review':{kind:'metadata',label:'绑定实际参考状态的包装判断',run:bindReviewedReferenceStatesV1},
 'bind-frames':{kind:'metadata',label:'将完整静帧接回原合成节点',run:bindFullFrameBatchV1},
 'set-work-scope':{kind:'metadata',label:'绑定本轮目标与镜头范围',run:adoptProductionWorkScopeV1},
 'reconcile-existing':{kind:'metadata',label:'对账并绑定既有通过范围',run:async o=>{const {rows,...summary}=await reconcileProductionExistingWorkV1(o);return summary;}},
 'resolve-existing':{kind:'metadata',label:'按证据停用旧生成请求',run:resolveExistingGenerationV1},
 design:{kind:'model',label:'全局叙事设计',needsCodex:true,run:async o=>{const d=await runReferenceSequenceDirectorV1(o);return {status:'GLOBAL_DESIGN_PROPOSAL',shots:d.shots.length,trace:d.trace,visualApproval:false};}},
 'adopt-design':{kind:'metadata',label:'绑定全局设计',run:o=>adoption(adoptGlobalDirectorPlanV1,o,'GLOBAL_DESIGN_BOUND')},
 'detail-design':{kind:'model',label:'分组细化参考设计',needsCodex:true,run:runReferenceDesignBatchV1},
 'adopt-detail-design':{kind:'metadata',label:'绑定细化提案及缺项',run:o=>adoption(adoptReferenceDesignBatchV1,o,'DETAIL_DESIGNS_BOUND_PENDING_EXECUTION_INPUTS')},
 'layout-design':{kind:'model',label:'补充已有设计的几何',needsCodex:true,run:o=>runReferenceDesignBatchV1({...o,layoutOnly:true})},
 'adopt-layout-design':{kind:'metadata',label:'绑定几何草案',run:o=>adoption(adoptReferenceLayoutBatchV1,o,'LAYOUT_DRAFTS_BOUND')},
 'resolve-materials':{kind:'network',label:'回收并绑定已审查素材',run:applyProductionMaterialSelectionsV1},
 'prepare-glyphs':{kind:'metadata',label:'准备确有必要的字形任务',run:prepareDirectorGlyphBatchV1},
 'review-glyphs':{kind:'model',label:'独立核对已生成字形与参考',needsCodex:true,run:reviewDirectorGlyphBatchV1},
 'bind-design-resources':{kind:'metadata',label:'将已有素材绑定到完整画面设计',run:bindExistingDesignResourcesV1},
 'bind-glyphs':{kind:'metadata',label:'绑定已回收字形及真实评审',run:bindReviewedDirectorGlyphResultsV1},
 execute:{kind:'execution',label:'推进原节点并按交付类型验收',run:async o=>{const r=await runProductionBatchV1(o);return {status:r.status,taskId:r.taskId,outputs:r.outputs.length,assetOutputs:r.assetOutputs?.length||0,completion:r.completion,
   claims:r.claims,newClaims:r.newClaims??r.claims,elapsedMs:r.elapsedMs,reusedCompletedRun:r.reusedCompletedRun,blocked:r.blocked,verificationErrors:r.verificationErrors};}},
 'review-batch':{kind:'model',label:'按整图近似标准集中审看',needsCodex:true,run:reviewProductionBatchV1},
 register:{kind:'metadata',label:'将已评审静态候选登记并读回',run:registerProductionBatchV1},
};
export const productionOperationDescriptionsV1=()=>Object.entries(operations).map(([operation,{kind,label,needsCodex}])=>({operation,kind,label,needsCodex:needsCodex===true}));

export async function runProductionCliV1(args){
 if(args.length===1&&args[0]==='--list-operations')return productionOperationDescriptionsV1();
 if(args.length===1&&args[0]==='--help')return {usage:'node scripts/run-production-batch-v1.mjs --task <task> --phase <phase> [--operation <name>] [--codex <installed-executable>]',operations:productionOperationDescriptionsV1()};
 const get=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
 if(!get('--task')||!get('--phase')||args.length%2||args.filter((_,i)=>i%2===0).some(k=>!['--task','--phase','--operation','--codex','--shots','--objective','--expected-plan-sha','--quality-mode'].includes(k)))throw Error('Invalid production arguments; use --help');
 const operation=operations[get('--operation')||'execute'];if(!operation)throw Error('unknown production operation');
 if(operation.needsCodex&&!get('--codex'))throw Error('installed codex executable required');
 return operation.run({repoRoot:path.resolve(import.meta.dirname,'..'),taskId:get('--task'),phaseId:get('--phase'),shotIds:get('--shots')?.split(','),objective:get('--objective'),expectedPlanSha256:get('--expected-plan-sha'),qualityMode:get('--quality-mode'),...(get('--codex')?{executable:get('--codex')}:{})});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){console.log(JSON.stringify(await runProductionCliV1(process.argv.slice(2)),null,2));}
