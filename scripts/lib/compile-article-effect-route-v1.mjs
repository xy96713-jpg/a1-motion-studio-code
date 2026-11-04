import crypto from "node:crypto";

export const A1_ARTICLE_EFFECT_ROUTE_CONTRACT = "A1ArticleEffectRoute/v1";
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const targetRows = (report) => report?.geometryTruth?.status === "PASS_REVIEW_ONLY" ? (report.geometryTruth.targets || []) : [];
const sha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const hasStateSnapshot = (value) => Boolean(value && typeof value === "object" && (sha256(value.sha256) || (value.status === "PASS" && Number.isFinite(value.observedAtMs) && sha256(value.identitySha256))));
const hasSharedGeometry = (value) => Boolean(value && typeof value === "object" && (sha256(value.sha256) || (sha256(value.sourceSha256) && value.frameId)));
const hasBeforeAfter = (report) => {
  const evidence = report?.beforeAfterEvidence || report?.comparisonEvidence;
  if (!evidence || typeof evidence !== "object" || evidence.verified !== true) return false;
  const before = evidence.before || evidence.beforeState;
  const after = evidence.after || evidence.afterState;
  const sharedGeometry = evidence.sharedGeometry || evidence.geometry;
  return hasStateSnapshot(before) && hasStateSnapshot(after) && hasSharedGeometry(sharedGeometry);
};
const hasTyping = (report) => Array.isArray(report?.typingTelemetry) && report.typingTelemetry.length > 0;
const hasWait = (report) => Array.isArray(report?.waitTelemetry) && report.waitTelemetry.some((row) => Number(row.durationMs || 0) >= 900);
const hasRetries = (report) => Array.isArray(report?.retryIntervals) && report.retryIntervals.length > 0;
const hasDrag = (report) => Array.isArray(report?.dragTelemetry) && report.dragTelemetry.length >= 10;
const hasClicks = (report) => Array.isArray(report?.cursorTelemetry?.clicks) && report.cursorTelemetry.clicks.some((row) => row.down === true);
const scrollGroups = (report) => Object.values((report?.scrollTelemetry || []).reduce((groups, row) => { (groups[row.event] ||= []).push(row); return groups; }, {}));
const add = (rows, id, status, reason, evidence = []) => rows.push({id, status, reason, evidence});

export function compileArticleEffectRoute({scenario = {}, report = {}} = {}) {
  const rows = [];
  const targets = targetRows(report);
  const confidence = scenario.discovery?.confidence || {route: 0, image: 0, body: 0, root: 0};
  const scroll = scrollGroups(report);
  const lineCounts = targets.map((target) => target.lineRects?.length || 0);
  const maxLineCount = Math.max(0, ...lineCounts);
  const regionTargets = targets.filter((target) => target.kind === "REGION" && target.sourceRect);
  const detailTargets = regionTargets.filter((target) => target.detailRect || target.regionKind === "DETAIL" || (Array.isArray(target.sourcePixels) && target.sourcePixels.length > 1));
  const textTargets = targets.filter((target) => target.kind === "TEXT" && target.sourceRect);
  const captureReady = report.contract === "A1GenericBrowserScreenProof/v1" && report.status === "READY_FOR_CAP_REVIEW" && report.output?.fullDecodePass === true;
  const routeSafe = captureReady && Number(confidence.route || 0) >= .62;

  add(rows, "ESTABLISH_WIDE", routeSafe ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", routeSafe ? "真实网页首帧与根节点可读" : "捕获或文章发现未通过", ["rootConfidence", "captureDecode"]);
  add(rows, "SEMANTIC_PUSH", routeSafe && (textTargets.length || regionTargets.length) ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", "推近只能绑定真实目标区域", ["targetRect", "targetEvidence"]);
  add(rows, "SCROLL_BRAKE", routeSafe && scroll.length ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", scroll.length ? "捕获含真实滚动采样" : "没有滚动速度采样", ["scrollTelemetry"]);
  add(rows, "SCROLL_ANCHOR_FOLLOW", routeSafe && scroll.length && scroll.every((group) => Math.abs(group.at(-1)?.velocityPxPerMs || 0) <= .01) ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", "只有滚动结束速度为零才允许锚点跟随", ["scrollTelemetry", "settledVelocity"]);
  add(rows, "LINE_READING_TRACK", routeSafe && maxLineCount >= 3 ? "ELIGIBLE" : "NOT_APPLICABLE", maxLineCount >= 3 ? "真实文字行框足够" : "没有足够的真实行框", ["lineRects"]);
  add(rows, "VERTICAL_READING_TRACK", routeSafe && maxLineCount >= 8 ? "ELIGIBLE" : "NOT_APPLICABLE", maxLineCount >= 8 ? "真实长段落可纵向阅读" : "段落长度不足以证明纵向阅读", ["lineRects"]);
  add(rows, "EVIDENCE_UNDERLINE", routeSafe && maxLineCount >= 1 ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", maxLineCount ? "下划线绑定真实行框" : "缺少精确文字几何", ["lineRects"]);
  add(rows, "FOCUS_DIM", routeSafe && (textTargets.length || regionTargets.length) ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", "压暗只能绑定已观测目标", ["targetRect"]);
  add(rows, "DETAIL_DOLLY_IN_OUT", routeSafe && detailTargets.length && Number(confidence.image || 0) >= .72 ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", detailTargets.length ? "真实细节 ROI 与图像置信度满足局部推近条件" : "只有整图矩形，没有可验证的局部细节 ROI，禁止裁切式放大", ["detailRegion", "imageConfidence"]);
  add(rows, "DETAIL_INSET", routeSafe && detailTargets.length && Number(confidence.image || 0) >= .72 ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", detailTargets.length ? "插图绑定真实细节 ROI 和安全区" : "缺少真实细节 ROI，禁止伪造插图", ["detailRegion", "imageConfidence"]);
  add(rows, "DETAIL_LENS", routeSafe && detailTargets.length && Number(confidence.image || 0) >= .72 ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", detailTargets.length ? "局部镜绑定真实图像细节" : "缺少真实细节 ROI，禁止把整图裁切成局部镜", ["detailRegion", "imageConfidence"]);
  add(rows, "RESULT_HOLD", routeSafe ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", "所有文章路线都要保留最终可读停留", ["resultState"]);

  const clickEvidence = hasClicks(report);
  add(rows, "CURSOR_PATH_EASE", clickEvidence ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", clickEvidence ? "有真实点击相关鼠标轨迹" : "只有滚动后定位轨迹，没有交互事件", ["clickTelemetry", "cursorTelemetry"]);
  add(rows, "CLICK_BOUNCE", clickEvidence ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", clickEvidence ? "真实按下事件可驱动按压反馈" : "缺少 pointerdown/click 证据", ["clickTelemetry"]);
  add(rows, "MENU_OPEN_FOLLOW", clickEvidence && report.directorPlan?.beats?.some((beat) => beat.technique === "MENU_OPEN_FOLLOW") ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", "菜单跟随需要触发目标和展开目标", ["clickTelemetry", "menuTarget"]);
  add(rows, "DRAG_PATH_FOLLOW", hasDrag(report) ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", hasDrag(report) ? "真实拖拽路径与落点可用" : "缺少 pointerdown→move→drop 证据", ["dragTelemetry"]);
  add(rows, "DRAG_TETHER", hasDrag(report) ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", "牵引线必须绑定真实拖拽路径", ["dragTelemetry"]);
  add(rows, "BEFORE_AFTER_SPLIT", hasBeforeAfter(report) ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", hasBeforeAfter(report) ? "存在真实前后状态" : "没有真实 before/after 状态，禁止伪造", ["beforeState", "afterState"]);
  add(rows, "WIPE_COMPARE", hasBeforeAfter(report) ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", hasBeforeAfter(report) ? "存在共享几何的前后状态" : "没有共享几何的前后状态", ["beforeState", "afterState", "sharedGeometry"]);
  add(rows, "TYPE_SPEED_RAMP", hasTyping(report) ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", hasTyping(report) ? "真实输入区间可变速" : "没有真实 typing telemetry", ["typingTelemetry"]);
  add(rows, "WAIT_COMPRESSION", hasWait(report) ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", hasWait(report) ? "存在可验证空等区间" : "没有 wait interval 证据", ["waitTelemetry"]);
  add(rows, "RETRY_MONTAGE", hasRetries(report) ? "ELIGIBLE" : "BLOCKED_REQUIRED_EVIDENCE", hasRetries(report) ? "存在多次真实失败/重试区间" : "没有 retry intervals，禁止伪造重试蒙太奇", ["retryIntervals"]);
  add(rows, "CLICK_RIPPLE", "NOT_APPLICABLE", "装饰性点击环不作为成熟度基线", ["policy"]);

  const eligible = rows.filter((row) => row.status === "ELIGIBLE");
  const blocked = rows.filter((row) => row.status === "BLOCKED_REQUIRED_EVIDENCE");
  const result = {contract: A1_ARTICLE_EFFECT_ROUTE_CONTRACT, status: routeSafe ? "ROUTE_COMPILED_REVIEW_ONLY" : "BLOCKED_REQUIRED_EVIDENCE", mode: routeSafe ? "ARTICLE_SCROLL_READING" : "FAIL_CLOSED", confidence, evidence: {captureReady, targetCount: targets.length, textTargetCount: textTargets.length, regionTargetCount: regionTargets.length, maxLineCount, scrollGroupCount: scroll.length, clicks: clickEvidence, drag: hasDrag(report), beforeAfter: hasBeforeAfter(report), typing: hasTyping(report), wait: hasWait(report), retries: hasRetries(report)}, eligible, blocked, notApplicable: rows.filter((row) => row.status === "NOT_APPLICABLE"), source: {scenarioId: scenario.id || report.scenarioId || null, scenarioSha256: hash(scenario), captureReportSha256: hash(report)}, productionAdmission: false};
  result.routeSha256 = hash(result);
  return result;
}
