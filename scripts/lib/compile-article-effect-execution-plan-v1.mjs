import crypto from "node:crypto";

export const A1_ARTICLE_EFFECT_EXECUTION_PLAN_CONTRACT = "A1ArticleEffectExecutionPlan/v1";
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const effectSpec = {
  ESTABLISH_WIDE: {kind: "TEXT", adapter: "CAP_CAMERA", holdMs: 900},
  SEMANTIC_PUSH: {kind: "ANY", adapter: "CAP_CAMERA", holdMs: 700},
  SCROLL_BRAKE: {kind: "ANY", adapter: "CAP_CAMERA", holdMs: 650},
  SCROLL_ANCHOR_FOLLOW: {kind: "ANY", adapter: "CAP_CAMERA", holdMs: 650},
  LINE_READING_TRACK: {kind: "TEXT", minLines: 3, adapter: "POST_SCREEN_ANNOTATION", holdMs: 800},
  VERTICAL_READING_TRACK: {kind: "TEXT", minLines: 8, adapter: "POST_SCREEN_ANNOTATION", holdMs: 900},
  EVIDENCE_UNDERLINE: {kind: "TEXT", minLines: 1, adapter: "POST_SCREEN_ANNOTATION", holdMs: 900},
  FOCUS_DIM: {kind: "ANY", adapter: "CAP_CAMERA", holdMs: 650},
  DETAIL_DOLLY_IN_OUT: {kind: "REGION", detailOnly: true, adapter: "CAP_CAMERA", holdMs: 850},
  DETAIL_INSET: {kind: "REGION", detailOnly: true, adapter: "POST_SCREEN_DETAIL", holdMs: 850},
  DETAIL_LENS: {kind: "REGION", detailOnly: true, adapter: "POST_SCREEN_DETAIL", holdMs: 850},
  RESULT_HOLD: {kind: "ANY", adapter: "CAP_CAMERA", holdMs: 1600},
};
const reviewExecutorEffects = new Set(["ESTABLISH_WIDE", "SEMANTIC_PUSH", "SCROLL_BRAKE", "SCROLL_ANCHOR_FOLLOW", "RESULT_HOLD", "EVIDENCE_UNDERLINE"]);

const beats = (scenario) => Array.isArray(scenario?.directorPlan?.beats) ? scenario.directorPlan.beats : [];
const eventRows = (report) => Array.isArray(report?.events) ? report.events : [];
const targets = (report) => report?.geometryTruth?.status === "PASS_REVIEW_ONLY" && Array.isArray(report.geometryTruth.targets) ? report.geometryTruth.targets : [];
const findEvent = (report, name) => eventRows(report).find((row) => row.name === name) || null;
const targetForEvent = (report, name) => targets(report).find((row) => row.event === name || row.targetKey === name) || null;
const scrollTargets = (report) => targets(report).filter((row) => row.kind === "TEXT" || row.kind === "REGION").filter((row) => findEvent(report, row.event));
const matchTarget = (report, spec, preferredEvent, strictPreferred = false) => {
  const preferred = preferredEvent ? targetForEvent(report, preferredEvent) : null;
  const valid = (row) => row && (spec.kind === "ANY" || row.kind === spec.kind) && (!spec.minLines || (row.lineRects || []).length >= spec.minLines) && (!spec.detailOnly || row.detailRect || row.regionKind === "DETAIL" || (Array.isArray(row.sourcePixels) && row.sourcePixels.length > 1));
  if (valid(preferred) || strictPreferred) return valid(preferred) ? preferred : null;
  return targets(report).find((row) => valid(row) && findEvent(report, row.event)) || null;
};
const beatFor = (scenario, technique) => beats(scenario).find((beat) => beat.technique === technique) || null;
const firstTargetEvent = (report, kind) => targets(report).find((row) => (kind === "ANY" || row.kind === kind) && findEvent(report, row.event))?.event || null;
const targetEventFor = (scenario, report, technique, kind) => {
  if (technique.startsWith("SCROLL_")) return scrollTargets(report).find((row) => findEvent(report, row.event)?.type === "scroll-target")?.event || scrollTargets(report)[0]?.event || null;
  return beatFor(scenario, technique)?.event || firstTargetEvent(report, kind);
};
const settledEventFor = (report, name) => eventRows(report).find((row) => row.name === `${name}-scroll-settled` || (row.type === "scroll-settled" && row.name?.startsWith(`${name}-`))) || null;
const observedAt = (target, event) => Number(event?.tMs ?? target?.observedAtMs ?? 0);

function compileEntry({effectId, spec, scenario, report, beatId = null, requestedEvent = null, fallbackFor = null}) {
  const isResultHold = effectId === "RESULT_HOLD";
  const preferredEvent = isResultHold ? null : (requestedEvent || targetEventFor(scenario, report, effectId, spec.kind));
  const target = isResultHold
    ? [...targets(report)].reverse().find((row) => findEvent(report, row.event)) || null
    : matchTarget(report, spec, preferredEvent, Boolean(requestedEvent));
  const targetEvent = target?.event || preferredEvent;
  const event = isResultHold
    ? eventRows(report).find((row) => row.name === "end") || [...eventRows(report)].reverse().find((row) => Number.isFinite(row.tMs)) || null
    : targetEvent ? findEvent(report, targetEvent) : null;
  if ((!target && !isResultHold) || !event) return {beatId, effectId, fallbackFor, status: "BLOCKED_REQUIRED_EVIDENCE", reason: requestedEvent ? `导演目标不存在或没有对应几何：${requestedEvent}` : "效果没有绑定到真实事件和几何目标", requiredEvidence: ["event", "targetGeometry"]};
  if (!reviewExecutorEffects.has(effectId)) return {beatId, effectId, fallbackFor, event: targetEvent, status: "BLOCKED_EXECUTOR_UNAVAILABLE", reason: "当前 review 执行器没有实现此效果", requiredEvidence: ["executorReceipt"]};
  const settled = effectId.startsWith("SCROLL_") ? settledEventFor(report, targetEvent) : null;
  return {
    beatId,
    effectId,
    fallbackFor,
    status: "READY_FOR_REVIEW_EXECUTION",
    adapter: spec.adapter,
    executionMode: "REVIEW_ONLY",
    event: targetEvent,
    eventType: event.type || null,
    timing: {atMs: isResultHold ? Math.max(0, Number(event.tMs || 0) - spec.holdMs) : observedAt(target, event), settledAtMs: isResultHold ? Number(event.tMs || 0) : settled?.tMs ?? null, holdMs: spec.holdMs},
    target: target ? {
      targetKey: target.targetKey || target.event || null,
      kind: target.kind,
      identitySha256: target.identitySha256 || null,
      sourceFrameId: target.sourceFrameId || null,
      sourceRect: target.detailRect || target.sourceRect || null,
      lineRects: target.lineRects || [],
      sourceTextSha256: target.identity?.textSha256 || null,
    } : null,
    proof: ["captureReport", "eventTelemetry", "geometryTruth"],
  };
}

export function compileArticleEffectExecutionPlan({scenario = {}, report = {}, route = {}} = {}) {
  const entries = [];
  const eligible = Array.isArray(route.eligible) ? route.eligible : [];
  const eligibleIds = new Set(eligible.map((row) => row.id));
  const requested = [
    {beatId: "baseline-scroll-brake", effectId: "SCROLL_BRAKE", requestedEvent: null},
    {beatId: "baseline-scroll-anchor", effectId: "SCROLL_ANCHOR_FOLLOW", requestedEvent: null},
    {beatId: "baseline-result-hold", effectId: "RESULT_HOLD", requestedEvent: null},
  ];
  for (const [index, beat] of beats(scenario).entries()) requested.push({beatId: beat.id || `beat-${index + 1}`, effectId: beat.technique, requestedEvent: beat.event || null});
  if (!requested.some((item) => item.effectId === "ESTABLISH_WIDE")) requested.push({beatId: "baseline-establish", effectId: "ESTABLISH_WIDE", requestedEvent: null});
  const suppressed = [];
  const fallbackByEffect = {DETAIL_DOLLY_IN_OUT: "SEMANTIC_PUSH", DETAIL_INSET: "SEMANTIC_PUSH", DETAIL_LENS: "SEMANTIC_PUSH"};
  for (const request of requested) {
    const {beatId, effectId} = request;
    const spec = effectSpec[effectId];
    if (!spec) {
      entries.push({beatId, effectId, status: "BLOCKED_UNSUPPORTED_EFFECT", reason: "效果未注册，禁止静默忽略", requiredEvidence: ["effectSpec"]});
      continue;
    }
    if (!eligibleIds.has(effectId)) {
      const fallback = fallbackByEffect[effectId];
      if (fallback && eligibleIds.has(fallback)) {
        suppressed.push({beatId, effectId, status: "SUPPRESSED_WITH_FALLBACK", fallbackEffectId: fallback, reason: "缺少真实细节 ROI，避免裁切式放大"});
        entries.push(compileEntry({beatId, effectId: fallback, spec: effectSpec[fallback], scenario, report, requestedEvent: request.requestedEvent, fallbackFor: effectId}));
      } else {
        entries.push({beatId, effectId, status: "BLOCKED_REQUIRED_EVIDENCE", reason: "导演选中的效果没有通过文章证据路由", requiredEvidence: ["routeEligibility"]});
      }
      continue;
    }
    entries.push(compileEntry({beatId, effectId, spec, scenario, report, requestedEvent: request.requestedEvent}));
  }
  const blocked = entries.filter((entry) => entry.status.startsWith("BLOCKED_"));
  const routeReady = route.status === "ROUTE_COMPILED_REVIEW_ONLY";
  const reportReady = report.contract === "A1GenericBrowserScreenProof/v1" && report.output?.fullDecodePass === true;
  const status = routeReady && reportReady && blocked.length === 0 ? "READY_FOR_REVIEW_EXECUTION" : blocked.some((entry) => entry.status === "BLOCKED_UNSUPPORTED_EFFECT") ? "BLOCKED_UNSUPPORTED_EFFECT" : "BLOCKED_REQUIRED_EVIDENCE";
  const plan = {
    contract: A1_ARTICLE_EFFECT_EXECUTION_PLAN_CONTRACT,
    status,
    executionMode: "REVIEW_ONLY",
    productionAdmission: false,
    routeSha256: route.routeSha256 || hash(route),
    source: {
      scenarioId: scenario.id || report.scenarioId || null,
      scenarioSha256: hash(scenario),
      captureReportSha256: hash(report),
    },
    summary: {
      eligibleEffectCount: eligible.length,
      selectedEffectCount: entries.length,
      plannedEffectCount: entries.filter((entry) => entry.status === "READY_FOR_REVIEW_EXECUTION").length,
      blockedEffectCount: blocked.length,
      suppressedEffectCount: suppressed.length,
      adapters: [...new Set(entries.filter((entry) => entry.adapter).map((entry) => entry.adapter))],
    },
    entries,
    blocked,
    suppressed,
    nextAction: blocked.length ? "COLLECT_MISSING_EVENT_OR_GEOMETRY_EVIDENCE" : "RUN_REVIEW_EXECUTION_AND_PIXEL_AUDIT",
  };
  plan.planSha256 = hash(plan);
  return plan;
}
