// Explicit live probe, NOT part of the offline suite. Only the current child signs.
// All tasks, answers and the clearly synthetic writer fixture stay under TMPDIR.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { resolveRuntimeIdentity } from '../apps/studio-next/src/lib/recipe-board/runtime-identity.mjs';
import { sha, writeTask, taskPaths, submitTaskAnswer, submissionPath, reviewSubmissionStatus } from '../apps/studio-next/src/lib/recipe-board/agenttask.mjs';

assert.deepEqual(process.argv.slice(2), ['--live'], 'explicit --live required; no caller IDs accepted');
const identity = resolveRuntimeIdentity();
assert.equal(identity?.runtime, 'hermes');
assert.equal(identity.source, 'subagent');
assert.equal(process.env.CODEX_THREAD_ID, undefined, 'never impersonate Codex');
const db = new DatabaseSync(path.join(process.env.HERMES_HOME,'state.db'),{readOnly:true});
const evidence = db.prepare(`SELECT id,source,parent_session_id,ended_at,end_reason,
  json_extract(model_config,'$._delegate_from') AS delegateFrom FROM sessions WHERE id=?`).get(process.env.HERMES_SESSION_ID);
db.close();
assert.equal(evidence.ended_at,null);
assert.equal(evidence.delegateFrom,evidence.parent_session_id);
const root = fs.mkdtempSync(path.join(os.tmpdir(),'a1-native-runtime-fixture-'));
const cfg = {repoRoot:root,sourceRoot:root,dataDir:root}, id='test-only-native';
fs.mkdirSync(path.join(root,'projects',id),{recursive:true});
fs.writeFileSync(path.join(root,'projects',id,'project.json'),JSON.stringify({id,testOnly:true}));
const candidate=path.join(root,'TEST-ONLY-candidate.json');
fs.writeFileSync(candidate,JSON.stringify({sourceTaskInputHash:'TEST-ONLY-input',testOnly:true}));
writeTask(cfg,id,'current-child-writer',{inputHash:'TEST-ONLY-input'});
const own=submitTaskAnswer(cfg,id,'current-child-writer',candidate);
assert.deepEqual(JSON.parse(fs.readFileSync(submissionPath(cfg,id,'current-child-writer'))),own);
writeTask(cfg,id,'self-review',{forAnswer:own.answerHash,independentReview:{writerStep:'current-child-writer'}});
assert.throws(()=>submitTaskAnswer(cfg,id,'self-review',candidate),/different threads/);
assert.equal(fs.existsSync(submissionPath(cfg,id,'self-review')),false);

// A fabricated TEST FIXTURE author, not a real parent/old reviewer and not a production receipt.
// Do not invoke submit with an invented runtime ID. Only this real child invokes submit.
writeTask(cfg,id,'synthetic-writer',{inputHash:'TEST-ONLY-input',testOnly:true});
const wp=taskPaths(cfg,id,'synthetic-writer'), bytes=fs.readFileSync(candidate);
fs.writeFileSync(wp.answer,bytes);
const wh=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,16);
fs.writeFileSync(submissionPath(cfg,id,'synthetic-writer'),JSON.stringify({contract:'A1TaskSubmission/v1',
  actorThread:sha('TEST-ONLY-SYNTHETIC-AUTHOR-NOT-A-RUNTIME'),taskHash:sha(fs.readFileSync(wp.task)),
  taskInputHash:'TEST-ONLY-input',answerHash:wh,testOnly:true}));
const review={forAnswer:wh,independentReview:{writerStep:'synthetic-writer'},testOnly:true};
writeTask(cfg,id,'native-review',review);
const receipt=submitTaskAnswer(cfg,id,'native-review',candidate);
assert.equal(receipt.actorThread,identity.actorThread);
assert.deepEqual(JSON.parse(fs.readFileSync(submissionPath(cfg,id,'native-review'))),receipt);
assert.equal(reviewSubmissionStatus(cfg,id,'native-review',review,{writerStep:'synthetic-writer'}).ok,true);
fs.appendFileSync(taskPaths(cfg,id,'native-review').answer,' ');
assert.equal(reviewSubmissionStatus(cfg,id,'native-review',review,{writerStep:'synthetic-writer'}).ok,false);
fs.writeFileSync(candidate,JSON.stringify({sourceTaskInputHash:'wrong',testOnly:true}));
assert.throws(()=>submitTaskAnswer(cfg,id,'current-child-writer',candidate),/input hash/);
const report={testOnly:true,scope:'isolated fixture; not a film review or approval',profile:process.env.HERMES_HOME,
  evidence,identity,root,results:{nativeSubmission:true,distinctSyntheticAuthorReview:true,selfReviewRejected:true,
    changedAnswerRejected:true,wrongInputRejected:true,receiptReadback:true,noCodexImpersonation:true}};
fs.writeFileSync(path.join(root,'probe-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
