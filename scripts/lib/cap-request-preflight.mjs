export const GENERIC_CAP_EXECUTABLE_TECHNIQUES = Object.freeze(['LOCK_WIDE', 'ESTABLISH_WIDE', 'SOURCE_ACTION_ONLY', 'SEMANTIC_PUSH', 'FOCUS_DIM', 'MENU_OPEN_FOLLOW', 'SCROLL_ANCHOR_FOLLOW', 'HARD_CUT_STATE_REPLACE', 'RESULT_HOLD']);

export function preflightCapRequest(report) {
  const failures = [];
  const supported = new Set(GENERIC_CAP_EXECUTABLE_TECHNIQUES);
  if (report.geometryTruth?.status !== 'PASS_REVIEW_ONLY') failures.push('GEOMETRY_REQUIRED');
  if (!report.captureSync?.method || report.captureSync.syncPass !== true) failures.push('TIME_ORIGIN_PROOF_REQUIRED');
  const beats = report.directorPlan?.beats;
  if (!Array.isArray(beats) || !beats.length) failures.push('DIRECTOR_BEATS_REQUIRED');
  const effects = (beats || []).map(beat => {
    const executable = supported.has(beat.technique);
    if (!executable) failures.push(`EFFECT_EXECUTOR_UNAVAILABLE:${beat.id}:${beat.technique}`);
    if (['SEMANTIC_PUSH', 'MENU_OPEN_FOLLOW', 'SCROLL_ANCHOR_FOLLOW'].includes(beat.technique) && !(report.directorPlan?.cameraBeats || []).some(camera => camera.targetEvent === beat.event)) failures.push(`CAMERA_RECIPE_MISSING:${beat.id}`);
    if (beat.technique === 'HARD_CUT_STATE_REPLACE' && !(report.events || []).some(event => event.name === beat.event || event.name === 'result_hold')) failures.push(`STATE_EVENT_REQUIRED:${beat.id}`);
    if (beat.technique === 'RESULT_HOLD' && !(report.events || []).some(event => event.name === beat.event || event.name === 'result_hold')) failures.push(`RESULT_EVENT_REQUIRED:${beat.id}`);
    if (beat.technique === 'FOCUS_DIM') {
      const target = report.geometryTruth?.targets?.find(t => t.targetKey === beat.event);
      if (!target?.sourceRect || !Number.isFinite(target.observedAtMs)) failures.push(`FOCUS_TARGET_REQUIRED:${beat.id}`);
      if (!Number.isFinite(beat.startMs) || !Number.isFinite(beat.endMs) || beat.startMs < target?.observedAtMs || beat.endMs - beat.startMs < 800 || beat.endMs > report.output?.durationMs) failures.push(`FOCUS_TIMING_INVALID:${beat.id}`);
      if ((report.directorPlan?.cameraBeats || []).length) failures.push(`FOCUS_CAMERA_COMPOSITION_NOT_YET_VERIFIED:${beat.id}`);
    }
    return {id: beat.id, technique: beat.technique, executable};
  });
  return {status: failures.length ? 'BLOCKED' : 'READY_FOR_PARAMETER_COMPILATION', effects, failures};
}
