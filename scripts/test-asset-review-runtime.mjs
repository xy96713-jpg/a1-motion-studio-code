// Synthetic identities and pixels; never evidence of a visual review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { ensureReviewTask, submitAssetReview, assetReviewStatus, viewHashes } from '../work/recipe-board-v1/style-lab/engine/blender/asset_review.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synthetic-asset-runtime-'));
try {
 const db = new DatabaseSync(path.join(dir,'state.db'));
 db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, parent_session_id TEXT, model_config TEXT, ended_at REAL, end_reason TEXT)');
 const ins=db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)');
 ins.run('writer','local',null,'{}',1,'compression');
 ins.run('writer-next','local','writer','{}',null,null);
 ins.run('child','subagent','writer-next',JSON.stringify({_delegate_from:'writer-next'}),null,null);
 db.close();
 const writer={HERMES_HOME:dir,HERMES_SESSION_ID:'writer-next'}, child={HERMES_HOME:dir,HERMES_SESSION_ID:'child'};
 const req={contract:'A1PartRequest/v1',name:'synthetic',why:'test only',image:'view.png'};
 fs.writeFileSync(path.join(dir,'view.png'),'synthetic');
 const request=path.join(dir,'request.json'); fs.writeFileSync(request,JSON.stringify(req));
 const hashes=viewHashes(req,dir), task=path.join(dir,'synthetic.ref-review.task.json'), answer=path.join(dir,'synthetic.ref-review.answer.json'), candidate=path.join(dir,'candidate.json');
 ensureReviewTask(task,{contract:'A1ReferenceReviewTask/v1',hashes,images:['view.png']},writer);
 fs.writeFileSync(candidate,JSON.stringify({contract:'A1ReferenceReviewAnswer/v1',ok:true,reviewer:'synthetic',reason:'fixture only',hashes}));
 assert.throws(()=>submitAssetReview(task,answer,candidate,writer),/different threads/);
 assert.throws(()=>submitAssetReview(task,answer,candidate,{}),/missing submitting thread/);
 submitAssetReview(task,answer,candidate,child);
 assert.equal(assetReviewStatus(task,answer),true);
 const result=spawnSync(process.execPath,['work/recipe-board-v1/style-lab/engine/blender/run.mjs','part',request,path.join(dir,'output.json')],{env:{...process.env,...writer,HUNYUAN3D:path.join(dir,'missing-hunyuan')},encoding:'utf8'});
 assert.match(result.stderr,/ENOENT/,'real consumer must pass reference gate and reach missing shape backend');
 assert.doesNotMatch(result.stderr,/independent reference review missing/);
 fs.appendFileSync(answer,' '); assert.equal(assetReviewStatus(task,answer),false);
 console.log('synthetic asset writer → independent delegate → real service gate passed; stale and self-review rejected');
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
