// Prepared frames are read synchronously; no interpolation or silent fallback.
// This primitive is not yet connected to stepStills or the browser runtime.
export async function prepareHairlineFrames(entries, rasterize) {
  const frames = new Map();
  for (const { id, spec, times } of entries) {
    if (frames.has(id)) throw new Error(`duplicate Hairline id: ${id}`);
    const byTime = new Map();
    for (const time of times) {
      if (!Number.isFinite(time) || time < 0) throw new Error(`invalid Hairline time: ${time}`);
      if (!byTime.has(time)) byTime.set(time, await rasterize(spec, time));
    }
    frames.set(id, byTime);
  }
  return Object.freeze({ get(id, time) {
    const byTime = frames.get(id);
    if (!byTime?.has(time)) throw new Error(`unprepared Hairline frame: ${id} @ ${time}`);
    return byTime.get(time);
  } });
}
