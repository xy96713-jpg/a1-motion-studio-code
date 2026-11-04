// 4311 actual page check
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto('http://127.0.0.1:4311/system-line-visual-workbench', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-a1-editorial-asset-workbench]')?.getAttribute('data-a1-editorial-asset-workbench') !== 'loading', { timeout: 15000 });
  const state = await page.evaluate(() => document.querySelector('[data-a1-editorial-asset-workbench]')?.getAttribute('data-a1-editorial-asset-workbench'));
  console.log('state after hydrate:', state);

  const info = await page.evaluate(() => {
    const out = {};
    out.shot_count = document.querySelectorAll('[data-shot-id]').length;
    out.shot_ids = Array.from(document.querySelectorAll('[data-shot-id]')).slice(0, 40).map((e) => e.getAttribute('data-shot-id'));
    out.package_count = document.querySelectorAll('[data-shot-package]').length;
    out.no_package = document.querySelectorAll('[data-shot-no-package]').length;
    out.storyboard_elements = document.querySelectorAll('[data-a1-storyboard]').length;
    out.main_text_sample = document.body.innerText.slice(0, 600);
    out.gray_panels = Array.from(document.querySelectorAll('div, section, article'))
      .filter((e) => {
        const cs = getComputedStyle(e);
        if (cs.backgroundColor !== 'rgb(17, 19, 21)' && cs.backgroundColor !== 'rgb(8, 10, 11)' && cs.backgroundColor !== 'rgba(17, 19, 21, 1)') return false;
        const r = e.getBoundingClientRect();
        return r.width > 200 && r.height > 100;
      })
      .slice(0, 8)
      .map((e) => ({ size: e.getBoundingClientRect().width + 'x' + e.getBoundingClientRect().height, text: (e.textContent || '').trim().slice(0, 60), tag: e.tagName, cls: (e.className || '').slice(0, 80) }));
    // 看图片实际加载情况
    out.images = Array.from(document.querySelectorAll('img')).slice(0, 20).map((img) => ({
      src: img.src?.slice(-80),
      natW: img.naturalWidth,
      natH: img.naturalHeight,
      dispW: img.getBoundingClientRect().width,
      dispH: img.getBoundingClientRect().height,
      complete: img.complete,
    }));
    return out;
  });
  console.log('shot_count:', info.shot_count);
  console.log('shot_ids[:30]:', info.shot_ids);
  console.log('package_count:', info.package_count);
  console.log('no_package:', info.no_package);
  console.log('storyboard_elements:', info.storyboard_elements);
  console.log('gray_panels:');
  for (const g of info.gray_panels) console.log(' ', JSON.stringify(g));
  console.log('--- images (first 20) ---');
  for (const i of info.images) console.log(' ', JSON.stringify(i));
  console.log('--- main_text_sample (first 500) ---');
  console.log(info.main_text_sample.slice(0, 500));
  console.log('--- console errors/warnings (first 10) ---');
  for (const e of errors.slice(0, 10)) console.log(' ', e.slice(0, 200));
  await page.screenshot({ path: '/tmp/a1-4311-current.png', fullPage: false });
  await page.screenshot({ path: '/tmp/a1-4311-full.png', fullPage: true });
  console.log('--- screenshots saved ---');
  await browser.close();
})();
