// The world's land, for maps of the world and of continents (the user 2026-10-27: 缺什么就下什么 — the banana film's
// globe had no land and its places could not be told apart, blind review B13/B15). Natural Earth land (public domain,
// naturalearthdata.com, via github.com/nvkelso/natural-earth-vector): the 1:50m polygons are rasterised once into a
// land mask (work/recipe-board-v1/geo/land-mask.json: a cell of RES degrees is land or sea), which a chapter takes as
// data.world_land (chapter.mjs prepareAssets: a module that names world_land gets it); kit3 landGlobe dots it on a globe.
import fs from 'node:fs';
import path from 'node:path';

export const RES = 0.5;
// even-odd point in polygon (lon, lat in degrees)
function inRing(x, y, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
function polygons(geojson) { const out = []; for (const f of geojson.features || []) { const g = f.geometry; if (!g) continue; if (g.type === 'Polygon') out.push(g.coordinates); else if (g.type === 'MultiPolygon') out.push(...g.coordinates); } return out; }
export function buildLandMask(geojson, res = RES) {
  const W = Math.round(360 / res), H = Math.round(180 / res), bits = new Uint8Array(Math.ceil((W * H) / 8));
  const polys = polygons(geojson).map((rings) => { let x0 = 180, x1 = -180, y0 = 90, y1 = -90; for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { rings, box: [x0, y0, x1, y1] }; });
  for (let r = 0; r < H; r++) { const lat = 90 - (r + 0.5) * res;
    for (let c = 0; c < W; c++) { const lon = -180 + (c + 0.5) * res;
      for (const p of polys) { const [x0, y0, x1, y1] = p.box; if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
        if (inRing(lon, lat, p.rings[0]) && !p.rings.slice(1).some((h) => inRing(lon, lat, h))) { const k = r * W + c; bits[k >> 3] |= 1 << (k & 7); break; } } } }
  return { contract: 'A1WorldLandMask/v1', source: 'Natural Earth 1:50m land (public domain)', res, w: W, h: H, bits: Buffer.from(bits).toString('base64') };
}
// is (lat, lon) land on the mask (lon any range)
export function isLand(mask, lat, lon, bits = Buffer.from(mask.bits, 'base64')) {
  const W = mask.w, H = mask.h, c = Math.floor((((((lon + 180) % 360) + 360) % 360)) / mask.res), r = Math.floor((90 - lat) / mask.res);
  if (r < 0 || r >= H) return false; const k = r * W + Math.min(W - 1, c); return !!(bits[k >> 3] & (1 << (k & 7)));
}
export const maskFile = (cfg) => path.join(cfg.dataDir, 'geo', 'land-mask.json');
export function ensureLandMask(cfg, src = path.join(cfg.dataDir, 'geo', 'ne_110m_land.geojson')) {   // (the kept mask was made from 1:50m; a rebuild from what is kept uses 1:110m)
  const out = maskFile(cfg); if (fs.existsSync(out)) return out;
  fs.writeFileSync(out, JSON.stringify(buildLandMask(JSON.parse(fs.readFileSync(src, 'utf8')))) + '\n'); return out;
}
