export const A1_SCREEN_POINTER_PROVENANCE_CONTRACT_V1 = "A1ScreenPointerProvenance/v1";

const finite = (value) => Number.isFinite(value);

export function auditSourcePointerBinding({capture = {}, receipt = {}, config = {}} = {}) {
  const failures = [];
  if (capture.cursorPixelPolicy !== "CAP_NATIVE_CURSOR_REPLAY_FROM_SOURCE_EVENTS" || capture.sourcePointerReplay?.contract !== "A1CapSourcePointerReplay/v1" || capture.sourcePointerReplay.interpolation !== "RAW_CAPTURED_EVENT_POINTS") failures.push("SOURCE_CURSOR_REPLAY_POLICY_MISSING");
  if (receipt.sourcePointerEvidence?.policy !== "CAP_NATIVE_CURSOR_REPLAY_FROM_SOURCE_EVENTS") failures.push("RECEIPT_POINTER_PIXEL_POLICY_MISMATCH");
  if (receipt.sourcePointerEvidence?.capCursorOverlay !== "CAP_NATIVE_ASSET_REPLAY" || config.cursor?.hide !== false || config.cursor?.raw !== true || config.cursor?.motionBlur !== 0 || config.cursor?.clickSpring || receipt.feedback?.cursorOverlay !== "CAP_NATIVE_ASSET_NO_SPRING_OR_BLUR") failures.push("SOURCE_EVENT_NATIVE_CURSOR_POLICY_MISMATCH");
  const events = capture.sourcePointerEvents || [];
  if (!receipt.sourcePointerEvidence?.trustedMouseDownCount) failures.push("TRUSTED_MOUSE_CLICK_MISSING");
  const trustedMouse = events.filter((event) => event.isTrusted === true && event.pointerType === "mouse");
  const moves = trustedMouse.filter((event) => event.type === "pointermove");
  const downs = trustedMouse.filter((event) => event.type === "pointerdown");
  const ups = trustedMouse.filter((event) => event.type === "pointerup");
  if (!moves.length || !downs.length || !ups.length) failures.push("TRUSTED_SOURCE_MOUSE_PATH_INCOMPLETE");
  for (const event of trustedMouse) {
    if (![event.pagePerformanceTimeMs, event.captureTimeMs, event.cssX, event.cssY].every(finite)) failures.push("SOURCE_MOUSE_SAMPLE_INVALID");
  }
  const clicks = capture.clickTargetProof || [];
  for (const click of clicks) {
    const matches = downs.filter((event) => event.captureTimeMs >= click.clickAtMs - 80 && event.captureTimeMs <= click.clickAtMs + 80);
    if (matches.length !== 1) { failures.push(`CLICK_SOURCE_EVENT_MISSING_OR_AMBIGUOUS:${click.event}`); continue; }
    const [event] = matches, rect = click.targetRectCss;
    if (Math.hypot(event.cssX - click.pointerCss.x, event.cssY - click.pointerCss.y) > 1) failures.push(`CLICK_TELEMETRY_SOURCE_COORDINATES_DRIFT:${click.event}`);
    if (!click.insideTarget || !rect || event.cssX < rect.x || event.cssX > rect.x + rect.width || event.cssY < rect.y || event.cssY > rect.y + rect.height) failures.push(`SOURCE_MOUSE_MISSES_TARGET:${click.event}`);
    if (event.cursorCss === "none") failures.push(`TARGET_HIDES_NATIVE_CURSOR:${click.event}`);
    if (!receipt.sourcePointerEvidence?.captureEventCount) failures.push(`SOURCE_POINTER_TRACK_MISSING:${click.event}`);
  }
  const body = {
    contract: A1_SCREEN_POINTER_PROVENANCE_CONTRACT_V1,
    status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY",
    proofScope: "TRUSTED_BROWSER_MOUSE_EVENTS_REPLAYED_AS_CAP_NATIVE_CURSOR_ASSETS",
    eventCounts: {total: events.length, trustedMouse: trustedMouse.length, moves: moves.length, downs: downs.length, ups: ups.length, verifiedClickTargets: clicks.length},
    sourcePixels: "CURSOR_PIXELS_RENDERED_BY_CAP_FROM_SAME_CAPTURE_EVENTS",
    syntheticCursorOverlay: "CAP_NATIVE_ASSET_REPLAY_FROM_SAME_BROWSER_EVENTS",
    alignmentUncertaintyMs: capture.sourcePointerTimeOrigin?.alignmentUncertaintyMs ?? null,
    failures,
    visualAcceptance: "NOT_REVIEWED",
  };
  return body;
}
