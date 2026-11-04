#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {A1VisualFamilyIdSchema, compileA1VisualAiDesignBoardV2, type A1VisualMaterialBindingV2} from "../apps/studio-next/src/lib/a1-visual-ai-design-board-v2.ts";

const root=process.cwd();
const directorReport=JSON.parse(fs.readFileSync(path.join(root,"apps/studio-next/public/generated/system-line/visual-ai-director-v2-proof/report.json"),"utf8"));
const board=JSON.parse(fs.readFileSync(path.join(root,"apps/studio-next/public/generated/system-line/visual-ai-design-board-v2-proof/design-board.json"),"utf8"));
const rendererFamilies=Object.fromEntries(A1VisualFamilyIdSchema.options.map((family)=>[family,true]));
const materials=[...new Map(board.shots.flatMap((shot:{materialBindings:A1VisualMaterialBindingV2[]})=>shot.materialBindings).map((binding:A1VisualMaterialBindingV2)=>[binding.bindingId,binding])).values()] as A1VisualMaterialBindingV2[];
const compile=(director:unknown=directorReport.visualDirector,materialInventory=materials,renderers=rendererFamilies)=>compileA1VisualAiDesignBoardV2({projectId:"visual-ai-design-board-v2-test",sourceTextSha256:directorReport.source.sourceTextSha256,director,rendererFamilies:renderers,materials:materialInventory});
const failures:string[]=[];const assert=(pass:boolean,id:string)=>{if(!pass)failures.push(id);};
const ready=compile();
assert(ready.status==="READY_FOR_STATIC_CANDIDATE_RENDER","complete-input-ready");
assert("motionIr" in ready&&ready.motionIr.scenes.length===6&&ready.motionIr.scenes.every((scene)=>scene.actors.length>=3),"motion-ir-compiled");
const missingRenderer=compile(directorReport.visualDirector,materials,{...rendererFamilies,"R01-image-title-collision":false});
assert(missingRenderer.status==="BLOCKED"&&missingRenderer.fallbackUsed===false&&missingRenderer.blockers.some((item)=>item.includes("BLOCKED_RENDERER_FAMILY_MISSING:R01")),"missing-renderer-blocks-without-fallback");
const invalidDirector=compile({...directorReport.visualDirector,status:"blocked",aiDesigned:false});
assert(invalidDirector.status==="BLOCKED_AI_DIRECTOR_INVALID"&&invalidDirector.aiDesigned===false&&invalidDirector.fallbackUsed===false,"blocked-ai-cannot-claim-design");
const missingEntity=compile(directorReport.visualDirector,materials.filter((binding)=>binding.bindingId!=="official-deepseek"));
assert(missingEntity.status==="BLOCKED"&&missingEntity.blockers.some((item)=>item.includes("official-entities-missing:DeepSeek")),"official-entity-gap-blocks");
const missingHandoff=structuredClone(directorReport.visualDirector);missingHandoff.shots[0].handoff.actorId="actor-does-not-exist";
const handoffBlocked=compile(missingHandoff);
assert(handoffBlocked.status==="BLOCKED"&&handoffBlocked.blockers.some((item)=>item.includes("BLOCKED_HANDOFF_ACTOR_MISSING")),"handoff-actor-gap-blocks");
const noWords=structuredClone(directorReport.visualDirector);noWords.shots[5].wordActors=[];
const wordBlocked=compile(noWords);
assert(wordBlocked.status==="BLOCKED"&&wordBlocked.blockers.includes("BLOCKED_TYPE_LED_WORD_ACTORS_MISSING"),"type-led-shot-requires-word-actors");
console.log(JSON.stringify({status:failures.length?"FAIL":"PASS",cases:6,failures},null,2));if(failures.length)process.exitCode=1;
