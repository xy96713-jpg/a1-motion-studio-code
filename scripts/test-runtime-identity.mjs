// SYNTHETIC identity fixtures only. Never opens the operator's Hermes DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { threadHash, sha, writeTask, submitTaskAnswer, submissionPath, taskPaths, reviewSubmissionStatus } from '../apps/studio-next/src/lib/recipe-board/agenttask.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-synthetic-runtime-'));
try {
  const db = new DatabaseSync(path.join(root, 'state.db'));
  db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, parent_session_id TEXT, model_config TEXT, ended_at REAL, end_reason TEXT)');
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)').run('synthetic-writer', 'local', null, '{}', null, null);
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)').run('synthetic-child', 'subagent', 'synthetic-writer', JSON.stringify({_delegate_from:'synthetic-writer'}), null, null);
  db.close();
  const env = {HERMES_HOME: root, HERMES_SESSION_ID:'synthetic-child'};
  assert.ok(threadHash(env), 'verified Hermes delegate must resolve a runtime identity');
  assert.notEqual(threadHash(env), threadHash({...env, HERMES_SESSION_ID:'synthetic-writer'}));
  assert.equal(threadHash({CODEX_THREAD_ID:'legacy'}), sha('codex-thread:legacy'), 'Codex hash must remain byte-compatible');
  const writerHash = threadHash({...env, HERMES_SESSION_ID:'synthetic-writer'}), childHash = threadHash(env);
  const edit = new DatabaseSync(path.join(root, 'state.db'));
  edit.exec("UPDATE sessions SET ended_at=1,end_reason='compression'");
  const insert = edit.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)');
  insert.run('synthetic-writer-compressed','local','synthetic-writer','{}',null,null);
  insert.run('synthetic-child-compressed','subagent','synthetic-child',JSON.stringify({_delegate_from:'synthetic-writer'}),null,null);
  assert.equal(threadHash({...env,HERMES_SESSION_ID:'synthetic-writer-compressed'}), writerHash, 'compression is the same writer, not a fresh reviewer');
  assert.equal(threadHash({...env,HERMES_SESSION_ID:'synthetic-child-compressed'}), childHash, 'inherited delegate marker is not a new delegation');
  insert.run('synthetic-child-compressed-without-marker','subagent','synthetic-child','{}',null,null);
  assert.equal(threadHash({...env,HERMES_SESSION_ID:'synthetic-child-compressed-without-marker'}), childHash);
  const badEnv = [
    {}, {...env, CODEX_THREAD_ID:'synthetic-conflict'},
    {HERMES_SESSION_ID:'synthetic-child'}, {...env,HERMES_HOME:path.join(root,'absent-profile')},
    {...env,HERMES_SESSION_ID:'missing'}, {...env,HERMES_SESSION_ID:'synthetic-child'},
    {HERMES_SESSION_ID:'',CODEX_THREAD_ID:'legacy'}, {HERMES_AGENT:'true',CODEX_THREAD_ID:'legacy'},
    {CODEX_THREAD_ID:'   '}, {...env,HERMES_SESSION_ID:42},
  ];
  for (const bad of badEnv) assert.equal(threadHash(bad),null,`missing/conflicting/ended identity must fail closed: ${JSON.stringify(bad)}`);
  for (const [id,source,parent,config,ended,reason] of [
    ['orphan','subagent',null,{},null,null],
    ['no-delegate','subagent','synthetic-writer-compressed',{},null,null],
    ['mismatch','subagent','synthetic-writer-compressed',{_delegate_from:'other'},null,null],
    ['dangling','subagent','missing',{_delegate_from:'missing'},null,null],
    ['branch','local','synthetic-writer',{_branched_from:'synthetic-writer'},null,null],
    ['reset','local','synthetic-writer',{_reset_from:'synthetic-writer'},null,null],
    ['self','subagent','self',{_delegate_from:'self'},null,null],
    ['tool','tool',null,{},null,null],
    ['closed','subagent','synthetic-writer',{_delegate_from:'synthetic-writer'},2,'agent_close'],
    ['cycle-a','local','cycle-b',{},1,'compression'],
    ['cycle-b','local','cycle-a',{},1,'compression'],
    ['cycle-tip','local','cycle-a',{},null,null],
    ['bad-config','local',null,'not-json',null,null],
  ]) {
    insert.run(id,source,parent,typeof config === 'string' ? config : JSON.stringify(config),ended,reason);
    assert.equal(threadHash({...env,HERMES_SESSION_ID:id}),null,`${id} must fail closed`);
  }
  edit.close();
  assert.equal(fs.existsSync(path.join(root,'absent-profile','state.db')),false,'read-only lookup must not create DBs');
  const cfg = {repoRoot:root, sourceRoot:root, dataDir:root};
  fs.mkdirSync(path.join(root,'projects/test-only'),{recursive:true});
  fs.writeFileSync(path.join(root,'projects/test-only/project.json'),JSON.stringify({id:'test-only'}));
  const writerEnv = {...env,HERMES_SESSION_ID:'synthetic-writer-compressed'};
  const reviewerEnv = {...env,HERMES_SESSION_ID:'synthetic-child-compressed'};
  const candidate = path.join(root,'TEST-ONLY-candidate.json');
  fs.writeFileSync(candidate,JSON.stringify({sourceTaskInputHash:'synthetic-input'}));
  writeTask(cfg,'test-only','writer',{inputHash:'synthetic-input'});
  const w = submitTaskAnswer(cfg,'test-only','writer',candidate,{env:writerEnv});
  const review = {forAnswer:w.answerHash,independentReview:{writerStep:'writer'}};
  writeTask(cfg,'test-only','review',review);
  const submit = (e = reviewerEnv) => submitTaskAnswer(cfg,'test-only','review',candidate,{env:e});
  assert.throws(()=>submit(writerEnv),/different threads/);
  submit();
  assert.equal(reviewSubmissionStatus(cfg,'test-only','review',review,{writerStep:'writer'}).ok,true);
  const rp = taskPaths(cfg,'test-only','review');
  assert.throws(()=>submitTaskAnswer(cfg,'test-only','review',rp.answer,{env:reviewerEnv}),/canonical/);
  fs.writeFileSync(path.join(rp.dir,'review.submit.lock'),'test-only');
  assert.throws(()=>submit(),/EEXIST/);
  fs.unlinkSync(path.join(rp.dir,'review.submit.lock'));
  fs.appendFileSync(rp.answer,' ');
  assert.equal(reviewSubmissionStatus(cfg,'test-only','review',review,{writerStep:'writer'}).ok,false,'answer bytes stay bound');
  submit();
  fs.appendFileSync(rp.task,' ');
  assert.equal(reviewSubmissionStatus(cfg,'test-only','review',review,{writerStep:'writer'}).ok,false,'task bytes stay bound');
  submit();
  fs.unlinkSync(submissionPath(cfg,'test-only','writer'));
  assert.throws(()=>submit(),/writer submission/);
  submitTaskAnswer(cfg,'test-only','writer',candidate,{env:writerEnv});
  writeTask(cfg,'test-only','writer',{inputHash:'new-input'});
  assert.throws(()=>submit(),/writer submission/);
  assert.throws(()=>submitTaskAnswer(cfg,'test-only','writer',candidate,{env:writerEnv}),/input hash/);
  // Same ID in another profile must not alias; symlink names of one profile must.
  const other = path.join(root,'other-profile'); fs.mkdirSync(other);
  fs.copyFileSync(path.join(root,'state.db'),path.join(other,'state.db'));
  assert.notEqual(threadHash({...reviewerEnv,HERMES_HOME:other}),threadHash(reviewerEnv));
  const alias = path.join(root,'profile-alias'); fs.symlinkSync(root,alias);
  assert.equal(threadHash({...reviewerEnv,HERMES_HOME:alias}),threadHash(reviewerEnv));
  const incompatible = path.join(root,'incompatible'); fs.mkdirSync(incompatible);
  const wrongDB = new DatabaseSync(path.join(incompatible,'state.db')); wrongDB.exec('CREATE TABLE wrong (id TEXT)'); wrongDB.close();
  assert.equal(threadHash({...reviewerEnv,HERMES_HOME:incompatible}),null);
  console.log('synthetic runtime identity: delegate, compression, fail-closed, profile isolation, receipts, locks, stale checks and legacy Codex passed');
} finally { fs.rmSync(root, {recursive:true, force:true}); }
