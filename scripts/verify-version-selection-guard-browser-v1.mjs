import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../apps/studio-next/package.json',import.meta.url)),ts=require('typescript'),module={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync(new URL('../apps/studio-next/src/app/system-line-visual-workbench/ShotMotionReview.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(require,module,module.exports);
const out=path.resolve('work/version-selection-guard');fs.mkdirSync(out,{recursive:true});
const targets=['apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json','.codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/workspace.json','.codex-artifacts/system-progress-system-line/current-phase.json','.codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashes=()=>Object.fromEntries(targets.map(p=>[p,sha(fs.readFileSync(p))]));const before=hashes();
const workspace=JSON.parse(fs.readFileSync(targets[0]));
const shots=workspace.production.shotIntelligence.currentStoryboardAuthority.shots;
const projection=shots.map(s=>({shotId:s.shotId,receiptStatus:s.motionReviewReceipt?.status,...module.exports.resolveShotPreview(s)}));
fs.writeFileSync(path.join(out,'preview-projection.json'),JSON.stringify(projection,null,2));
const shot=shots.find(s=>s.motionReviewPlan?.viewerReview?.status==='PENDING_REPAIRED_SCREEN_REVIEW' && s.motionReviewReceipt?.status==='READY_FOR_USER_REVIEW');
assert.ok(shot,'real pending repair and selected receipt required');
const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();const writes=[],errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',route=>{if(!['GET','HEAD'].includes(route.request().method())){writes.push(route.request().url());return route.abort();}return route.continue();});
const button=name=>page.getByRole('button',{name,exact:true});const frame=page.locator('[data-a1-main-frame]');const role=page.locator('[data-a1-playback-role]');
const allShotDefaults=[];
try{
for(const size of [{width:1440,height:900},{width:1280,height:720}]){
 await page.setViewportSize(size);await page.goto('http://127.0.0.1:4311/system-line-visual-workbench',{waitUntil:'domcontentloaded'});await frame.waitFor({timeout:60000});await page.waitForTimeout(700);
 if(!allShotDefaults.length) for(const expected of projection){await button(`切换到 ${expected.shotId}`).click();await button('动态').click();const actual=await frame.locator('video').count()?await frame.locator('video').getAttribute('src'):null;assert.equal(actual,expected.motionUrl,expected.shotId);allShotDefaults.push({shotId:expected.shotId,actual,expected:expected.motionUrl});}
 await button(`切换到 ${shot.shotId}`).click();await button('动态').click();
 assert.equal(await role.getAttribute('data-a1-playback-role'),'SELECTED_REVIEW');
 assert.equal(await frame.locator('video').getAttribute('src'),shot.motionReviewReceipt.video.publicUrl);
 const selected=await frame.locator('video').elementHandle();
 await button('审看待审候选').click();assert.ok(await selected.evaluate(v=>v.paused));
 assert.equal(await role.getAttribute('data-a1-playback-role'),'PENDING_CANDIDATE');
 const video=frame.locator('video');const candidate=shot.motionReviewPlan.viewerReview;
 assert.equal(await video.getAttribute('src'),candidate.candidateVideoPublicUrl);
 const response=await page.request.get('http://127.0.0.1:4311'+candidate.candidateVideoPublicUrl);assert.ok(response.ok());const servedSha=sha(await response.body());assert.equal(servedSha,candidate.candidateVideoSha256);
 await page.waitForFunction(()=>document.querySelector('[data-a1-main-frame] video')?.readyState>=2);
 await button('播放').click();await page.waitForFunction(()=>document.querySelector('[data-a1-main-frame] video')?.currentTime>.3);const playback=await video.evaluate(v=>({currentSrc:v.currentSrc,currentTime:v.currentTime,duration:v.duration,paused:v.paused,quality:v.getVideoPlaybackQuality().totalVideoFrames}));
 const candidateElement=await video.elementHandle();await button('返回选定版本').click();assert.ok(await candidateElement.evaluate(v=>v.paused));assert.equal(await role.getAttribute('data-a1-playback-role'),'SELECTED_REVIEW');assert.equal(await video.getAttribute('src'),shot.motionReviewReceipt.video.publicUrl);
 const bounds=[];for(const selector of ['[data-a1-playback-role]','[data-a1-main-frame]','[data-a1-transport]','nav[aria-label="分镜缩略图导航"]']){const r=await page.locator(selector).boundingBox();assert.ok(r && r.y>=0 && r.y+r.height<=size.height && r.x+r.width<=size.width,JSON.stringify({selector,r,size}));bounds.push({selector,...r});}
 const missingButtons=page.locator('nav[aria-label="分镜缩略图导航"] button').filter({hasText:'动态缺失'});
 let missingClosed='NOT_APPLICABLE';
 if(await missingButtons.count()){
  const missing=await missingButtons.first().getAttribute('aria-label');
  await button(missing).click();await button('动态').click();assert.equal(await frame.locator('video').count(),0);assert.ok(await button('播放').isDisabled());
  missingClosed=true;
 }
 results.push({size,shotId:shot.shotId,selectedSha256:shot.motionReviewReceipt.video.sha256,candidateSha256:servedSha,playback,bounds,missingClosed});
}
assert.equal(allShotDefaults.length,shots.length);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);assert.deepEqual(hashes(),before);fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({status:'PASS',results,allShotDefaults,writes,errors,productionHashes:before,productionHashesAfter:hashes()},null,2));console.log(JSON.stringify({status:'PASS',results,allShotCount:allShotDefaults.length,writes,errors},null,2));
}finally{await browser.close();}
