// Runs in the captured page. Keep selectors derived from DOM structure, not a site's classes.
export function discoverArticleScreenTargets() {
  const roots = [...document.querySelectorAll("article,main,[role='main']")]
    .map((node) => ({node, score: node.querySelectorAll("p").length * 3 + node.querySelectorAll("figure,img").length + node.querySelectorAll("h1,h2").length}))
    .sort((a, b) => b.score - a.score);
  const root = roots[0]?.node;
  if (!root) return null;
  const rootCandidates = roots.slice(0, 3).map(({node, score}) => ({selector: node.id ? `#${CSS.escape(node.id)}` : node.tagName.toLowerCase(), score, textLength: (node.innerText || node.textContent || "").replace(/\s+/gu, " ").trim().length}));
  const rootGap = roots[1] ? Math.max(0, (roots[0].score - roots[1].score) / Math.max(1, roots[0].score)) : 1;
  const rootSelector = root.id ? `#${CSS.escape(root.id)}` : root.tagName.toLowerCase();
  const rectOf = (node) => {
    const rect = node.getBoundingClientRect();
    return {top: rect.top + scrollY, left: rect.left + scrollX, width: rect.width, height: rect.height};
  };
  const row = (node, selector, index) => {
    const rect = rectOf(node);
    const fullText = (node.innerText || node.textContent || "").replace(/\s+/gu, " ").trim();
    const painted = typeof node.checkVisibility === "function" && node.checkVisibility({checkOpacity: true, checkVisibilityCSS: true});
    return {selector, index, ...rect, text: fullText.slice(0, 180), textLength: fullText.length, visible: painted && rect.width > 20 && rect.height > 10};
  };
  const indexed = (selector) => [...root.querySelectorAll(selector)].map((node, index) => ({node, ...row(node, `${rootSelector} ${selector}`, index)}));
  const headings = indexed("h1").filter((item) => item.visible);
  const paragraphs = indexed("p").filter((item) => item.visible && item.textLength >= 100 && item.top > 0);
  const widthBuckets = new Map();
  for (const item of paragraphs) {
    const bucket = Math.round(item.width / 50) * 50;
    widthBuckets.set(bucket, (widthBuckets.get(bucket) || 0) + 1);
  }
  const bodyWidth = [...widthBuckets].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || 0;
  const bodyParagraphs = paragraphs.filter((item) => Math.abs(item.width - bodyWidth) <= Math.max(30, bodyWidth * 0.15));
  if (!headings.length || bodyParagraphs.length < 1) return {rootSelector, rootCandidates, headings, paragraphs, bodyParagraphs, images: [], title: document.title, confidence: {root: Math.min(1, .55 + rootGap), body: .35, image: 0, route: 0}, ambiguities: ["ARTICLE_BODY_OR_HEADING_INSUFFICIENT"]};
  const firstBody = bodyParagraphs[0], lastBody = bodyParagraphs.at(-1);
  const excluded = /(?:^|[-_\s])(related|sidebar|nav|next|prev|download|thumbnail|card|promo|teaser|social|share|resource|recommend)(?:[-_\s]|$)/iu;
  const images = indexed("img").filter((item) => {
    if (!item.visible || item.width < 300 || item.height < 180 || item.width * item.height < 80000) return false;
    if (item.top < headings[0].top - 200 || item.top > lastBody.top + lastBody.height) return false;
    if (!(item.node.currentSrc || item.node.src)) return false;
    for (let ancestor = item.node.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
      if (ancestor.matches("article,main,[role='main']")) break;
      if (ancestor.matches("aside,nav,footer,[role='complementary']")) return false;
      if (excluded.test(`${ancestor.id} ${typeof ancestor.className === "string" ? ancestor.className : ""}`)) return false;
    }
    return true;
  }).map(({node, ...item}) => ({...item, sourceUrl: node.currentSrc || node.src}));
  // Prefer a primary visual near the body opening. A pre-body hero is valid;
  // related cards and download thumbnails are not evidence for this article.
  images.sort((a, b) => {
    const distance = (item) => Math.abs(item.top - firstBody.top);
    return distance(a) - distance(b) || b.width * b.height - a.width * a.height;
  });
  const strip = ({node, ...item}) => item;
  const ambiguities = [];
  if (roots.length > 1 && rootGap < .18) ambiguities.push("ROOT_CANDIDATES_CLOSE");
  if (headings.length > 1) ambiguities.push("MULTIPLE_H1_CANDIDATES");
  if (images.length > 1) ambiguities.push("MULTIPLE_ARTICLE_IMAGES_REQUIRE_ROLE_RANKING");
  const rootConfidence = Math.min(1, .68 + rootGap * .24 + (headings.length === 1 ? .1 : 0));
  const bodyConfidence = Math.min(1, .58 + Math.min(1, bodyParagraphs.length / 10) * .32 + (bodyParagraphs.length === paragraphs.length ? .1 : 0));
  const imageConfidence = images.length ? Math.max(.62, Math.min(.94, .92 - Math.max(0, images.length - 1) * .08)) : 0;
  return {rootSelector, rootCandidates, headings: headings.map(strip), paragraphs: paragraphs.map(strip), bodyParagraphs: bodyParagraphs.map(strip), bodyRange: {startTop: firstBody.top, endTop: lastBody.top + lastBody.height}, images, title: document.title, confidence: {root: Number(rootConfidence.toFixed(3)), body: Number(bodyConfidence.toFixed(3)), image: Number(imageConfidence.toFixed(3)), route: Number(Math.min(rootConfidence, bodyConfidence).toFixed(3))}, unavailableCapabilities: images.length ? [] : ["IMAGE_DETAIL_NO_SOURCE"], ambiguities};
}
