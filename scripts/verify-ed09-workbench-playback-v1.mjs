#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const workspacePath = path.join(root, 'apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json');
const workspace = JSON.parse(fs.readFileSync(workspacePath, 'utf8'));
const shot = workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find((item) => item.shotId === 'ED-09');
const review = shot.motionReviewPlan.viewerReview;
if (review.providerMotionComposite !== true || review.productionAdmission !== false) throw new Error('ed09-candidate-contract-invalid');
const expectedUrl = review.candidateVideoPublicUrl;
const expectedSha = review.candidateVideoSha256;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({headless: true, executablePath: chrome, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio']});
const evidence = {
  contract: 'A1Ed09WorkbenchPlaybackEvidence/v1',
  shotId: 'ED-09',
  expectedUrl,
  expectedSha,
  productionAdmission: false,
  userVisualApproval: 'NOT_APPROVED',
  checkedAt: new Date().toISOString(),
};
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const directErrors = [];
  page.on('console', message => { if (message.type() === 'error') directErrors.push(message.text()); });
  await page.goto(`http://127.0.0.1:4311${expectedUrl}`, {waitUntil: 'load'});
  await page.locator('video').evaluate((video) => { video.muted = true; return video.play(); });
  await page.locator('video').evaluate((video) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('direct-video-timeout')), 15000);
    video.addEventListener('ended', () => { clearTimeout(timer); resolve(); }, {once: true});
    video.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`direct-video-error-${video.error?.code ?? 'unknown'}`)); }, {once: true});
  }));
  evidence.direct = await page.locator('video').evaluate((video) => ({ended: video.ended, currentTime: video.currentTime, duration: video.duration, videoWidth: video.videoWidth, videoHeight: video.videoHeight, readyState: video.readyState}));

  await page.goto('http://127.0.0.1:4311/system-line-visual-workbench', {waitUntil: 'load'});
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    buttons.find((button) => button.textContent.trim() === '动态')?.click();
    setTimeout(() => buttons.find((button) => button.textContent.trim().startsWith('ED-09'))?.click(), 0);
  });
  const audition = page.getByRole('button', {name: '审看待审候选', exact: false});
  await audition.waitFor({state: 'attached', timeout: 10000});
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === '审看待审候选');
    return button && !button.disabled;
  }, null, {timeout: 10000});
  await audition.click({force: true});
  const candidate = page.locator('video').last();
  await candidate.evaluate((video) => { video.muted = true; return video.play(); });
  await candidate.evaluate((video) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('workbench-video-timeout')), 15000);
    video.addEventListener('ended', () => { clearTimeout(timer); resolve(); }, {once: true});
    video.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`workbench-video-error-${video.error?.code ?? 'unknown'}`)); }, {once: true});
  }));
  evidence.workbench = await candidate.evaluate((video) => ({ended: video.ended, currentTime: video.currentTime, duration: video.duration, videoWidth: video.videoWidth, videoHeight: video.videoHeight, readyState: video.readyState, src: video.getAttribute('src')}));
  evidence.status = evidence.workbench.ended && evidence.workbench.src.endsWith(expectedUrl) ? 'PASS' : 'FAIL';
} finally {
  await browser.close();
}
const out = path.join(root, 'work/ed09-provider-local-composition-v1/workbench-playback-evidence.json');
fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({status: evidence.status, out, direct: evidence.direct, workbench: evidence.workbench}, null, 2));
if (evidence.status !== 'PASS') process.exit(1);
