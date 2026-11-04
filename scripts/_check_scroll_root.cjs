const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4311/system-line-visual-workbench', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-a1-editorial-asset-workbench]')?.getAttribute('data-a1-editorial-asset-workbench') !== 'loading', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const data = await page.evaluate(() => {
    function inspect(el, label) {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        label,
        tag: el.tagName,
        cls: (el.className || '').slice(0, 100),
        rect: { w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom },
        scrollH: el.scrollHeight,
        overflow: cs.overflow,
        overflowY: cs.overflowY,
        position: cs.position,
        height: cs.height,
        maxHeight: cs.maxHeight,
        display: cs.display
      };
    }
    return {
      html: inspect(document.documentElement, 'html'),
      body: inspect(document.body, 'body'),
      main: inspect(document.querySelector('main'), 'main'),
      firstSection: inspect(document.querySelector('main > section'), 'firstSection'),
      firstSectionInner: (() => {
        const s = document.querySelector('main > section:nth-of-type(2)');
        if (!s) return null;
        const img = s.querySelector('img');
        const imgCS = img ? getComputedStyle(img) : null;
        return {
          section: inspect(s, 'section2'),
          firstImg: img ? { natW: img.naturalWidth, natH: img.naturalHeight, dispW: img.getBoundingClientRect().width, dispH: img.getBoundingClientRect().height, objectFit: imgCS?.objectFit, position: imgCS?.position, complete: img.complete } : null,
          sectionContent: s.innerHTML.length
        };
      })(),
      bodyScrollTest: (() => {
        document.documentElement.scrollTop = 500;
        document.body.scrollTop = 500;
        window.scrollTo(0, 500);
        return { after: window.scrollY, htmlScroll: document.documentElement.scrollTop, bodyScroll: document.body.scrollTop, max: document.documentElement.scrollHeight - window.innerHeight };
      })()
    };
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();
