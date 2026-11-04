// Scenes of one shot that show the same thing are one scene (the user 2026-10-23: 21秒开始为什么还是重复划好几次呢 怎么做这么
// 低级的错误呢 — B04's three cuts each pushed in on the same page and marked the same sentence: the storyboard's three
// readings got one quote each time). A scene whose card and slots match the one before it, the picture's file aside (a
// second capture of the same page), joins it: keep[i] false. The writer drops it before the shot is written; motion drops it
// from a shot written before.
export function sameSceneKeep(scenes, recipeOf = (sc) => sc.recipe) {
  const strip = (o) => JSON.stringify(o ?? {}, (k, v) => (k === 'asset' || k === 'gen' ? undefined : v));
  return scenes.map((sc, i) => i === 0 || !(recipeOf(sc, i) === recipeOf(scenes[i - 1], i - 1) && strip(sc.slots ?? sc) === strip(scenes[i - 1].slots ?? scenes[i - 1])));
}


// (pure but for `same`) a cut that only lays a title over the picture already on screen is no cut: the scene before
// takes the titled scene's card and words, keeps its own picture (one framing, one push), and the title comes on at the
// cut (cues.title, the plate preset's delay). Returns the scenes, the keep mask and the merged indices. suez B01
// 2026-10-27: the same satellite picture re-framed at 2.4 s and its push started over (the user: 开头怎么还乱闪 跳)
export function titleOverSame(scenes, cuts, same, recipeOf = (sc) => sc.recipe) {
  const out = scenes.map((sc) => ({ ...sc })), keep = scenes.map(() => true), merged = [];
  const titleOf = (sc) => { const t = sc?.slots?.title; return String(typeof t === 'string' ? t : t?.text || '').trim(); };
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1], cur = scenes[i], a = prev.slots?.background?.asset, b = cur.slots?.background?.asset;
    if (!keep[i - 1] || !a || !b || titleOf(prev) || !titleOf(cur) || prev.slots?.background?.video || cur.slots?.background?.video || !same(a, b)) continue;
    out[i - 1] = { ...cur, recipe: recipeOf(cur, i), slots: { ...cur.slots, background: prev.slots.background }, preset: 'plate', cues: { ...(cur.cues || {}), title: Math.max(0, (cuts[i] ?? 0) - (cuts[i - 1] ?? 0)) } };
    keep[i] = false; merged.push(i);
  }
  return { scenes: out, keep, merged };
}
