#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright";
import {discoverArticleScreenTargets} from "./lib/discover-article-screen-targets-v1.mjs";
import {SCREEN_PACKAGING_EFFECTS} from "../apps/studio-next/src/lib/a1-screen-packaging-effect-ontology-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outRoot = path.join(root, "work/screen-recording-maturity-test-v1/article-effect-readiness-v1");
const auditPath = path.join(outRoot, "article-readiness-audit.json");
const recommendationPath = path.join(outRoot, "effect-recommendation-matrix.json");
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const urls = [
  {id: "noaa-wreck", url: "https://oceanexplorer.noaa.gov/expedition-feature/24attu-battlefield-features-wreck-ecology/"},
  {id: "nasa-el-nino", url: "https://science.nasa.gov/earth/earth-observatory/el-nino-alters-marine-life-in-the-pacific/"},
  {id: "noaa-acidification", url: "https://www.noaa.gov/education/resource-collections/ocean-coasts/ocean-acidification"},
];
const recommendationRows = [
  {id: "ARTICLE_TARGET_CONFIDENCE", tier: "MUST_ADD", status: "MISSING_AS_EXPLICIT_CONTRACT", reason: "效果之前必须先证明正文根节点、正文范围、主图/段落和排除的相关卡；当前发现器有启发式，但没有置信度/歧义输出。"},
  {id: "SCROLL_BRAKE_AND_ANCHOR", tier: "UNIVERSAL_BASELINE", status: "PROVEN_REVIEW_ONLY", effects: ["SCROLL_BRAKE", "SCROLL_ANCHOR_FOLLOW"], reason: "文章必有阅读路径；没有停稳和锚点就不能进入后续推近。"},
  {id: "READING_TRACK", tier: "CONDITIONAL", status: "PROVEN_REVIEW_ONLY", effects: ["LINE_READING_TRACK", "VERTICAL_READING_TRACK"], reason: "只有真实行框足够、目标不遮字时启用；短文或复杂排版应降级为稳定阅读。"},
  {id: "SOURCE_BOUND_ANNOTATION", tier: "CONDITIONAL", status: "PROVEN_REVIEW_ONLY", effects: ["EVIDENCE_UNDERLINE", "HIGHLIGHT_WASH", "PARAGRAPH_BRACKET", "SHORT_PHRASE_CIRCLE"], reason: "必须有精确文字行框；不能用大致段落坐标代替。"},
  {id: "IMAGE_DETAIL_ROUTE", tier: "CONDITIONAL", status: "PROVEN_REVIEW_ONLY", effects: ["DETAIL_DOLLY_IN_OUT", "DETAIL_INSET", "DETAIL_LENS", "REGION_OUTLINE_DRAW"], reason: "只有正文范围内的真实图像且有安全区时启用；没有图像就保持文本阅读。"},
  {id: "POINTER_ACTION_ROUTE", tier: "CONDITIONAL", status: "PROVEN_REVIEW_ONLY", effects: ["CURSOR_PATH_EASE", "CURSOR_PUNCH", "CLICK_BOUNCE", "MENU_OPEN_FOLLOW"], reason: "文章页面通常没有点击/输入事件，不能因为有鼠标轨迹就自动添加点击效果。"},
  {id: "COMPARISON_ROUTE", tier: "EVIDENCE_GATED", status: "CONDITIONAL_ONLY", effects: ["BEFORE_AFTER_SPLIT", "WIPE_COMPARE", "DIFFERENCE_FLASH", "STATE_REPLACE_CUT", "CAUSE_RESULT_DUAL_VIEW"], reason: "需要同一对象的真实 before/after 状态与共享几何；一般文章页面不具备时必须阻断。"},
  {id: "DRAG_ROUTE", tier: "EVIDENCE_GATED", status: "CONDITIONAL_ONLY", effects: ["DRAG_PATH_FOLLOW", "DRAG_TETHER"], reason: "需要真实 pointerdown→move→drop 与 DOM 结果；文章网页默认不应启用。"},
  {id: "WAIT_AND_RETRY_EDIT", tier: "EVIDENCE_GATED", status: "CONDITIONAL_ONLY", effects: ["WAIT_COMPRESSION", "TYPE_SPEED_RAMP", "RETRY_MONTAGE"], reason: "只能压缩真实等待/输入/重试区间；缺事件就不能模拟。"},
  {id: "DECORATIVE_CLICK_RIPPLE", tier: "DO_NOT_PRIORITIZE", status: "NOT_NEEDED_FOR_MATURITY", effects: ["CLICK_RIPPLE"], reason: "装饰点击环不能证明行为，且会遮盖真实页面；保留为显式禁用。"},
  {id: "PRESENTER_AND_DEVICE_LAYOUT", tier: "SEPARATE_PRODUCT_MODE", status: "NOT_ARTICLE_BASELINE", effects: ["CAMERA_BUBBLE_REFLOW", "DEVICE_FRAME", "DUAL_WINDOW_RELAY", "VERTICAL_FORMAT_REFLOW"], reason: "这是产品演示/讲解者/竖屏布局能力，不应混入纯网页文章基线。"},
];

await fs.mkdir(outRoot, {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
const rows = [];
try {
  for (const input of urls) {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
    const failures = [];
    try {
      await page.goto(input.url, {waitUntil: "networkidle", timeout: 90000});
      const discovery = await page.evaluate(discoverArticleScreenTargets);
      if (!discovery) failures.push("ARTICLE_ROOT_NOT_FOUND");
      if ((discovery?.headings?.length || 0) !== 1) failures.push("SINGLE_PRIMARY_HEADING_NOT_CONFIRMED");
      if ((discovery?.bodyParagraphs?.length || 0) < 3) failures.push("BODY_PARAGRAPH_SET_TOO_SMALL");
      if (!(discovery?.images?.length)) failures.push("NO_BODY_IMAGE_FOR_DETAIL_ROUTE");
      const selected = discovery?.images?.[0] || null;
      const bodyRange = discovery?.bodyRange || null;
      if (selected && bodyRange && (selected.top < bodyRange.startTop - 1000 || selected.top > bodyRange.endTop)) failures.push("IMAGE_OUTSIDE_BODY_RANGE");
      rows.push({id: input.id, url: input.url, title: discovery?.title || null, rootSelector: discovery?.rootSelector || null, confidence: discovery?.confidence || null, ambiguities: discovery?.ambiguities || [], counts: {headings: discovery?.headings?.length || 0, paragraphs: discovery?.paragraphs?.length || 0, bodyParagraphs: discovery?.bodyParagraphs?.length || 0, eligibleImages: discovery?.images?.length || 0}, bodyRange, selectedImage: selected ? {top: selected.top, width: selected.width, height: selected.height, sourceUrl: selected.sourceUrl, selector: selected.selector, index: selected.index} : null, manualSiteSelectors: 0, interactionEvidence: {scroll: "AVAILABLE_AFTER_CAPTURE", click: "NOT_PRESENT_IN_ARTICLE_DISCOVERY", typing: "NOT_PRESENT_IN_ARTICLE_DISCOVERY", drag: "NOT_PRESENT_IN_ARTICLE_DISCOVERY", beforeAfter: "NOT_PRESENT_IN_ARTICLE_DISCOVERY"}, route: {baseline: failures.length || (discovery?.confidence?.route || 0) < .62 ? "FAIL_CLOSED" : "ARTICLE_SCROLL_READING", detailEffects: selected && (discovery?.confidence?.image || 0) >= .72 ? "ELIGIBLE_AFTER_GEOMETRY_CAPTURE" : "BLOCKED", comparisonEffects: "BLOCKED_UNTIL_BEFORE_AFTER_EVIDENCE", pointerEffects: "BLOCKED_UNTIL_POINTER_EVENT_EVIDENCE"}, failures, status: failures.length || (discovery?.confidence?.route || 0) < .62 ? "FAIL_CLOSED" : "READY_FOR_CAPTURE"});
    } catch (error) {
      rows.push({id: input.id, url: input.url, status: "ERROR", failures: [String(error)]});
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
const passRows = rows.filter((row) => row.status === "READY_FOR_CAPTURE");
const audit = {
  contract: "A1AutoArticleEffectReadinessAudit/v1",
  status: passRows.length === rows.length && rows.length >= 3 ? "PASS_FOR_ARTICLE_SCROLL_BASELINE" : "FAIL_CLOSED",
  sample: {count: rows.length, heldOutLivePages: rows.map((row) => row.id), sameDiscoveryFunction: true, manualSiteSelectors: rows.reduce((sum, row) => sum + (row.manualSiteSelectors || 0), 0)},
  rows,
  whatThisProves: ["正文根节点与范围可跨三种页面结构发现", "主图候选不会自动落入相关推荐/侧栏过滤之外", "基础滚动阅读路线可以进入捕获"],
  whatThisDoesNotProve: ["文章一定有 before/after、点击、输入、拖拽或重试事件", "所有效果可以进入同一 CAP production chain", "仅凭发现器就能判断哪个段落应该被推近"],
  effectFamilies: {currentOntologyCount: SCREEN_PACKAGING_EFFECTS.length, currentMatrixItems: 56, recommendationRows: recommendationRows.length},
  auditSha256: null,
};
audit.auditSha256 = hash(audit);
const recommendations = {contract: "A1ScreenEffectRecommendationMatrix/v1", status: "REVIEW_REQUIRED", rows: recommendationRows, boundary: {recommendationOnly: true, productionAdmission: false}, sha256: null};
recommendations.sha256 = hash(recommendations);
await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
await fs.writeFile(recommendationPath, `${JSON.stringify(recommendations, null, 2)}\n`);
console.log(JSON.stringify({status: audit.status, sample: audit.sample, rows: rows.map((row) => ({id: row.id, status: row.status, counts: row.counts, failures: row.failures})), audit: path.relative(root, auditPath), recommendations: path.relative(root, recommendationPath)}, null, 2));
