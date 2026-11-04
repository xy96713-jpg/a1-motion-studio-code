#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const workspacePath = path.join(root, 'apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json');
const workspace = JSON.parse(fs.readFileSync(workspacePath, 'utf8'));
const shots = Object.fromEntries(workspace.production.shotIntelligence.currentStoryboardAuthority.shots.map((shot) => [shot.shotId, shot]));
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({headless: true, executablePath: chrome, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio']});
const result = {
  contract: 'A1Ed09NeighborSequencePlaybackEvidence/v1',
  checkedAt: new Date().toISOString(),
  productionAdmission: false,
  shots: [],
};
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  await page.goto('http://127.0.0.1:4311/system-line-visual-workbench', {waitUntil: 'load'});
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    buttons.find((button) => button.textContent.trim() === '动态')?.click();
  });
  for (const shotId of ['ED-08', 'ED-09', 'ED-10']) {
    await page.evaluate((id) => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim().startsWith(id));
      button?.click();
    }, shotId);
    await page.waitForTimeout(500);
    // ED-09 must explicitly audition its pending candidate; neighbors use their bound review media when available.
    if (shotId === 'ED-09') {
      await page.waitForFunction(() => {
        const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === '审看待审候选');
        return button && !button.disabled;
      }, null, {timeout: 10000});
      await page.getByRole('button', {name: '审看待审候选', exact: false}).click({force: true});
      await page.waitForTimeout(200);
    }
    const info = await page.evaluate((id) => {
      const video = document.querySelector('video');
      if (!video) return {shotId: id, hasVideo: false, text: document.body.innerText};
      return {
        shotId: id,
        hasVideo: true,
        src: video.getAttribute('src'),
        role: document.querySelector('[data-a1-playback-role]')?.getAttribute('data-a1-playback-role') || null,
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      };
    }, shotId);
    if (info.hasVideo) {
      await page.locator('video').first().evaluate((video) => { video.muted = true; return video.play(); });
      await page.locator('video').first().evaluate((video) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${video.getAttribute('src')}:timeout`)), 15000);
        video.addEventListener('ended', () => { clearTimeout(timer); resolve(); }, {once: true});
        video.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`video-error-${video.error?.code ?? 'unknown'}`)); }, {once: true});
      }));
      info.playback = await page.locator('video').first().evaluate((video) => ({ended: video.ended, currentTime: video.currentTime, duration: video.duration, readyState: video.readyState}));
    }
    result.shots.push(info);
  }
  result.status = result.shots[1].hasVideo && result.shots[1].playback?.ended && result.shots[1].src?.includes('/ed09-provider-local-composition/') ? 'PASS' : 'FAIL';
} finally {
  await browser.close();
}
const out = path.join(root, 'work/ed09-provider-local-composition-v1/neighbor-sequence-evidence.json');
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, out, shots: result.shots.map((shot) => ({shotId: shot.shotId, hasVideo: shot.hasVideo, ended: shot.playback?.ended, src: shot.src}))}, null, 2));
if (result.status !== 'PASS') process.exit(1);
