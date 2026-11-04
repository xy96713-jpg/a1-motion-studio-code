import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'material-receipt-'));
try {
  const library = path.join(root, 'library'), dataDir = path.join(root, 'data'), bin = path.join(root, 'bin');
  fs.mkdirSync(library, {recursive:true}); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'swift'), '#!/bin/sh\nprintf "[]"\n', {mode:0o755});
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.A1_MATERIAL_LIBRARY = library;
  // Fail closed if a cache miss accidentally attempts capture, rather than launching a browser.
  const { chromium } = await import('playwright');
  chromium.launch = async () => { throw new Error('offline fixture forbids browser launch'); };
  globalThis.fetch = async () => { throw new Error('offline fixture forbids network'); };
  const M = await import('../apps/studio-next/src/lib/recipe-board/materials.mjs');
  const cfg = {dataDir, repoRoot:root, sourceRoot:root}, id = 'fixture';
  const dir = path.join(dataDir, 'projects', id, 'materials'); fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(path.join(dataDir, 'projects', id, 'project.json'), JSON.stringify({id}));
  const source = path.join(root, 'fixture.png'); fs.writeFileSync(source, 'offline-image-fixture');
  const candidate = (id) => ({id, source:'library', file:source, url:`https://example.invalid/${id}`, title:id, publisher:'fixture', rights:'unknown', rightsLabel:'unknown'});
  const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  write('needs.json', {needs:[{shotId:'auto'},{shotId:'manual'},{shotId:'legacy'},{shotId:'forged'},{shotId:'historical'}]});
  write('candidates.json', {shots:Object.fromEntries(['auto','manual','legacy','forged','historical'].map(id=>[id,{candidates:[candidate(id)]}]))});
  write('proposed-batch.json', {picks:[{shotId:'auto',candidateId:'auto'}]});
  M.autoApproveTrusted(cfg,id);
  await M.saveApprovalBatch(cfg,id,[{shotId:'manual',candidateId:'manual'}]);
  await M.saveApprovalBatch(cfg,id,[{shotId:'legacy',candidateId:'legacy'}],{confirmedBy:'auto: legacy selection'});
  await M.saveApprovalBatch(cfg,id,[{shotId:'forged',candidateId:'forged'}],{confirmedBy:'user forged'});
  const approvals = JSON.parse(fs.readFileSync(path.join(dir,'approvals.json')));
  const historicalItem = {...approvals.batches[0].items[0], shotId:'historical', candidateId:'historical', url:candidate('historical').url};
  approvals.batches.push({id:'old', confirmedBy:'user via /recipe-board/materials', items:[historicalItem]});
  write('approvals.json', approvals);
  const result = await M.fetchApproved(cfg,id);
  for (const [shot,status] of [['auto','SYSTEM_SELECTED'],['manual','UNKNOWN'],['legacy','UNKNOWN'],['forged','UNKNOWN'],['historical','UNKNOWN']]) {
    assert.ok(result.shots[shot], `${shot} fetched`);
    const receipt = JSON.parse(fs.readFileSync(result.shots[shot].receipt));
    assert.equal(receipt.selection.status,status,shot);
    assert.equal(receipt.contract,'A1RecipeBoardMaterialAcquisitionReceipt/v1');
    assert.notEqual(receipt.status,'PASS');
    assert.equal(receipt.rights.status,'UNKNOWN');
    assert.equal(receipt.rights.clearance,'NOT_ASSESSED',shot);
  }
  const oldReceipt = result.shots.auto.receipt;
  const oldBytes = fs.readFileSync(oldReceipt);
  const oldBinding = result.shots.auto;
  const oldOutput = fs.readFileSync(oldBinding.library), oldLocal = fs.readFileSync(oldBinding.file);
  fs.writeFileSync(source, 'different-offline-image-fixture');
  const again = JSON.parse(fs.readFileSync(path.join(dir,'approvals.json')));
  again.batches[0].items[0].status = 'approved'; write('approvals.json', again);
  const repeated = await M.fetchApproved(cfg,id);
  assert.deepEqual(fs.readFileSync(oldReceipt), oldBytes);
  assert.notEqual(repeated.shots.auto.receipt, oldReceipt);
  assert.deepEqual(fs.readFileSync(oldBinding.library), oldOutput);
  assert.deepEqual(fs.readFileSync(oldBinding.file), oldLocal);
  assert.notEqual(repeated.shots.auto.library, oldBinding.library);
  assert.equal(crypto.createHash('sha256').update(oldOutput).digest('hex'), JSON.parse(oldBytes).output.sha256);
  const stable = repeated.shots.auto;
  const failAgain = JSON.parse(fs.readFileSync(path.join(dir,'approvals.json')));
  failAgain.batches[0].items[0].status = 'approved';
  failAgain.batches[0].items[0].file = path.join(root, 'missing.png');
  write('approvals.json', failAgain);
  const afterFail = await M.fetchApproved(cfg,id);
  assert.deepEqual(afterFail.shots.auto, stable);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(stable.file)).digest('hex'), JSON.parse(fs.readFileSync(stable.receipt)).output.sha256);
  const manualOld = result.shots.manual, manualReceipt = fs.readFileSync(manualOld.receipt);
  const manualOutput = fs.readFileSync(manualOld.library), manualLocal = fs.readFileSync(manualOld.file);
  const manualApproval = JSON.parse(fs.readFileSync(path.join(dir,'approvals.json')));
  manualApproval.batches.flatMap(b=>b.items).find(i=>i.shotId==='manual').status='approved'; write('approvals.json',manualApproval);
  const manualNew = await M.fetchApproved(cfg,id);
  assert.notEqual(manualNew.shots.manual.library,manualOld.library);
  assert.deepEqual(fs.readFileSync(manualOld.receipt),manualReceipt);
  assert.deepEqual(fs.readFileSync(manualOld.library),manualOutput);
  assert.deepEqual(fs.readFileSync(manualOld.file),manualLocal);
  assert.equal(crypto.createHash('sha256').update(manualOutput).digest('hex'),JSON.parse(manualReceipt).output.sha256);
  const manualFail = JSON.parse(fs.readFileSync(path.join(dir,'approvals.json')));
  const mi = manualFail.batches.flatMap(b=>b.items).find(i=>i.shotId==='manual'); mi.status='approved'; mi.file=path.join(root,'missing.png'); write('approvals.json',manualFail);
  assert.deepEqual((await M.fetchApproved(cfg,id)).shots.manual, manualNew.shots.manual);
  // Preseed genuine archive cache records: the production consumer must reuse these,
  // crop them and issue receipts without starting a browser or touching the network.
  const webIds = ['web-auto', 'web-manual', 'web-fail'];
  const webCandidate = shot => ({id:shot, source:'web', url:`https://example.invalid/${shot}`, title:shot, publisher:'fixture', rights:'official', rightsLabel:'fixture'});
  write('needs.json', {needs:webIds.map(shotId => ({shotId}))});
  write('candidates.json', {shots:Object.fromEntries(webIds.map(shot => [shot,{candidates:[webCandidate(shot)]}]))});
  write('approvals.json', {batches:[]});
  write('bindings.json', {shots:{}});
  write('proposed-batch.json', {picks:[{shotId:'web-auto',candidateId:'web-auto'}]});
  const image = path.join(root, 'page.png');
  const generated = spawnSync(process.env.A1_FFMPEG || 'ffmpeg', ['-v','error','-y','-f','lavfi','-i','testsrc2=s=1920x1080','-frames:v','1',image], {encoding:'utf8'});
  assert.equal(generated.status, 0, generated.stderr);
  const digest = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  for (const shot of webIds) {
    const c = webCandidate(shot);
    const key = `fixture-${shot}-${crypto.createHash('sha256').update(c.url).digest('hex').slice(0,8)}`;
    const src = path.join(library, 'sources', 'web', key); fs.mkdirSync(src,{recursive:true});
    const fullPage = path.join(src,'full.png'), text = path.join(src,'text.txt');
    fs.copyFileSync(image, fullPage);
    // A corrupt but cache-signature-complete PNG exercises an actual crop failure.
    if (shot === 'web-fail') fs.writeFileSync(fullPage, Buffer.concat([Buffer.from([137,80,78,71]),Buffer.alloc(1100),Buffer.from('IEND'),Buffer.alloc(4)]));
    fs.writeFileSync(text, 'Offline archive content. '.repeat(60));
    const record = {captureVersion:4, url:c.url, finalUrl:c.url, title:c.title, capturedAt:'2026-01-01T00:00:00.000Z', pageHeight:1080, files:{fullPage,text}, sha256:{fullPage:digest(fullPage),text:digest(text)}, marks:{fixture:[0.3,0.4,0.3,0.05]}, places:{fixture:[{tag:'body',box:[0.3,0.4,0.3,0.05],line:[[0.3,0.4,0.3,0.05]]}]}};
    fs.writeFileSync(path.join(src,'archive.json'),JSON.stringify(record));
  }
  M.autoApproveTrusted(cfg,id);
  // Synthetic confirmation exercises serialization only; it is not real user authorization.
  await M.saveApprovalBatch(cfg,id,webIds.slice(1).map(shotId => ({shotId,candidateId:shotId})));
  const beforeReceipts = new Set(fs.readdirSync(path.join(library,'receipts')));
  const web = await M.fetchApproved(cfg,id);
  for (const [shot,status] of [['web-auto','SYSTEM_SELECTED'],['web-manual','UNKNOWN']]) {
    assert.equal(web.shots[shot]?.role,'page',shot);
    const receipt = JSON.parse(fs.readFileSync(web.shots[shot].receipt));
    assert.equal(receipt.selection.status,status,shot);
    assert.equal(receipt.contract,'A1RecipeBoardMaterialAcquisitionReceipt/v1');
    assert.notEqual(receipt.status,'PASS');
    assert.equal(receipt.rights.status,'UNKNOWN');
    assert.equal(receipt.rights.clearance,'NOT_ASSESSED',shot);
    assert.equal(receipt.source.url,webCandidate(shot).url);
    assert.equal(receipt.output.sha256,digest(web.shots[shot].file));
  }
  assert.equal(web.shots['web-fail'],undefined);
  const failed = JSON.parse(fs.readFileSync(path.join(dir,'approvals.json'))).batches.flatMap(b=>b.items).find(i=>i.shotId==='web-fail');
  assert.equal(failed.status,'failed'); assert.match(failed.error,/reading crop failed/);
  const added = fs.readdirSync(path.join(library,'receipts')).filter(x=>!beforeReceipts.has(x));
  assert.equal(added.length,2); assert.ok(!added.some(x=>x.includes('web-fail')));
  for (const shot of ['web-auto','web-manual']) {
    const previous = web.shots[shot], receiptBytes = fs.readFileSync(previous.receipt);
    const outputBytes = fs.readFileSync(previous.library), localBytes = fs.readFileSync(previous.file);
    const receipt = JSON.parse(receiptBytes), full = receipt.source.path;
    const changed = spawnSync('ffmpeg', ['-v','error','-y','-f','lavfi','-i','smptebars=s=1920x1080','-frames:v','1',full], {encoding:'utf8'});
    assert.equal(changed.status, 0, changed.stderr);
    const recordFile = path.join(path.dirname(full),'archive.json');
    const record = JSON.parse(fs.readFileSync(recordFile)); record.sha256.fullPage = digest(full);
    fs.writeFileSync(recordFile,JSON.stringify(record));
    const a = JSON.parse(fs.readFileSync(path.join(dir,'approvals.json')));
    a.batches.flatMap(b=>b.items).find(i=>i.shotId===shot).status='approved'; write('approvals.json',a);
    const againPage = await M.fetchApproved(cfg,id);
    assert.notEqual(againPage.shots[shot].library,previous.library);
    assert.notEqual(digest(againPage.shots[shot].file),receipt.output.sha256);
    assert.deepEqual(fs.readFileSync(previous.receipt),receiptBytes);
    assert.deepEqual(fs.readFileSync(previous.library),outputBytes);
    assert.deepEqual(fs.readFileSync(previous.file),localBytes);
    assert.equal(digest(previous.library),receipt.output.sha256);
    const current = againPage.shots[shot];
    fs.writeFileSync(full,Buffer.concat([Buffer.from([137,80,78,71]),Buffer.alloc(1100),Buffer.from('IEND'),Buffer.alloc(4)]));
    const retry = JSON.parse(fs.readFileSync(path.join(dir,'approvals.json')));
    retry.batches.flatMap(b=>b.items).find(i=>i.shotId===shot).status='approved'; write('approvals.json',retry);
    const failure = await M.fetchApproved(cfg,id);
    assert.deepEqual(failure.shots[shot],current);
    assert.equal(digest(current.file),JSON.parse(fs.readFileSync(current.receipt)).output.sha256);
  }
  const {compileNasMediaClipReceipt, assertNasMediaClipReceipt} = await import('../apps/studio-next/src/lib/a1-nas-media-bridge-v1.mjs');
  const base = {source:{sha256:'a'.repeat(64)}, output:{sha256:'b'.repeat(64),fullDecode:true},range:{inMs:0,outMs:1000}};
  for (const status of ['SYSTEM_SELECTED','SELECTION_RECORDED','USER_APPROVED']) {
    const result = compileNasMediaClipReceipt({...base,rights:{status}});
    assert.ok(result.failures.includes('EDIT_RIGHTS_REQUIRED'), `${status} is not clearance`);
  }
  const genuine = compileNasMediaClipReceipt({...base,rights:{status:'USER_OWNED_AUTHORIZED'}});
  assert.equal(genuine.status,'PASS'); assert.equal(assertNasMediaClipReceipt(genuine),genuine);
  assert.throws(() => assertNasMediaClipReceipt(JSON.parse(fs.readFileSync(result.shots.auto.receipt))));
  console.log('material receipt provenance and downstream rights gate passed');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
