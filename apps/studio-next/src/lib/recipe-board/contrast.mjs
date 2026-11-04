// WCAG contrast, in one place: the material titles and the frame check both call this.
export function channel(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function luminance(rgb) {
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
// a big type (hero/figure/title) needs 3:1, a small line (sub/caption) 4.5:1
export const MIN = { large: 3, body: 4.5 };
export function contrastErrors(items, min = MIN) {
  const e = [];
  for (const it of items || []) {
    const need = it.large ? min.large : min.body;
    if (!(it.ratio >= need)) e.push((it.label || 'type') + ': contrast ' + (Math.round(it.ratio * 100) / 100) + ' under ' + need + ':1' + (it.large ? ' (large)' : ' (body)'));
  }
  return e;
}
