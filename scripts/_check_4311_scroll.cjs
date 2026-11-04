// 4311 actual page full scroll check
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4311/system-line-visual-workbench', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-a1-editorial-asset-workbench]')?.getAttribute('data-a1-editorial-asset-workbench') !== 'loading', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // 1) 主容器可滚动高度
  const layout = await page.evaluate(() => {
    return {
      bodyHeight: document.body.scrollHeight,
      docHeight: document.documentElement.scrollHeight,
      viewportH: window.innerHeight,
      mainHeight: document.querySelector('main')?.scrollHeight,
      overflowBody: getComputedStyle(document.body).overflow,
      sections: Array.from(document.querySelectorAll('section, [data-a1-section], article')).slice(0, 30).map((s) => ({
        tag: s.tagName,
        cls: (s.className || '').slice(0, 60),
        h: s.getBoundingClientRect().height,
        top: s.getBoundingClientRect().top,
        text: (s.textContent || '').trim().slice(0, 80)
      }))
    };
  });
  console.log('--- layout ---');
  console.log('bodyHeight:', layout.bodyHeight, 'docHeight:', layout.docHeight, 'viewport:', layout.viewportH, 'mainHeight:', layout.mainHeight);
  console.log('sections:');
  for (const s of layout.sections) console.log(' ', JSON.stringify(s));

  // 2) 滚到底
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(800);
  const afterScroll = await page.evaluate(() => ({ scrollY: window.scrollY, max: document.documentElement.scrollHeight - window.innerHeight }));
  console.log('after scroll:', JSON.stringify(afterScroll));

  // 3) 看底部图片状态
  const bottom = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).slice(0, 40).map((img) => {
      const r = img.getBoundingClientRect();
      return { src: img.src?.slice(-70), natW: img.naturalWidth, natH: img.naturalHeight, dispW: r.width, dispH: r.height, top: r.top, complete: img.complete };
    });
  });
  console.log('--- ALL IMAGES (first 30) ---');
  for (const i of bottom.slice(0, 30)) console.log(' ', JSON.stringify(i));

  // 4) 截屏
  await page.screenshot({ path: '/tmp/a1-4311-bottom.png', fullPage: false });

  // 5) 截屏整页用 element.scrollIntoView
  const fullBodyBuf = await page.screenshot({ fullPage: true, path: '/tmp/a1-4311-truly-full.png' });
  console.log('--- screenshots saved ---');

  await browser.close();
})();
