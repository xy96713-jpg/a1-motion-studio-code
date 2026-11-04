// 4311 after fix: scroll test
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4311/system-line-visual-workbench', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-a1-editorial-asset-workbench]')?.getAttribute('data-a1-editorial-asset-workbench') !== 'loading', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // 顶部
  await page.screenshot({ path: '/tmp/a1-4311-after-top.png', fullPage: false });
  // 滚到中段 (mature static board)
  await page.evaluate(() => window.scrollTo(0, 1800));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/a1-4311-after-mid.png', fullPage: false });
  // 滚到录屏 evidence
  await page.evaluate(() => window.scrollTo(0, 11500));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/a1-4311-after-screen.png', fullPage: false });
  // 滚到 timeline
  await page.evaluate(() => window.scrollTo(0, 18500));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/a1-4311-after-timeline.png', fullPage: false });
  // 验证最大滚动量
  const max = await page.evaluate(() => ({ scrollY: window.scrollY, max: document.documentElement.scrollHeight - window.innerHeight, docH: document.documentElement.scrollHeight }));
  console.log('after scroll to 18500:', JSON.stringify(max));
  await browser.close();
})();
