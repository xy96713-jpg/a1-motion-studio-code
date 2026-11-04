import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const runId=`editor-flow-${Date.now()}`;
const out=path.join(root,'work/screen-recording-maturity-test-v1',runId);
fs.mkdirSync(out,{recursive:true});
const api=async(route,options)=>{const response=await fetch(`http://127.0.0.1:8766${route}`,options);if(!response.ok)throw new Error(`WORKBENCH_HTTP_${response.status}`);return response.json();};
const documentId=`screen_test_${runId}`;
const title='录屏验收临时文档';
const dragged='这是一份用于真实鼠标拖选验证的临时句子。';
await api('/api/document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId,documentType:'experiment',title,contentHtml:`<p>修改前：${dragged}</p><p>保留本次真实拖拽产生的浏览器选区。</p>`,contentText:`修改前：${dragged}`,metadata:{purpose:'screen-recording-acceptance',temporary:true}})});
const scenario={contract:'A1GenericBrowserScreenScenario/v1',id:runId,productId:'writing-workbench',productCategory:'real-native-text-drag-edit-save',projectRoot:'/Users/a1/Documents/Codex/写作项目/workbench_runtime',sourceFiles:['inline_editor_v2/app.js','inline_editor_v2/index.html'],url:`http://127.0.0.1:8766/v2/?documentId=${documentId}`,width:1280,height:720,durationMs:30000,readySelector:'#editor',resultSelector:'#editor',operations:[
{atMs:700,type:'snapshot',name:'before-drag',selector:'#editor'},
{atMs:2200,type:'dragSelect',name:'native-drag-select',selector:'#editor',targetKind:'TEXT',textRange:dragged,durationMs:900,approachDurationMs:260,resultSelector:'#selectionMenu [data-run]'},
{atMs:5800,type:'click',name:'run-on-native-selection',selector:'#selectionMenu [data-run]',resultSelector:'#candidateList .candidate-text'},
{atMs:9800,type:'click',name:'accept-candidate',selector:'#candidateList [data-accept]',resultSelector:'#editor .accepted-change'},
{atMs:14500,type:'click',name:'save-document',selector:'#saveWorkspace',resultSelector:'#editor .accepted-change'},
{atMs:16500,type:'snapshot',name:'after-native-drag',selector:'#editor .accepted-change'},
{atMs:17500,type:'observe',name:'saved-editor',selector:'#editor .accepted-change'}
],primaryEvent:'save-document',directorPlan:{contract:'A1ScreenDirectorBrain/v1',sequence:'DRAG_SELECT_APPLY_SAVE_INSPECT',beats:[{id:'drag-action',technique:'SOURCE_ACTION_ONLY',event:'native-drag-select'},{id:'saved-focus',technique:'FOCUS_DIM',event:'saved-editor',startMs:19500,endMs:26000}],cameraBeats:[]}};
const scenarioFile=path.join(out,'scenario.json');fs.writeFileSync(scenarioFile,JSON.stringify(scenario,null,2));
const run=(script,args)=>{const result=spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,env:{...process.env,A1_GENERIC_CAPTURE_OUTPUT_ROOT:path.dirname(out)},encoding:'utf8',maxBuffer:8*1024*1024});fs.writeFileSync(path.join(out,`${script}.log`),result.stdout+result.stderr);if(result.status!==0)throw new Error(`${script}: ${result.stderr.slice(-1800)}`);};
run('capture-generic-browser-screen-proof-v1.mjs',[scenarioFile]);
const capture=JSON.parse(fs.readFileSync(path.join(out,'capture-report.json'),'utf8'));
const selectionEvidence=capture.dragSelectionProofs?.find(row=>row.event==='native-drag-select');
if(!selectionEvidence?.nativeSelectionVerified||selectionEvidence.selectedLength!==dragged.length||selectionEvidence.mouseDownDurationMs<250)throw new Error('REAL_DRAG_SELECTION_NOT_VERIFIED');
const saved=await api(`/api/document?documentId=${documentId}`);
const acceptedText=capture.domTargets.find(row=>row.event==='saved-editor')?.text;
const persisted=Boolean(acceptedText)&&JSON.stringify(saved).includes(acceptedText);
fs.writeFileSync(path.join(out,'saved-state.json'),JSON.stringify({documentId,persisted,document:saved},null,2));
if(!persisted)throw new Error('DRAG_EDIT_NOT_PERSISTED');
run('build-generic-cap-review-v1.mjs',[path.join(out,'capture-report.json'),path.join(out,'review.cap'),path.join(out,'review.mp4')]);
run('verify-native-cap-focus.mjs',[out]);
console.log(JSON.stringify({out,documentId,persisted,scope:'REAL_POINTER_DRAG_SELECT_PRODUCT_APPLY_AND_SAVE',dragProof:selectionEvidence,comparisonEffect:'NOT_YET_RENDERED',temporaryDocumentRetained:true},null,2));
