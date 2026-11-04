#!/usr/bin/env node
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {discoverArticleScreenTargets} from "./lib/discover-article-screen-targets-v1.mjs";

const browser = await chromium.launch({headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
try {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
  const body = `<h1>Ocean evidence</h1><p class="teaser">${"Teaser text. ".repeat(12)}</p><div class="article-body"><div class="comparison"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/C9sAAAAASUVORK5CYII=" alt="actual article visual"></div>${[1, 2, 3, 4].map((i) => `<p class="body-p">${`Article paragraph ${i} with evidence and explanation. `.repeat(5)}</p>`).join("")}</div><aside class="related-content"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/C9sAAAAASUVORK5CYII=" alt="related card"></aside>`;
  const styles = `<style>article{width:950px;margin:150px auto}.teaser{width:270px}.body-p{width:710px;line-height:26px}.comparison img{display:block;width:710px;height:350px}.related-content img{display:block;width:800px;height:400px}</style>`;
  await page.setContent(`${styles}<main id="story"><article>${body}</article></main>`);
  const found = await page.evaluate(discoverArticleScreenTargets);
  assert.equal(found.bodyParagraphs.length, 4);
  assert.equal(found.images.length, 1);
  assert.equal(found.images[0].textLength, 0);
  assert.match(found.images[0].sourceUrl, /^data:image\/png/);
  assert.ok(found.images[0].top < found.bodyRange.startTop);
  await page.setContent(`${styles}<main id="story"><article>${body.replace(/<div class="comparison">.*?<\/div>/u, "")}</article></main>`);
  const noBodyImage = await page.evaluate(discoverArticleScreenTargets);
  assert.equal(noBodyImage.bodyParagraphs.length, 4);
  assert.equal(noBodyImage.images.length, 0, "a related card must not become article evidence");
  assert.ok(noBodyImage.confidence.route >= .62, "text-only article remains readable without inventing an image");
  assert.deepEqual(noBodyImage.unavailableCapabilities, ["IMAGE_DETAIL_NO_SOURCE"]);
  await page.setContent(`${styles}<main><article><h1>Short text-only note</h1><p class="body-p">${"A real paragraph can be short while still having enough text to read. ".repeat(3)}</p></article></main>`);
  const short = await page.evaluate(discoverArticleScreenTargets);
  assert.equal(short.bodyParagraphs.length, 1);
  assert.ok(short.confidence.route >= .62);
  assert.equal(short.images.length, 0);
  await page.setContent(`${styles}<main><article><h1>Visible source</h1><details><summary>Support details</summary><p class="body-p">${"Hidden compatibility information is not the article body. ".repeat(4)}</p></details><p class="body-p">${"The visible explanation is the actual source to record and read. ".repeat(4)}</p></article></main>`);
  const hidden = await page.evaluate(discoverArticleScreenTargets);
  assert.equal(hidden.bodyParagraphs.length, 1);
  assert.ok(hidden.bodyParagraphs[0].text.startsWith("The visible explanation"));
  await page.setContent("<main><h1>Sign in</h1><p>Continue</p></main>");
  assert.equal((await page.evaluate(discoverArticleScreenTargets)).confidence.route, 0);
  console.log(JSON.stringify({status: "PASS", scope: "CONTROLLED_DISCOVERY_FIXTURES_ONLY", tests: ["article-image-selected", "related-card-rejected", "text-only-reading-retained", "short-article-reading-retained", "closed-details-rejected", "login-page-rejected"]}));
} finally {
  await browser.close();
}
