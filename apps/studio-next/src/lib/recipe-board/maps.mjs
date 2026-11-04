// Map material: the real street map of a place, for a scene that puts events on a city (the reference's Baiyin
// opening). OpenStreetMap is open data (ODbL), a trusted source under the 2026-10-19 rule, so it is fetched
// without a user batch; the receipt names the source and the time.
//   1. the place is found with Nominatim (its centre), a box of radiusKm around it;
//   2. its roads, buildings, railways and waterways come from the Overpass API (raw.json, kept);
//   3. projected to a plane 4096 px wide (north up), grouped by how they are drawn, street names with a point;
//   4. each pin (a street, an estate, a building named in the text) gets a point: a street of that name in the
//      data, else a Nominatim search inside the box, else none (the scene must then show it as 示意).
// projects/<id>/materials/maps/<key>/ map.json + raw.json + receipt.json; a second call with the same request
// reads the cache.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectPaths } from './store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UA = 'a1-motion-studio/1.0 (recipe-board map material)';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const CLASS = { motorway: 'major', trunk: 'major', primary: 'major', secondary: 'major', tertiary: 'mid', primary_link: 'mid', secondary_link: 'mid', motorway_link: 'mid',
  residential: 'minor', unclassified: 'minor', living_street: 'minor', service: 'service', pedestrian: 'service' };
export const MAP_WIDTH = 4096;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);

export const mapDir = (cfg, id, key) => path.join(projectPaths(cfg, id).root, 'materials', 'maps', key);
export const mapRequestHash = (req) => crypto.createHash('sha256').update(JSON.stringify({ place: req.place, pins: [...(req.pins || [])].sort(), r: req.radiusKm || 5 })).digest('hex').slice(0, 12);

// through curl, like the rest of the line: it honours the system proxy (Node's fetch does not, and resets here)
export async function curlFetch(url, init = {}) {
  const args = ['-sS', '--max-time', String(init.maxTime || 120), '-A', UA, '-H', 'Accept: application/json', '-w', '\n%{http_code}'];
  if (init.method === 'POST') args.push('-X', 'POST', '-H', 'Content-Type: application/x-www-form-urlencoded', '--data-binary', '@-');
  const r = spawnSync('curl', [...args, url], { input: init.body || undefined, maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`curl: ${String(r.stderr).trim().split('\n')[0]}`);
  const out = r.stdout.toString('utf8'), cut = out.lastIndexOf('\n'), status = +out.slice(cut + 1), text = out.slice(0, cut);
  return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text) };
}
async function getJson(url, { body = null, get = curlFetch, maxTime = 120 } = {}) {
  const r = await get(url, body ? { maxTime, method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body } : { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${url.split('?')[0]}: HTTP ${r.status}`);
  return r.json();
}
export async function geocode(q, { viewbox = null, get = curlFetch } = {}) {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('format', 'json'); u.searchParams.set('limit', '5'); u.searchParams.set('q', q); u.searchParams.set('accept-language', 'zh');
  if (viewbox) { u.searchParams.set('viewbox', viewbox.join(',')); u.searchParams.set('bounded', '1'); }
  const hits = await getJson(u.href, { get }); await sleep(1100);   // Nominatim asks for one request a second
  // a town's own point, not the centroid of its administrative area (白银市 the region is centred 50 km out of town)
  const hit = hits.find((h) => h.class === 'place') || hits.find((h) => h.class !== 'boundary') || hits[0];
  return hit ? { lat: +hit.lat, lon: +hit.lon, name: hit.display_name } : null;
}

// box of radiusKm around a centre: [south, west, north, east]
export function boxAround({ lat, lon }, radiusKm = 5) {
  const dLat = radiusKm / 111.32, dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((v) => +v.toFixed(5));
}

// A region (radiusKm >= REGION_KM: two cities hundreds of km apart, the reference's B19 satellite map of Gansu and Inner
// Mongolia) takes only what reads at that scale: rivers, expressways and trunk roads, railways, and the cities and towns as
// named points. A street query over a box that size would never finish. Canals too: a story about a waterway (the Suez
// Canal, 2026-10-27) has no river to draw, and the sea is read off the elevation itself (relief.py: at or under 0 m).
export const REGION_KM = 60;
export const regionLevel = (req) => (req.radiusKm || 5) >= REGION_KM;
export const regionQuery = (bbox) => `[out:json][timeout:280];(way["waterway"="river"]["name"](${bbox});way["waterway"="canal"]["name"](${bbox});way["highway"="motorway"](${bbox});node["place"="city"](${bbox}););out geom qt;`;
// Overpass JSON -> the drawable plane (pure: tested offline)
export function projectMap(raw, bbox, { width = MAP_WIDTH } = {}) {
  const [S, W, N, E] = bbox, kx = Math.cos((((S + N) / 2) * Math.PI) / 180);
  const h = Math.round((width * (N - S)) / ((E - W) * kx));
  const xy = (p) => [Math.round(((p.lon - W) / (E - W)) * width), Math.round(((N - p.lat) / (N - S)) * h)];
  const out = { contract: 'A1MapPlane/v1', w: width, h, bbox, major: [], mid: [], minor: [], service: [], rail: [], water: [], building: [], names: {}, pins: {} };
  for (const e of raw.elements || []) {
    // a region's cities and towns are points: names to print beside, and pins to find by name
    if (e.type === 'node' && e.tags?.place && e.tags?.name) { const p = xy(e); if (p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= h) { (out.places ||= {})[e.tags.name] = { at: p, kind: e.tags.place }; out.names[e.tags.name] ||= p; } continue; }
    const g = (e.geometry || []).map(xy); if (g.length < 2) continue;
    const t = e.tags || {};
    if (t.building) out.building.push(g.flat());
    else if (t.railway) out.rail.push(g.flat());
    else if (t.waterway) out.water.push(g.flat());
    else if (CLASS[t.highway]) { out[CLASS[t.highway]].push(g.flat()); if (t.name && !out.names[t.name]) out.names[t.name] = g[Math.floor(g.length / 2)]; }
    if (t.name && !t.highway && !out.names[t.name]) { const c = g.reduce((a, p) => [a[0] + p[0] / g.length, a[1] + p[1] / g.length], [0, 0]).map(Math.round); out.names[t.name] = c; }
  }
  return out;
}
// a pin's name as the text writes it, against the names in the data: "白银区水川路" finds 水川路, "永丰街小区" 永丰街
export function nameVariants(pin, place = '') {
  const admin = (x) => x.replace(/^.{2,3}?[省市区县]/, '');   // 甘肃省白银市白银区水川路 -> 水川路, one division at a time
  const stems = [pin, admin(pin), admin(admin(pin)), admin(admin(admin(pin)))];
  if (place) stems.push(pin.replace(place, ''), pin.replace(place.replace(/[省市区县]$/, ''), ''));
  const out = [];
  for (const x of stems) out.push(x, x.replace(/(小区|家属院|大院|一带|附近)$/, ''));
  return [...new Set(out.filter((x) => x && x.length >= 2))];
}
export function pinFromNames(map, pin, place) {
  for (const v of nameVariants(pin, place)) { if (map.names[v]) return { x: map.names[v][0], y: map.names[v][1], via: `street ${v}` }; }
  for (const v of nameVariants(pin, place)) { const k = Object.keys(map.names).find((n) => n.includes(v) || (v.length >= 3 && v.includes(n) && n.length >= 2)); if (k) return { x: map.names[k][0], y: map.names[k][1], via: `name ${k}` }; }
  return null;
}

// a region's ground: real elevation as a hillshade beside its map (relief.py; AWS Open Data terrain tiles, cached),
// named in map.json as a url from the repo root so a chapter page loads it as a picture; beside it the sea (sea.png: white
// where the ground is at or under sea level), so a chapter can lay the water in its own colour
export function ensureRelief(cfg, dir, { log = () => {} } = {}) {
  const file = path.join(dir, 'map.json'), map = readJson(file), png = path.join(dir, 'relief.png'), sea = path.join(dir, 'sea.png');
  if (!map) return null;
  if (!fs.existsSync(png) || !fs.existsSync(sea) || !fs.existsSync(path.join(dir, 'height.png'))) {
    const r = spawnSync('python3', [path.join(HERE, 'relief.py'), file, png, path.join(dir, 'tiles'), sea], { encoding: 'utf8' });
    if (r.status) { log(`  relief: ${String(r.stderr).trim().split('\n').pop()}`); return null; }
    log(`  relief: ${r.stdout.trim()}`);
  }
  const url = '/' + path.relative(cfg.sourceRoot || cfg.repoRoot, png).split(path.sep).join('/');
  if (map.relief !== url) { map.relief = url; map.reliefSource = 'terrain tiles: AWS Open Data (Mapzen terrarium; SRTM and others), hillshade'; fs.writeFileSync(file, JSON.stringify(map)); }
  return url;
}

export async function fetchMap(cfg, id, req, { log = () => {}, get = curlFetch } = {}) {
  const key = req.key, dir = mapDir(cfg, id, key), file = path.join(dir, 'map.json'), h = mapRequestHash(req);
  const have = readJson(path.join(dir, 'receipt.json'));
  if (have?.requestHash === h && fs.existsSync(file)) { if (regionLevel(req)) ensureRelief(cfg, dir, { log }); return { file, cached: true, receipt: have }; }
  fs.mkdirSync(dir, { recursive: true });
  const centre = await geocode(req.place, { get });
  if (!centre) throw new Error(`map ${key}: "${req.place}" not found on OpenStreetMap`);
  const bbox = boxAround(centre, req.radiusKm || 5);
  const q = regionLevel(req) ? regionQuery(bbox) : `[out:json][timeout:90];(way["highway"](${bbox});way["building"](${bbox});way["railway"="rail"](${bbox});way["waterway"](${bbox}););out geom;`;
  let raw = null, err = null;
  for (const u of OVERPASS) { try { raw = await getJson(u, { body: `data=${encodeURIComponent(q)}`, get, maxTime: regionLevel(req) ? 300 : 120 }); break; } catch (e) { err = e; } }
  if (!raw) throw new Error(`map ${key}: Overpass failed (${err?.message})`);
  fs.writeFileSync(path.join(dir, 'raw.json'), JSON.stringify(raw));
  const map = projectMap(raw, bbox);
  const toPx = (p) => [Math.round(((p.lon - bbox[1]) / (bbox[3] - bbox[1])) * map.w), Math.round(((bbox[2] - p.lat) / (bbox[2] - bbox[0])) * map.h)];
  for (const pin of req.pins || []) {
    let at = pinFromNames(map, pin, req.place);
    if (!at) { const g = await geocode(`${pin} ${req.place}`, { viewbox: [bbox[1], bbox[2], bbox[3], bbox[0]], get }); if (g) { const [x, y] = toPx(g); at = { x, y, via: 'geocode' }; } }
    map.pins[pin] = at ? { ...at, found: true } : { found: false };
    log(`  map ${key}: ${pin} ${at ? `at ${at.x},${at.y} (${at.via})` : 'not found (show as 示意)'}`);
  }
  map.source = `© OpenStreetMap contributors (ODbL), Overpass ${raw.osm3s?.timestamp_osm_base || ''}`;
  map.centre = toPx(centre);
  fs.writeFileSync(file, JSON.stringify(map));
  const receipt = { contract: 'A1RecipeBoardSourceReceipt/v1', kind: 'map', key, request: req, requestHash: h, place: centre.name, bbox,
    url: 'https://overpass-api.de/api/interpreter', license: 'ODbL 1.0 — © OpenStreetMap contributors (trusted open source, automatic under the 2026-10-19 rule)',
    counts: Object.fromEntries(['major', 'mid', 'minor', 'service', 'rail', 'water', 'building'].map((k) => [k, map[k].length])), capturedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 1) + '\n');
  if (regionLevel(req)) ensureRelief(cfg, dir, { log });
  log(`  map ${key}: ${centre.name.split(',')[0]} ${Object.values(receipt.counts).reduce((a, b) => a + b, 0)} ways`);
  return { file, cached: false, receipt };
}
