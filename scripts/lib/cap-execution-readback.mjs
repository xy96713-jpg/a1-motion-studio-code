const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-5;

export function describeCapExecutedEffects(report, config, {actionFirstCameraSuppressed = false} = {}) {
  return (report.directorPlan?.beats || []).map((beat) => {
    let execution = "UNAVAILABLE";
    if (beat.technique === "FOCUS_DIM") {
      const target = report.geometryTruth?.targets?.find((row) => row.targetKey === beat.event)?.sourceRect;
      const matchingMask = target && (config.timeline?.maskSegments || []).some((mask) => mask.enabled === true && mask.maskType === "highlight" && close(mask.start, beat.startMs / 1000) && close(mask.end, beat.endMs / 1000) && close(mask.center?.x, target.x + target.width / 2) && close(mask.center?.y, target.y + target.height / 2) && close(mask.size?.x, target.width) && close(mask.size?.y, target.height));
      if (matchingMask) execution = "CAP_MASK_EXECUTED";
    } else if (["LOCK_WIDE", "ESTABLISH_WIDE", "SOURCE_ACTION_ONLY", "HARD_CUT_STATE_REPLACE", "RESULT_HOLD"].includes(beat.technique)) execution = "SOURCE_VIDEO_PRESERVED";
    else if (["SEMANTIC_PUSH", "MENU_OPEN_FOLLOW", "SCROLL_ANCHOR_FOLLOW"].includes(beat.technique)) execution = actionFirstCameraSuppressed ? "SOURCE_VIDEO_PRESERVED" : config.timeline?.zoomSegments?.length ? "CAP_CAMERA_EXECUTED" : "UNAVAILABLE";
    return {id: beat.id, technique: beat.technique, execution, sourceEvent: beat.event || null};
  });
}

// Compare requested execution with the configuration actually persisted by Cap.
// This proves parameter preservation only, never visual acceptance.
export function auditCapExecutionReadback(expected, actual) {
  const failures = [];
  const masks = expected.timeline?.maskSegments || [];
  const savedMasks = actual.timeline?.maskSegments || [];
  if (masks.length !== savedMasks.length) failures.push('MASK_SEGMENT_COUNT_CHANGED');
  masks.forEach((mask, index) => {
    const saved = savedMasks[index];
    for (const key of ['start', 'end', 'darkness', 'opacity', 'feather', 'fadeDuration']) if (!close(mask[key], saved?.[key])) failures.push(`MASK_${key}_CHANGED:${index}`);
    for (const key of ['center', 'size']) for (const axis of ['x', 'y']) if (!close(mask[key]?.[axis], saved?.[key]?.[axis])) failures.push(`MASK_${key}_${axis}_CHANGED:${index}`);
    if (mask.maskType !== saved?.maskType || mask.enabled !== saved?.enabled) failures.push(`MASK_KIND_CHANGED:${index}`);
  });
  const planned = expected.timeline?.zoomSegments || [];
  const persisted = actual.timeline?.zoomSegments || [];
  if (planned.length !== persisted.length) failures.push('CAMERA_SEGMENT_COUNT_CHANGED');
  planned.forEach((segment, index) => {
    const saved = persisted[index];
    for (const key of ['start', 'end', 'amount', 'glideSpeed', 'edgeSnapRatio']) {
      if (!close(segment[key], saved?.[key])) failures.push(`CAMERA_${key}_CHANGED:${index}`);
    }
    for (const axis of ['x', 'y']) {
      if (!close(segment.mode?.manual?.[axis], saved?.mode?.manual?.[axis])) failures.push(`CAMERA_TARGET_${axis}_LOST:${index}`);
    }
    for (const key of ['glideDirection', 'instantAnimation']) {
      if (segment[key] !== saved?.[key]) failures.push(`CAMERA_${key}_CHANGED:${index}`);
    }
  });
  for (const key of ['hide', 'hideWhenIdle']) {
    if (expected.cursor?.[key] !== actual.cursor?.[key]) failures.push(`CURSOR_${key}_CHANGED`);
  }
  if (Boolean(expected.cursor?.ripple?.enabled) !== Boolean(actual.cursor?.ripple?.enabled)) failures.push('CURSOR_RIPPLE_CHANGED');
  const segments = expected.timeline?.segments || [];
  const savedSegments = actual.timeline?.segments || [];
  if (segments.length !== savedSegments.length) failures.push('SOURCE_SEGMENT_COUNT_CHANGED');
  segments.forEach((segment, index) => {
    for (const key of ['recordingSegment', 'start', 'end', 'timescale']) {
      if (!close(segment[key], savedSegments[index]?.[key])) failures.push(`SOURCE_${key}_CHANGED:${index}`);
    }
  });
  return {status: failures.length ? 'FAIL' : 'PASS', scope: 'CONFIGURATION_PRESERVATION_ONLY', visualAcceptance: 'NOT_REVIEWED', failures};
}
