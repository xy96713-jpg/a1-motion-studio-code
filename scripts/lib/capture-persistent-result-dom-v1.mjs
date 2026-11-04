import crypto from "node:crypto";

const TARGETS = Object.freeze({
  "ED-02": {targetKey: "rewritten-paragraph", selectors: ["#a1-action-original"], strategy: "SINGLE_VISIBLE", resultEvent: "result_hold"},
  "ED-03": {targetKey: "preference-status", selectors: ["#selectionMenu", "#selectionMenuStatus"], strategy: "FIRST_VISIBLE", resultEvent: "style_library_hold"},
  "ED-04": {targetKey: "paragraph-candidate-list", selectors: ["#candidateList .candidate-text", "#candidateList"], strategy: "FIRST_VISIBLE", resultEvent: "paragraph_candidates_hold"},
  "ED-05": {targetKey: "final-review-result", selectors: ["#candidateList", ".final-review-item"], strategy: "STABLE_CONTAINER_FIRST_VISIBLE_CHILD", resultEvent: "review_findings_hold"},
  "ED-21": {targetKey: "edited-paragraph", selectors: ["#a1-action-original"], strategy: "SINGLE_VISIBLE", resultEvent: "edit_applied"},
  "ED-25": {targetKey: "preference-intercept-panel", selectors: ["#preferenceInterceptPanel"], strategy: "SINGLE_VISIBLE", resultEvent: "preference_intercept_matched"},
  "ED-27": {targetKey: "paragraph-input-slot", selectors: ["#a1-paragraph-request-result", 'p[data-paragraph-assist-slot="1"]', "p.paragraph-assist-slot"], strategy: "FIRST_VISIBLE", resultEvent: "paragraph_request_ready"},
  "ED-29": {targetKey: "final-review-result", selectors: ["#candidateList", ".final-review-item"], strategy: "STABLE_CONTAINER_FIRST_VISIBLE_CHILD", resultEvent: "review_findings_hold"},
});

const round = (value) => Math.round(Number(value) * 1000) / 1000;
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function persistentResultDomTargetForShot(shotId) {
  const target = TARGETS[shotId];
  return target ? structuredClone(target) : null;
}

export async function capturePersistentResultDomSnapshot(page, {spec, observedAtMs, tokenSeed, expectedNodeTokens = null}) {
  const snapshot = await page.evaluate(async ({selectors, strategy, tokenSeed: seed, expectedNodeTokens: expected}) => {
    const isRenderable = (node) => {
      if (!(node instanceof Element)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return !node.hidden && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return !node.hidden && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
    };
    let nodes = [];
    let resolvedSelector = "";
    let rectNodes = [];
    if (strategy === "STABLE_CONTAINER_FIRST_VISIBLE_CHILD") {
      const container = document.querySelector(selectors[0]);
      const child = [...document.querySelectorAll(selectors[1])].find(isRenderable);
      if (isRenderable(container) && child) {
        nodes = [container];
        rectNodes = [child];
        resolvedSelector = `${selectors[0]}=>${selectors[1]}:first-visible`;
      }
    } else if (strategy === "CONTAINER_OR_VISIBLE_UNION") {
      const container = document.querySelector(selectors[0]);
      if (isRenderable(container)) {
        nodes = [container];
        resolvedSelector = selectors[0];
      } else {
        nodes = [...document.querySelectorAll(selectors[1])].filter(isRenderable);
        resolvedSelector = `${selectors[1]}:visible-union`;
      }
    } else {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (!isRenderable(node)) continue;
        nodes = [node];
        resolvedSelector = selector;
        break;
      }
    }
    if (!rectNodes.length) rectNodes = nodes;
    if (!nodes.length) return {failure: "TARGET_MISSING_OR_NOT_VISIBLE", selectorState: selectors.map((selector) => ({selector, count: document.querySelectorAll(selector).length}))};
    if (!rectNodes.every(isVisible)) {
      rectNodes[0].scrollIntoView({block: "center", inline: "nearest", behavior: "auto"});
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    if (!nodes.every(isRenderable) || !rectNodes.every(isVisible)) return {failure: "TARGET_MISSING_OR_NOT_VISIBLE", selectorState: selectors.map((selector) => ({selector, count: document.querySelectorAll(selector).length}))};
    // Record the scroll AT MEASUREMENT TIME. getBoundingClientRect() below is a
    // pure viewport rect; pairing it with a scroll captured at a different moment
    // is exactly the coordinate mismatch that pushed the focus hole off-target.
    const measuredScroll = {x: window.scrollX, y: window.scrollY};
    const measuredViewport = {width: innerWidth, height: innerHeight};
    const nodeTokens = nodes.map((node, index) => {
      const wanted = expected?.[index] || `${seed}-${index}`;
      if (expected && node.dataset.a1PersistentResultToken !== wanted) return null;
      node.dataset.a1PersistentResultToken = wanted;
      return wanted;
    });
    if (nodeTokens.some((value) => !value) || (expected && expected.length !== nodeTokens.length)) return {failure: "DOM_NODE_IDENTITY_CHANGED"};
    const rects = rectNodes.map((node) => node.getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const normalize = (value) => String(value || "").replace(/\s+/gu, " ").trim();
    const identity = nodes.map((node) => ({
      tagName: node.tagName,
      id: node.id || "",
      className: normalize(node.className),
      textContent: normalize(node.textContent),
      childElementCount: node.childElementCount,
    }));
    return {
      resolvedSelector,
      nodeTokens,
      rect: {x: left, y: top, width: right - left, height: bottom - top},
      visible: nodes.every(isRenderable) && rectNodes.every(isVisible),
      identity,
      measuredScroll,
      measuredViewport,
    };
  }, {selectors: spec.selectors, strategy: spec.strategy, tokenSeed, expectedNodeTokens});
  if (snapshot.failure) throw new Error(`headless-persistent-result-dom:${spec.targetKey}:${snapshot.failure}:${JSON.stringify(snapshot.selectorState || [])}`);
  const rect = Object.fromEntries(Object.entries(snapshot.rect).map(([key, value]) => [key, round(value)]));
  return {
    observedAtMs: Math.round(observedAtMs),
    selector: snapshot.resolvedSelector,
    strategy: spec.strategy,
    rect,
    visible: snapshot.visible === true,
    nodeTokens: snapshot.nodeTokens,
    identitySha256: hash(snapshot.identity),
    measuredScroll: snapshot.measuredScroll,
    measuredViewport: snapshot.measuredViewport,
  };
}

export function finalizePersistentResultDom({spec, first, final, mapOutputMs, authorityDurationMs}) {
  if (!first || !final) throw new Error(`headless-persistent-result-dom:${spec.targetKey}:TWO_OBSERVATIONS_REQUIRED`);
  if (!first.visible || !final.visible) throw new Error(`headless-persistent-result-dom:${spec.targetKey}:VISIBILITY_FAILED`);
  if (first.identitySha256 !== final.identitySha256) throw new Error(`headless-persistent-result-dom:${spec.targetKey}:CONTENT_IDENTITY_CHANGED`);
  if (first.selector !== final.selector || first.strategy !== final.strategy) throw new Error(`headless-persistent-result-dom:${spec.targetKey}:TARGET_STRATEGY_CHANGED`);
  const finalObservedAtMs = Math.max(0, Math.round(authorityDurationMs - 250));
  const firstObservedAtMs = Math.min(finalObservedAtMs - 1, Math.max(0, Math.round(mapOutputMs(first.observedAtMs))));
  if (firstObservedAtMs < 0 || finalObservedAtMs <= firstObservedAtMs) throw new Error(`headless-persistent-result-dom:${spec.targetKey}:OBSERVATION_TIMES_INVALID`);
  const delta = {
    x: round(final.rect.x - first.rect.x),
    y: round(final.rect.y - first.rect.y),
    width: round(final.rect.width - first.rect.width),
    height: round(final.rect.height - first.rect.height),
  };
  const maxAbsPx = round(Math.max(...Object.values(delta).map((value) => Math.abs(value))));
  if (maxAbsPx > 2) throw new Error(`headless-persistent-result-dom:${spec.targetKey}:RECT_DRIFT:${maxAbsPx}`);
  return {
    targetKey: spec.targetKey,
    selector: first.selector,
    strategy: spec.strategy,
    resultEvent: spec.resultEvent,
    firstObservedAtMs,
    finalObservedAtMs,
    firstRect: first.rect,
    finalRect: final.rect,
    firstVisible: true,
    finalVisible: true,
    identitySha256: first.identitySha256,
    rectDrift: {...delta, maxAbsPx, status: "PASS"},
    status: "PASS",
  };
}
