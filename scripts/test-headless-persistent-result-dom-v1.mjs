#!/usr/bin/env node
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {
  capturePersistentResultDomSnapshot,
  finalizePersistentResultDom,
  persistentResultDomTargetForShot,
} from "./lib/capture-persistent-result-dom-v1.mjs";

const expected = {
  "ED-02": ["#a1-action-original", "result_hold"],
  "ED-03": ["#selectionMenu", "style_library_hold"],
  "ED-04": ["#candidateList .candidate-text", "paragraph_candidates_hold"],
  "ED-05": ["#candidateList", "review_findings_hold"],
  "ED-21": ["#a1-action-original", "edit_applied"],
  "ED-25": ["#preferenceInterceptPanel", "preference_intercept_matched"],
  "ED-27": ["#a1-paragraph-request-result", "paragraph_request_ready"],
  "ED-29": ["#candidateList", "review_findings_hold"],
};
for (const [shotId, [selector, resultEvent]] of Object.entries(expected)) {
  const target = persistentResultDomTargetForShot(shotId);
  assert.ok(target, `${shotId}:target`);
  assert.equal(target.selectors[0], selector, `${shotId}:selector`);
  assert.equal(target.resultEvent, resultEvent, `${shotId}:result-event`);
}
assert.equal(persistentResultDomTargetForShot("ED-06"), null);

const browser = await chromium.launch({executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  await page.setContent(`<!doctype html><style>#a1-action-original{position:absolute;left:220px;top:310px;width:620px;height:180px}</style><main id="editor"><p id="a1-action-original">已经回填正文的具体改写结果</p></main>`);
  const spec = persistentResultDomTargetForShot("ED-02");
  const first = await capturePersistentResultDomSnapshot(page, {spec, observedAtMs: 1120, tokenSeed: "fixture"});
  const final = await capturePersistentResultDomSnapshot(page, {spec, observedAtMs: 1737, tokenSeed: "fixture", expectedNodeTokens: first.nodeTokens});
  const proof = finalizePersistentResultDom({spec, first, final, mapOutputMs: (value) => value, authorityDurationMs: 1987});
  assert.equal(proof.status, "PASS");
  assert.equal(proof.targetKey, "rewritten-paragraph");
  assert.equal(proof.selector, "#a1-action-original");
  assert.equal(proof.resultEvent, "result_hold");
  assert.equal(proof.finalObservedAtMs, 1737);
  assert.equal(proof.firstVisible, true);
  assert.equal(proof.finalVisible, true);
  assert.match(proof.identitySha256, /^[a-f0-9]{64}$/u);
  assert.equal(proof.rectDrift.maxAbsPx, 0);
  assert.equal(proof.rectDrift.status, "PASS");

  await page.setContent(`<!doctype html><style>#candidateList{position:absolute;left:850px;top:190px;width:400px;height:230px}.final-review-item{position:absolute;left:25px;top:30px;width:360px;height:180px}</style><section id="candidateList"><article class="final-review-item">同一条收稿建议</article></section>`);
  const reviewSpec = persistentResultDomTargetForShot("ED-29");
  const reviewFirst = await capturePersistentResultDomSnapshot(page, {spec: reviewSpec, observedAtMs: 3250, tokenSeed: "review-fixture"});
  await page.evaluate(() => { document.querySelector(".final-review-item").outerHTML = '<article class="final-review-item">同一条收稿建议</article>'; });
  const reviewFinal = await capturePersistentResultDomSnapshot(page, {spec: reviewSpec, observedAtMs: 5710, tokenSeed: "review-fixture", expectedNodeTokens: reviewFirst.nodeTokens});
  const reviewProof = finalizePersistentResultDom({spec: reviewSpec, first: reviewFirst, final: reviewFinal, mapOutputMs: (value) => value, authorityDurationMs: 5960});
  assert.equal(reviewProof.status, "PASS");
  assert.equal(reviewProof.selector, "#candidateList=>.final-review-item:first-visible");
  assert.equal(reviewProof.rectDrift.maxAbsPx, 0);

  await page.evaluate(() => {
    const current = document.querySelector("#candidateList");
    const replacement = current.cloneNode(true);
    replacement.removeAttribute("data-a1-persistent-result-token");
    current.replaceWith(replacement);
  });
  await assert.rejects(
    () => capturePersistentResultDomSnapshot(page, {spec: reviewSpec, observedAtMs: 5800, tokenSeed: "review-fixture", expectedNodeTokens: reviewFirst.nodeTokens}),
    /DOM_NODE_IDENTITY_CHANGED/u,
  );

  await page.setContent("<!doctype html><main>missing result</main>");
  await assert.rejects(
    () => capturePersistentResultDomSnapshot(page, {spec, observedAtMs: 1120, tokenSeed: "fixture"}),
    /TARGET_MISSING_OR_NOT_VISIBLE/u,
  );
} finally {
  await browser.close();
}

console.log(JSON.stringify({status: "PASS", contract: "A1HeadlessPersistentResultDomTest/v1", liveWorkspaceWrites: 0, coveredShotIds: Object.keys(expected)}, null, 2));
