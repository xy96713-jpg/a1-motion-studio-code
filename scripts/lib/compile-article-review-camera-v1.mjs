const WIDE = {x: .5, y: .5, scale: 1};
const clampCenter = (value, scale) => Math.max(.5 / scale, Math.min(1 - .5 / scale, value));

// Reuse the established motion-dynamics sequence: wide -> enter -> hold -> return.
// Easing belongs to the START of a segment in ContinuousScreenEvidenceReelV2.
export function compileArticleReviewCamera({entries, report, durationMs}) {
  const track = [{atMs: 0, ...WIDE, easingToNext: "hold"}];
  const moves = [];
  for (const entry of [...entries].sort((a, b) => a.timing.atMs - b.timing.atMs)) {
    const event = report.events.find((row) => row.name === entry.event);
    const settled = report.events.find((row) => row.name === `${entry.event}-scroll-settled`);
    if (!event || !Number.isFinite(event.tMs)) throw new Error(`camera-event-missing:${entry.event}`);
    const startMs = Math.max(event.tMs, (settled?.tMs ?? event.tMs) + 120);
    const peakMs = startMs + 850;
    const returnMs = peakMs + Math.max(900, entry.timing.holdMs);
    const endMs = returnMs + 850;
    const nextScroll = report.events.find((row) => row.type === "scroll-start" && row.tMs > event.tMs);
    const deadline = Math.min(durationMs - 800, nextScroll ? nextScroll.tMs - 120 : durationMs);
    if (endMs > deadline || startMs <= track.at(-1).atMs) throw new Error(`camera-window-overlap:${entry.event}`);
    const rect = entry.target.sourceRect;
    const scale = entry.effectId === "DETAIL_DOLLY_IN_OUT" ? 1.34 : 1.18;
    const pose = {x: clampCenter(rect.x + rect.width / 2, scale), y: clampCenter(rect.y + rect.height / 2, scale), scale};
    track.push(
      {atMs: startMs, ...WIDE, easingToNext: "cinematic-in-out"},
      {atMs: peakMs, ...pose, easingToNext: "hold"},
      {atMs: returnMs, ...pose, easingToNext: "restore"},
      {atMs: endMs, ...WIDE, easingToNext: "hold"},
    );
    moves.push({effectId: entry.effectId, event: entry.event, startMs, peakMs, returnMs, endMs, maximumScale: scale});
  }
  track.push({atMs: durationMs, ...WIDE, easingToNext: "hold"});
  return {track, moves};
}

export function assertContinuousCameraTrack(track) {
  for (let index = 0; index < track.length - 1; index += 1) {
    const from = track[index], to = track[index + 1];
    for (const key of ["atMs", "x", "y", "scale"]) if (!Number.isFinite(from[key]) || !Number.isFinite(to[key])) throw new Error(`camera-non-finite:${key}`);
    for (const row of [from, to]) if (row.x < 0 || row.x > 1 || row.y < 0 || row.y > 1 || row.scale < 1 || row.scale > 4) throw new Error("camera-out-of-range");
    if (to.atMs <= from.atMs) throw new Error("camera-times-not-increasing");
    if (from.easingToNext === "hold" && ["x", "y", "scale"].some((key) => Math.abs(from[key] - to[key]) > 1e-9)) {
      throw new Error(`camera-jump-after-hold:${to.atMs}`);
    }
  }
}
