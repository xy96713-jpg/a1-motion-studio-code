// Material candidates for shots that need real footage or photos.
// projects/<id>/materials/needs.json lists what each shot needs (what the frame shows, the line, the
// kind: news / archival / stock / presenter). For each need this module asks:
//   - YouTube through the user's yt-dlp (any video; no licence filter, every hit gets a rights label)
//   - Wikimedia Commons / Internet Archive / NASA through the main line's discovery module
//   - the main line's film scene catalog (suggestion only; clips come from the user's own copies)
//   - for a web page (need.kind 'page': a news report, an official page, a paper's page) the main line's
//     article source discovery (public index, URL candidates only); after approval the page is captured
//     and archived (page-capture.mjs) — screenshot, text, URL, capture time — and the facts step may trace
//     numbers to that archived text
// and writes materials/candidates.json. Nothing is downloaded here: downloads happen only after the
// user approves a batch (see approvals in candidates.json).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import { projectPaths, loadProject, sourcePath } from './store.mjs';
import { shownFor, eyeSelection } from './matpick.mjs';
import { PREVIEW_VENDORS } from './matindex.mjs';

export const YTDLP = process.env.A1_YTDLP_PATH || '/Users/a1/Documents/Codex/dj助手-runtime/venv312/bin/yt-dlp';

// Rights type, from who published it. A label for the user's decision, not a clearance.
const NEWS = /\b(AP|Associated Press|Reuters|Bloomberg|CNBC|CNN|BBC|NBC|ABC|CBS|Fox|Guardian|Al Jazeera|DW|France 24|Sky News|WSJ|Wall Street Journal|New York Times|Financial Times|Yahoo Finance|Forbes|TechCrunch|The Verge|CGTN|新华|央视)\b/i;
const ARCHIVE = /\b(British Path[eé]|British Movietone|BFI|AP Archive|Reuters Archive|Periscope Film|National Archives|Library of Congress|Internet Archive)\b/i;
const PUBLIC = /\b(NASA|ESA|NOAA|US Army|U\.S\. Department|White House)\b/i;
const STOCK = /\b(stock footage|free footage|no copyright|copyright free|royalty free|creative commons|pexels|pixabay|videvo|mixkit)\b/i;
const LABELS = {
  official: '官方发布', news: '媒体报道', archive: '历史档案（商业档案馆）', public: '公有领域/政府发布', stock: '免费素材站（需核授权）',
  cc: 'CC 授权', film: '电影（用你自己的片源）', unknown: '来源不明',
};

export function rightsOf({ channel = '', title = '', license = '', official = [] }) {
  const who = `${channel} ${title}`;
  if (/creative commons|cc by/i.test(license)) return 'cc';
  if (official.some((o) => channel.toLowerCase().includes(o.toLowerCase()))) return 'official';
  if (PUBLIC.test(channel)) return 'public';
  if (ARCHIVE.test(channel)) return 'archive';
  if (NEWS.test(channel)) return 'news';
  if (STOCK.test(who)) return 'stock';
  return 'unknown';
}

export const chineseQueries = (need) => { const o = String(need.original || '').replace(/[《》“”"]/g, ''); if (!/[\u3400-\u9fff]/.test(o)) return []; const q = o.replace(/(的)?(新闻)?(片段|画面|报道|视频|镜头|照片)+[。.]?$/, '').slice(0, 30); return q ? [q] : []; };
function ytSearch(query, limit = 6) {
  const r = spawnSync(YTDLP, ['--quiet', '--no-warnings', '--flat-playlist', '--playlist-end', String(limit), '--dump-json', `ytsearch${limit}:${query}`], { encoding: 'utf8', timeout: 60000, maxBuffer: 20 << 20 });
  if (r.status !== 0) return { error: String(r.stderr || r.stdout).slice(-300), rows: [] };
  return { rows: r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)) };
}

// Prefer clips short enough to hold one usable scene; long videos still qualify (we cut seconds).
const lengthScore = (d) => (!d ? 0 : d <= 90 ? 0.3 : d <= 600 ? 0.15 : d <= 1800 ? 0 : -0.2);
const RIGHTS_ORDER = { official: 0.25, public: 0.25, cc: 0.25, archive: 0.2, news: 0.15, stock: 0.1, unknown: 0, film: 0 };
const overlap = (q, text) => {
  const words = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  const t = text.toLowerCase();
  return words.length ? words.filter((w) => t.includes(w)).length / words.length : 0;
};

const STOCK_RE = /stock|footage|b-?roll|\b4k\b|royalty|free to use|no copyright/i;
export function youtubeCandidates(need) {
  const seen = new Map();
  const errors = [];
  // generic b-roll: ask for stock footage, and keep only what reads like it (not a sitcom that says "office")
  const stock = need.kind === 'stock';
  const queries = stock ? (need.youtube || []).flatMap((q) => [`${q} stock footage`, q]) : need.youtube || [];
  for (const query of queries) {
    const { rows, error } = ytSearch(query);
    if (error) errors.push(`${query}: ${error}`);
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      if (stock && !STOCK_RE.test(`${row.title} ${row.channel}`)) continue;
      const rights = rightsOf({ channel: row.channel || '', title: row.title || '', official: need.official || [] });
      const relevance = overlap(query, `${row.title} ${row.channel}`);
      seen.set(row.id, {
        id: `yt:${row.id}`, source: 'youtube', query, title: row.title, publisher: row.channel, duration: row.duration,
        url: `https://www.youtube.com/watch?v=${row.id}`, thumb: (row.thumbnails || []).at(-1)?.url || null,
        rights, rightsLabel: LABELS[rights], score: +(relevance + lengthScore(row.duration) + RIGHTS_ORDER[rights]).toFixed(3),
      });
    }
  }
  const list = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 6);
  const top = Math.max(1e-9, ...list.map((c) => c.score));
  list.forEach((c) => (c.score = +(c.score / top).toFixed(3)));
  return { list, errors };
}

// Shared entity library (work/recipe-board-v1/entities.json): verified material for people,
// companies, products, places and events, reused by every project before searching anywhere.
function loadLibrary(cfg) {
  const file = path.join(cfg.dataDir, 'entities.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).entities : [];
}
// Match on what the shot must show: the named entity if there is one, else the on-screen description
// (never the narration line, which mentions many things). Generic B-roll never uses the library;
// a person need only matches people.
function libraryMatches(cfg, need) {
  if (need.kind === 'stock' || need.kind === 'presenter') return [];
  const names = [need.entity, ...(need.archive?.entities || [])].filter(Boolean);
  const text = (names.length ? names.join(' ') : need.original || '').toLowerCase();
  const person = need.kind === 'archival' || need.look?.cutout;
  return loadLibrary(cfg).filter((e) => (!person || e.kind === 'person') && e.names.some((n) => text.includes(n.toLowerCase())));
}
function libraryCandidates(cfg, need) {
  return libraryMatches(cfg, need).flatMap((e) => e.files.map((f, i) => {
    const abs = path.isAbsolute(f.path) ? f.path : path.join(cfg.sourceRoot, f.path);
    return fs.existsSync(abs) ? { id: `lib:${e.id}:${i}`, source: 'library', title: `${e.names[0]}（已核实素材）`, publisher: /^https?:/.test(f.url) ? new URL(f.url).hostname : f.url,
      url: f.url, file: abs, asset: abs, role: f.role || null, thumb: null, rights: e.rights === 'cc' ? 'cc' : 'official', rightsLabel: '已核实（素材库）', score: 1 } : null;
  })).filter(Boolean);
}
// Ambiguous names (H800 is also a British Army photo, High Flyer a dahlia): routing/known-names.json gives
// them `context` words; a search hit must carry one of them, and the search asks with them.
export function nameContext(cfg, need) {
  const lex = readJson(path.join(cfg.dataDir, 'routing', 'known-names.json'), { names: [] }).names || [];
  const text = [need.entity, ...(need.archive?.entities || [])].filter(Boolean).join(' ').toLowerCase();
  return [...new Set(lex.filter((e) => e.context && e.names.some((n) => text.includes(n.toLowerCase()))).flatMap((e) => e.context))];
}
export function contextFilter(cfg, need, list) {
  const words = nameContext(cfg, need);
  if (!words.length) return list;
  return list.filter((c) => c.source === 'library' || words.some((w) => `${c.title} ${c.publisher}`.toLowerCase().includes(w.toLowerCase())));
}
// A person's photo must name the person: drop search hits whose title does not contain the name.
function personFilter(cfg, need, list) {
  if (need.kind !== 'archival' && !need.look?.cutout) return list;
  const names = [...libraryMatches(cfg, need).flatMap((e) => e.names), ...(need.archive?.entities || [])]
    .flatMap((n) => (/[a-z]/i.test(n) ? n.split(/\s+/).filter((w) => w.length >= 4 && /^[A-Z]/.test(w)) : [n]));
  return names.length ? list.filter((c) => names.some((n) => `${c.title} ${c.publisher}`.toLowerCase().includes(n.toLowerCase()))) : list;
}

async function mainLine(cfg, file) {
  return import(pathToFileURL(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib', file)).href);
}

async function archiveCandidates(cfg, need) {
  if (!need.archive) return { list: [], errors: [] };
  const m = await mainLine(cfg, 'a1-external-media-discovery-v1.mjs');
  const request = m.compileExternalMaterialRequest({
    id: need.shotId, viewerTask: need.line, narrativeRole: 'HISTORICAL_CONTEXT', shotFunction: 'ESTABLISH',
    domains: need.domains || [], ...need.archive,
    preferredMedia: need.form === 'photo' ? ['IMAGE'] : need.form === 'video' ? ['VIDEO'] : (need.archive.preferredMedia || need.preferredMedia || ['VIDEO', 'IMAGE']),
    keywords: [...(need.archive.keywords || []), ...nameContext(cfg, need).slice(0, 1)],
  });
  try {
    const found = await m.discoverExternalMediaMetadata(request, { limit: 5, maxQueryVariants: 2 });
    const list = found.providers.flatMap((p) => p.candidates.map((c) => ({
      id: `${p.provider.toLowerCase()}:${c.sourceId}`, source: p.provider.toLowerCase(), title: c.title, publisher: c.publisher || c.creator || p.provider,
      mediaType: c.mediaType, duration: c.durationMs ? c.durationMs / 1000 : null, url: c.sourcePageUrl, asset: c.assetUrl || null, thumb: c.previewUrl || c.thumbnailUrl || null,
      rights: p.provider === 'NASA_IMAGES' ? 'public' : /cc|public domain|pd/i.test(c.license?.name || '') ? 'cc' : 'unknown',
      rightsLabel: null, licence: c.license?.name || null, score: +(c.relevance?.score ?? 0).toFixed(3),
    })));
    list.forEach((c) => (c.rightsLabel = LABELS[c.rights] + (c.licence ? `（${c.licence}）` : '')));
    // The discovery module scores on its own scale; normalise to 0-1 so lists can be merged.
    const top = Math.max(1e-9, ...list.map((c) => c.score));
    list.forEach((c) => (c.score = +(c.score / top).toFixed(3)));
    return { list: list.sort((a, b) => b.score - a.score).slice(0, 4), errors: found.failures || [] };
  } catch (e) {
    return { list: [], errors: [String(e.message || e)] };
  }
}

// Logos and product photos live on official sites and product galleries, not in the public archives
// (an archive search for "H800" or "幻方 logo" finds nothing true). For a logo: the Commons file named
// "<name> logo" and the official site's own large icon / share image; for a product photo: the gallery
// pages registered for it in routing/known-names.json (`gallery`). URL candidates only, like the rest.
const fetchText = (url) => {
  const r = spawnSync('curl', ['-sSL', '--max-time', '20', '-A', 'Mozilla/5.0 (A1RecipeBoard research)', url], { maxBuffer: 16 << 20 });
  if (r.status !== 0) return '';
  const buf = r.stdout;
  const head = buf.slice(0, 2048).toString('latin1');
  return /charset=["']?gb/i.test(head) ? new TextDecoder('gbk').decode(buf) : buf.toString('utf8');
};
const knownEntries = (cfg, need) => {
  const lex = readJson(path.join(cfg.dataDir, 'routing', 'known-names.json'), { names: [] }).names || [];
  const text = `${need.entity || ''} ${(need.archive?.entities || []).join(' ')}`;
  return lex.filter((e) => e.names.some((n) => text.includes(n)));
};
export function commonsLogoCandidates(names, get = fetchText) {
  const out = [];
  // Commons answers a burst with a plain-text "too many requests": no candidates this time, never a crash of the run
  const json = (u) => { try { return JSON.parse(get(u) || '{}'); } catch { return {}; } };
  for (const n of names.filter((x) => /^[\x20-\x7e]+$/.test(x)).slice(0, 2)) {
    const q = encodeURIComponent(`${n} logo`);
    const found = json(`https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=4&format=json&srsearch=${q}`);
    for (const hit of found?.query?.search || []) {
      const title = hit.title;
      // the mark itself: not an ASCII / pixel / fan / unofficial variant, not a photo of a sign
      if (!title.toLowerCase().includes(n.toLowerCase()) || !/logo/i.test(title) || /ascii|pixel|8-?bit|fan|unofficial|parody|concept|sign|building|\.jpe?g$/i.test(title) || out.some((c) => c.title === title)) continue;
      const info = json(`https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1280&format=json&titles=${encodeURIComponent(title)}`);
      const ii = Object.values(info?.query?.pages || {})[0]?.imageinfo?.[0];
      if (!ii) continue;
      const licence = ii.extmetadata?.LicenseShortName?.value || null;
      out.push({ id: `logo:commons:${title}`, source: 'wikimedia_commons', title, publisher: 'Wikimedia Commons', mediaType: 'IMAGE', duration: null, url: ii.descriptionurl,
        asset: ii.thumburl || ii.url, thumb: ii.thumburl || ii.url, rights: /public domain|pd/i.test(licence || '') ? 'public' : 'cc', rightsLabel: `标识（${licence || 'Commons'}）`, licence, score: /\.svg$/i.test(title) ? 1 : 0.6, official: true });
    }
  }
  return out;
}
export function siteIconCandidates(domains, get = fetchText) {
  const out = [];
  for (const d of domains.filter((x) => !x.includes('/')).slice(0, 2)) {
    const home = `https://www.${d.replace(/^www\./, '')}/`;
    const html = get(home);
    if (!html) continue;
    const abs = (u) => { try { return new URL(u.replace(/&amp;/g, '&'), home).href; } catch { return null; } };
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1];
    const icons = [...html.matchAll(/<link[^>]+rel=["'](?:apple-touch-icon|icon)["'][^>]*>/gi)].map((m) => ({ href: m[0].match(/href=["']([^"']+)/i)?.[1], size: +(m[0].match(/sizes=["'](\d+)/i)?.[1] || 0) }))
      .filter((x) => x.href && /\.(png|jpe?g|webp)/i.test(x.href)).sort((a, b) => b.size - a.size);
    // the share image is often a banner, not the mark: only the icon is called a logo
    for (const [href, label] of [[og, '官网分享图'], [icons[0]?.href, `官网图标 ${icons[0]?.size || ''}px（标识）`]]) {
      const u = href && abs(href);
      if (!u || out.some((c) => c.asset === u)) continue;
      out.push({ id: `logo:site:${u}`, source: 'official', title: `${d} ${label}`, publisher: d, mediaType: 'IMAGE', duration: null, url: home, asset: u, thumb: u, rights: 'official', rightsLabel: '官方网站', score: 1, official: true });
    }
  }
  return out;
}
export function galleryCandidates(pages, get = fetchText) {
  const out = [];
  for (const page of pages) {
    const html = get(page);
    if (!html) continue;
    const title = (html.match(/<title>([^<]*)/i)?.[1] || page).trim();
    // ZOL product galleries: thumbnails under product/<n>_<size>/<dir>/<name>; the full picture drops the size
    // only pictures linked to this product (its id in the link): the sidebar shows other products
    const pid = page.match(/\/(\d+)\/pic\.s?html/)?.[1];
    const seen = new Set();
    for (const m of html.matchAll(/<a[^>]+href="([^"]*)"[^>]*>\s*<img[^>]+src="(?:https?:)?\/\/(\w+)\.zol-img\.com\.cn\/product\/(\d+)_\d+x\d+\/(\d+)\/([A-Za-z0-9]+\.(?:jpg|png))"/g)) {
      const full = `https://${m[2]}.zol-img.com.cn/product/${m[3]}/${m[4]}/${m[5]}`;
      if (seen.has(m[5]) || (pid && !m[1].includes(`p${pid}`) && !m[1].includes(`/${pid}`))) continue;
      seen.add(m[5]);
      out.push({ id: `gallery:${m[5]}`, source: 'gallery', title: `${title.slice(0, 40)} · 图 ${seen.size}`, publisher: new URL(page).hostname, mediaType: 'IMAGE', duration: null, url: page, asset: full, thumb: full,
        rights: 'news', rightsLabel: '产品图库（来源页面注明部分图片来自网络）', score: 0.8, official: false });
    }
  }
  return out.slice(0, 6);
}
async function officialImageCandidates(cfg, need) {
  const known = knownEntries(cfg, need);
  if (need.form === 'logo') {
    const names = [...new Set([need.entity, ...known.flatMap((e) => e.names)].filter(Boolean))];
    return [...siteIconCandidates([...new Set(known.flatMap((e) => e.domains || []))]), ...commonsLogoCandidates(names)];
  }
  if (need.form === 'photo') return galleryCandidates([...new Set(known.filter((e) => e.kind === 'product').flatMap((e) => e.gallery || []))]);
  return [];
}

// News photos: a person or an event is photographed at every story about it, so the pages that report on
// it carry pictures the archives do not (the reference's 19 person cuts are 19 different photos). The
// lead picture of each page (og:image / twitter:image) becomes a photo candidate, credited to the outlet.
// Rights: news (a photo the user confirms; never approved automatically).
export function leadImageOf(html, pageUrl) {
  const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  if (!m) return null;
  try { return new URL(m[1].replace(/&amp;/g, '&'), pageUrl).href; } catch { return null; }
}
// (a site's own furniture too: its component library, the flag of a government banner, badges — B46 took nist.gov's
// "official website" U.S. flag for the Golden State Killer's composite, 2026-10-24)
const NOT_A_PHOTO = /(?<![a-z])(logo|icon)|favicon|placeholder|default[-_]?(share|og)|sprite|avatar-default|\.svg(\?|$)|component[-_]?library|\/libraries\/|us[-_]?flag|flag[-_]?(small|icon)?\.(png|gif)|\bbadge|\/themes?\/[^?]*\/(img|images)\//i;
// the pictures inside a report, each with the words around it (its alt, or the caption line after it): a page's
// cover is often not the picture the line needs (paperclip-138-full B21: the China News report on the Baiyin wanted
// portraits leads with a video still; the portraits sit in the text, captioned 嫌疑人画像)
export function articleImagesOf(html, pageUrl) {
  const out = [], re = /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>(?=([\s\S]{0,400}))/gi;
  for (let m; (m = re.exec(html));) {
    const tag = m[0].slice(0, m[0].indexOf('>') + 1), alt = (tag.match(/\balt=["']([^"']*)["']/i) || [])[1] || '';
    const after = m[2].split(/<img\b/i)[0].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ').trim().slice(0, 80);
    let src; try { src = new URL(m[1].replace(/&amp;/g, '&'), pageUrl).href; } catch { continue; }
    if (NOT_A_PHOTO.test(src) || !/\.(jpe?g|png|webp)(\?|$)/i.test(src)) continue;
    out.push({ src, caption: `${alt} ${after}`.trim() });
  }
  return out;
}
// how much of what the need asks for a caption says (shared character pairs, the line's own words)
export function captionScore(caption, want) {
  const bg = (t) => { const x = String(t || '').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, ''); return new Set(Array.from({ length: Math.max(0, x.length - 1) }, (_, i) => x.slice(i, i + 2))); };
  const a = bg(caption), b = bg(want); if (!a.size || !b.size) return 0;
  let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.min(a.size, 12);
}
export async function newsPhotoCandidates(cfg, need, id, get = fetchText) {
  if (need.form !== 'photo' || !(need.entity || need.archive?.entities?.length)) return [];
  const entity = need.entity || need.archive.entities[0];
  const page = { title: need.original, entities: [entity], keywords: need.archive?.keywords || [], queryEn: need.queryEn || null };
  const r = await pageCandidates(cfg, { ...need, kind: 'page', page }, { id });
  const out = [];
  for (const c of r.list.slice(0, 6)) {
    const html = get(c.url).slice(0, 600_000), img = leadImageOf(html, c.url);
    const push = (asset, caption, score) => { if (!asset || NOT_A_PHOTO.test(asset) || out.some((x) => x.asset === asset)) return;
      out.push({ id: `newsphoto:${crypto.createHash('sha1').update(asset).digest('hex').slice(0, 16)}`, source: 'news-photo', title: caption ? `${c.title}：${caption.slice(0, 30)}` : c.title, publisher: hostOf(c.url).split('/')[0],
        url: c.url, asset, thumb: asset, mediaType: 'IMAGE', duration: null, rights: pageRights(c.url), rightsLabel: LABELS[pageRights(c.url)], score, lang: c.lang, ...(caption ? { caption } : {}) }); };
    // the captioned pictures that say what the need asks for come first, then the page's cover
    for (const p of articleImagesOf(html, c.url).map((p) => ({ ...p, k: captionScore(p.caption, need.original) })).filter((p) => p.k >= 0.25).sort((x, y) => y.k - x.k).slice(0, 2)) push(p.src, p.caption, Math.min(1, (c.score ?? 0.5) + p.k));
    push(img, '', c.score ?? 0.5);
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 6);
}

async function filmSuggestions(cfg, need) {
  if (!need.film) return [];
  const matcher = await mainLine(cfg, 'a1-film-reference-matcher-v1.mjs');
  const { FILM_REFERENCE_SCENE_CATALOG_V1 } = await mainLine(cfg, 'a1-film-reference-scene-catalog-v1.mjs');
  const brief = matcher.compileFilmReferenceBrief({ beatId: need.shotId, viewerTask: need.line, ...need.film });
  if (brief.status !== 'READY_FOR_MATCHING') return [];
  const ranking = matcher.rankFilmReferenceCandidates(brief, FILM_REFERENCE_SCENE_CATALOG_V1);
  // Catalog matches below ~40 are generic mood matches, not useful suggestions.
  return (ranking.candidates || ranking.ranked || []).filter((c) => (c.score ?? c.matchScore ?? 0) >= 40).slice(0, 3).map((c) => ({
    id: `film:${c.filmId || c.id}:${c.sceneId || ''}`, source: 'film', title: `${c.title || c.filmTitle}（${c.year || ''}）· ${c.sceneDescription || c.description || c.approximateMoment || ''}`,
    moment: c.approximateMoment || null, rights: 'film', rightsLabel: LABELS.film, score: +(c.score ?? c.matchScore ?? 0).toFixed(3),
  }));
}

// What the original shows at this need (middle of its range), for side-by-side choosing.
function refFrame(cfg, id, need) {
  const p = projectPaths(cfg, id);
  const out = path.join(p.refs, `${need.shotId}.jpg`);
  const source = sourcePath(cfg, loadProject(cfg, id).sourceVideo || '');
  if (!need.range || fs.existsSync(out) || !source || !fs.existsSync(source)) return;
  fs.mkdirSync(p.refs, { recursive: true });
  const at = (need.range[0] + need.range[1]) / 2;
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(at), '-i', source, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', out]);
}

const materialsDir = (cfg, id) => path.join(projectPaths(cfg, id).root, 'materials');
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

export function readMaterials(cfg, id) {
  const dir = materialsDir(cfg, id);
  const { needs = [] } = readJson(path.join(dir, 'needs.json'), {});
  const { shots = {} } = readJson(path.join(dir, 'candidates.json'), {});
  const approvals = readJson(path.join(dir, 'approvals.json'), { batches: [] });
  // suggestions for the page (nothing here is a confirmation): the system's picks, and a reviewer's
  // corrections and skips (materials/review-picks.json)
  const proposed = readJson(path.join(dir, 'proposed-batch.json'), { picks: [] }).picks || [];
  const review = readJson(path.join(dir, 'review-picks.json'), { picks: {}, skip: {} });
  return { needs, shots, approvals, proposed, review };
}

// One approval batch: the user's pick per shot. Recorded as given; fetching is a separate step.
export async function saveApprovalBatch(cfg, id, picks, { confirmedBy = 'selection via /recipe-board/materials' } = {}) {
  const { materialsLock } = await import('./shotplan.mjs');
  const release = await materialsLock(cfg, id);
  try { return recordApprovalBatch(cfg, id, picks, confirmedBy, 'UNKNOWN'); }
  finally { release(); }
}
// Private primitive: the shotplan material loop calls autoApproveTrusted while holding the lock.
// Other writers, including autoApproveTrusted's run.mjs caller, are not yet all locked.
// A caller-supplied attribution string never grants access to this unlocked operation.
function recordApprovalBatch(cfg, id, picks, confirmedBy, selectionStatus) {
  const { shots } = readMaterials(cfg, id);
  const items = picks.map((p) => {
    // A pick may reuse a candidate listed under another shot (same footage, different seconds).
    const c = shots[p.shotId]?.candidates?.find((x) => x.id === p.candidateId)
      || Object.values(shots).flatMap((x) => x.candidates || []).find((x) => x.id === p.candidateId);
    if (!c) throw new Error(`unknown candidate ${p.candidateId} for ${p.shotId}`);
    const need = shots[p.shotId]?.need;
    return { shotId: p.shotId, candidateId: c.id, ...(need ? { needPrint: needPrint(need) } : {}), url: c.url, asset: c.asset || null, file: c.file || null, role: c.role || null, source: c.source, duration: c.duration ?? null, title: c.title, publisher: c.publisher, rights: c.rights, rightsLabel: c.rightsLabel,
      segment: p.segment || autoSegment(c, need) || null, materialFit: p.materialFit || null, note: p.note || null, status: 'approved' };
  });
  const file = path.join(materialsDir(cfg, id), 'approvals.json');
  const all = readJson(file, { contract: 'A1RecipeBoardMaterialApprovals/v1', batches: [] });
  const batch = { id: `batch-${all.batches.length + 1}`, approvedAt: new Date().toISOString(), confirmedBy, selection: { status: selectionStatus }, items };
  all.batches.push(batch);
  fs.writeFileSync(file, JSON.stringify(all, null, 1) + '\n');
  return batch;
}

// Approved without the user (AGENTS.md "User gates"): picks from trusted sources — official sites, public domain,
// Creative Commons, the user's own NAS library (user decision 2026-10-19) — and, since 2026-10-21, any pick the
// line has checked: not weak, and its title or publisher names the need's people or places (the user: 之后确认好就
// 都自动放行, 尽量不问). A pick for a need that names no one (generic stock) or a weak match still waits; the beat
// keeps its stand-in meanwhile.
export const TRUSTED_RIGHTS = ['official', 'public', 'cc'];
// a picture on a government's own site is the government's release, not a news photo (2026-10-24: the Golden State
// Killer's composite on nist.gov was ranked as news and never proposed): official, so it is trusted as such
export const pageRights = (u) => (/(^|\.)(gov|mil)(\.[a-z]{2})?$|\.gov\.cn$/i.test(String(u || '').replace(/^https?:\/\//, '').split('/')[0]) ? 'official' : 'news');
export const isTrusted = (c) => !!c && (c.source === 'library' || TRUSTED_RIGHTS.includes(c.rights));
// Callers without the lock acquire it here; an enclosing material loop passes
// its validated owner to avoid reacquiring the same non-reentrant lock.
export async function autoApproveTrustedWithLock(cfg, id, options = {}) {
  const { materialsLock, ownsMaterialsLock } = await import('./shotplan.mjs');
  if (options.lockOwner && !ownsMaterialsLock(options.lockOwner, cfg, id)) throw new Error('invalid materials lock owner');
  const release = options.lockOwner ? null : await materialsLock(cfg, id, options.log);
  try { return autoApproveTrusted(cfg, id, options); }
  finally { release?.(); }
}
export function autoApproveTrusted(cfg, id, { log = () => {} } = {}) {
  const { needs, shots, approvals, proposed, review } = readMaterials(cfg, id);
  const stale = new Set(changedNeeds(cfg, id));
  // a pick whose fetch failed for good (a bot check, a dead page) no longer decides its shot: the next pick may go
  // a pick taken back (superseded, rejected, orphaned) no longer decides its shot either (= run.mjs materialState)
  const decided = new Set([...approvals.batches.flatMap((b) => b.items.filter((i) => !deadFetch(i) && !['superseded', 'rejected', 'orphaned'].includes(i.status)).map((i) => i.shotId)), ...Object.keys(review.skip || {})]);
  // (a pick whose candidate is gone, its need searched again since, is left out: one stale pick threw and took the
  // whole batch with it, and the report and CRN pages of h800 were picked by eye three runs over and never fetched)
  const known = (p) => Object.values(shots).some((x) => (x.candidates || []).some((c) => c.id === p.candidateId));
  // a page that is no report's source (a blog, an encyclopedia: routing/news-outlets.json notSources) is never passed on
  // its own: it waits for the user (2026-10-24: B47's Wikipedia entry for GEDmatch was approved because it named the need)
  const notSources = (readJson(path.join(cfg.dataDir, 'routing', 'news-outlets.json'), {}).notSources?.patterns || []).map((x) => new RegExp(x, 'i'));
  const notSource = (p) => notSources.some((re) => re.test(String(p.url || '').replace(/^https?:\/\//, '')));
  const currentForm = (p) => {
    const matching = needs.filter(n => needKey(n) === p.shotId);
    if (!matching.length) return !fs.existsSync(path.join(materialsDir(cfg, id), 'needs.json')) && !['photo', 'video'].includes(shots[p.shotId]?.need?.form); // legacy without a need ledger
    if (matching.length !== 1) return false;
    const n = matching[0];
    if (!['photo', 'video'].includes(n.form)) return true;
    const snapshot = shots[p.shotId]?.need;
    const candidate = (shots[p.shotId]?.candidates || []).find(c => c.id === p.candidateId);
    return !!snapshot && needPrint(snapshot) === needPrint(n) && !!candidate && candidateMedia(candidate) === n.form;
  };
  const picks = proposed.filter((p) => !stale.has(p.shotId) && currentForm(p) && !decided.has(p.shotId) && !p.weak && !notSource(p) && !deadUrls(approvals, p.shotId).has((shots[p.shotId]?.candidates || []).find((c) => c.id === p.candidateId)?.asset || p.url) && known(p)).filter((p) => p.named || p.eye || isTrusted((shots[p.shotId]?.candidates || []).find((c) => c.id === p.candidateId)));
  if (!picks.length) return null;
  const batch = recordApprovalBatch(cfg, id, picks.map((p) => ({ shotId: p.shotId, candidateId: p.candidateId, segment: p.segment || null, materialFit: p.materialFit || null })), 'auto: trusted source (user decision 2026-10-19) or a checked pick that names the need (user decision 2026-10-21); news pages too, user decision 2026-10-23: 报道什么的不要总问我 确认合适的就找好做包装', 'SYSTEM_SELECTED');
  log(`approved automatically (trusted sources and checked picks): ${picks.map((p) => p.shotId).join(',')}`);
  return batch;
}

// A shot can need one picture per cut (a montage): candidates, approvals and bindings are keyed by
// shot id for the first cut and `B05~2` for cut 2, so one shot can hold several confirmed materials.
export const needKey = (n) => (n.scene ? `${n.shotId}~${n.scene}` : n.shotId);
// One subject, one confirmed picture (2026-10-23: B52 lines up the two killers B31 and B50 already show): a need for a
// named person's or thing's photo whose subject another need already has a fetched picture of uses that picture — no
// second search, no second pick to confirm. Returns { key, binding } of the need that has it, or null.
const subjectOf = (n) => (n?.entity && ['photo', 'logo'].includes(n.form) ? `${String(n.entity).trim().toLowerCase()}|${n.form}` : null);
const searchTerms = (n) => JSON.stringify([n.query ?? null, n.queryEn ?? null, n.youtube ?? null, n.archive ?? null, n.clip ?? null, n.page ?? null]);
export function sameSubject(need, needs, bound, evidence = null) {
  const s = subjectOf(need);
  // Only form-less legacy requests can inherit an independently verifiable old selection.
  // This proves identity of the selected file, not that today's query was run.
  if (!need.form && need.entity && evidence) {
    const name = String(need.entity).trim().toLowerCase();
    for (const o of needs) {
      const k = needKey(o), b = bound[k], row = evidence.shots?.[k];
      if (needKey(need) === k || o.form || !o.entity || String(o.entity).trim().toLowerCase() !== name || needs.filter(n => needKey(n) === k).length !== 1 || needs.filter(n => needKey(n) === needKey(need)).length !== 1) continue;
      if (!row?.need || needPrint(row.need) !== needPrint(o) || !b?.batch || !b.url || b.kind !== 'image' || !b.file || !fs.existsSync(b.file) || actualMedia(b.file) !== 'image') continue;
      const batches = (evidence.approvals?.batches || []).filter(batch => batch.id === b.batch);
      if (batches.length !== 1) continue;
      const items = (batches[0].items || []).filter(i => i.shotId === k && i.status === 'fetched' && i.url === b.url && i.candidateId);
      if (items.length !== 1 || (row.candidates || []).filter(c => c.id === items[0].candidateId && c.url === b.url).length !== 1) continue;
      return { key: k, binding: b, provenance: 'unknown' };
    }
    return null;
  }
  if (!s) return null;
  for (const o of needs) {
    if (o === need || needKey(o) === needKey(need) || subjectOf(o) !== s || searchTerms(o) !== searchTerms(need)) continue;
    const b = bound[needKey(o)];
    // An unpinned or ambiguous historical binding is not evidence for a new request.
    let pinned = false;
    try { pinned = JSON.parse(b?.needPrint).length === 6 && matchesNeedPrint(b.needPrint, o); } catch {}
    if (needs.filter(n => needKey(n) === needKey(o)).length !== 1) pinned = false;
    if (pinned && b?.file && fs.existsSync(b.file) && b.kind !== 'video' && (need.form !== 'photo' || actualMedia(b.file) === 'image')) return { key: needKey(o), binding: b };
  }
  return null;
}

// A fetch that failed on the network is tried again on the next runs (3 attempts in all); after that, or
// for any other failure, it goes back to the user to pick something else.
// a fetch that failed and will not be tried again; its shot gets the next candidate (repickFailed)
export const deadFetch = (i) => i.status === 'failed' && !retryable(i);
// a pick taken back as wrong (rejectPick: open-S12, a clip that carried too little) is as dead as one that failed: the
// eye's order would otherwise propose it again first
// a picture taken from a page is its own pick: rejecting it leaves the page's other pictures in play (B46: rejecting
// nist.gov's banner flag by the page's address threw out the composite on the same page, 2026-10-24)
const deadUrls = (approvals, key) => new Set(approvals.batches.flatMap((b) => b.items).filter((i) => i.shotId === key && (deadFetch(i) || i.status === 'rejected')).map((i) => i.asset || i.url));
// Shots whose approved pick could not be fetched (and nothing else of theirs was) are picked again from their other
// candidates, the dead one left out, so the line moves on without the user (2026-10-21: B51's news page served a
// bot check). Returns the keys picked again.
export function repickFailed(cfg, id, { log = () => {} } = {}) {
  const { approvals } = readMaterials(cfg, id);
  const items = approvals.batches.flatMap((b) => b.items);
  // a pick taken back as wrong (rejectPick, or recheckPicks under rules made since) is as gone as one whose fetch failed:
  // the shot is picked again from its other candidates (2026-10-24: B46 and B47 waited on hand-cleared candidates)
  const gone = (i) => deadFetch(i) || ['rejected', 'superseded', 'orphaned'].includes(i.status);
  const keys = [...new Set(items.filter((i) => deadFetch(i) || i.status === 'rejected').map((i) => i.shotId))].filter((k) => !items.some((i) => i.shotId === k && !gone(i)));
  if (!keys.length) return [];
  const r = proposeBatch(cfg, id, { only: keys });
  log(`picked again after a failed fetch or a pick taken back: ${keys.join(',')}${r.skipped.some((k) => keys.includes(k)) ? ` (nothing else usable for ${r.skipped.filter((k) => keys.includes(k)).join(',')})` : ''}`);
  return keys;
}
export const retryable = (i) => i.status === 'failed' && (i.attempts || 1) < 3 && /net::ERR_|Timeout|ETIMEDOUT|ECONNRESET/.test(i.error || '');

// A need's fingerprint: what it asks for. When a rewrite changes it, what was found, confirmed and bound
// for the old need no longer answers it: candidates are searched again, the approval is marked superseded
// (kept, never deleted) and the binding moves to bindings.superseded (the library files stay).
export const needPrint = (n) => JSON.stringify([n.kind, n.form || null, n.original, n.entity || null, n.scene || 0, searchTerms(n)]);
export const matchesNeedPrint = (print, n) => {
  try { const old = JSON.parse(print), current = JSON.parse(needPrint(n)); return Array.isArray(old) && JSON.stringify(old) === JSON.stringify(current.slice(0, old.length)) && (old.length === 5 || old.length === 6); }
  catch { return false; }
};
export function changedNeeds(cfg, id) {
  const dir = materialsDir(cfg, id);
  if (!fs.existsSync(path.join(dir, 'needs.json'))) return [];
  const needs = readJson(path.join(dir, 'needs.json'), { needs: [] }).needs || [];
  const cand = readJson(path.join(dir, 'candidates.json'), { shots: {} }).shots || {};
  const items = (readJson(path.join(dir, 'approvals.json'), { batches: [] }).batches || []).flatMap((b) => b.items || []);
  const bound = readJson(path.join(dir, 'bindings.json'), { shots: {} }).shots || {};
  const active = new Set(needs.map(needKey));
  // Only a well-formed, key-associated old request is evidence of deletion. Orphan
  // ledger entries alone are legacy unknown, not proof that a need was removed.
  const validPrint = p => { try { const v = JSON.parse(p); return Array.isArray(v) && (v.length === 5 || v.length === 6) && typeof v[0] === 'string' && typeof v[2] === 'string'; } catch { return false; } };
  const evidence = new Set();
  // A candidate's embedded request can come from an unrelated historical search;
  // it does not establish membership in the previously authoritative needs ledger.
  for (const [k, row] of Object.entries(bound)) if (validPrint(row?.needPrint)) evidence.add(k);
  for (const item of items) if (item.shotId && !['superseded', 'rejected', 'orphaned'].includes(item.status) && validPrint(item.needPrint)) evidence.add(item.shotId);
  const removed = new Set([...evidence].filter(k => !active.has(k)));
  return [...new Set([...removed, ...needs.filter((n) => {
    const k = needKey(n), print = needPrint(n);
    if (cand[k]?.need && needPrint(cand[k].need) !== print) return true;
    if (items.some((i) => i.shotId === k && i.needPrint && !matchesNeedPrint(i.needPrint, n) && i.status !== 'superseded')) return true;
    return !!(bound[k]?.needPrint && !matchesNeedPrint(bound[k].needPrint, n));
  }).map(needKey)])];
}
// safe rewrite reconciliation: after shots are rewritten the three material ledgers must print the same need,
// or changedNeeds() (rightly) refuses to search. Update prints for the rewritten shots only; approvals keep history by superseding.
export function reconcileNeedPrints(cfg, id, written, opts = {}) {
  const log = opts.log || (() => {});
  const dir = materialsDir(cfg, id);
  const needs = readJson(path.join(dir, 'needs.json'), { needs: [] }).needs || [];
  const byKey = new Map(needs.map((n) => [needKey(n), n]));
  let changed = 0;
  const candFile = path.join(dir, 'candidates.json');
  if (fs.existsSync(candFile)) {
    const cand = readJson(candFile, { shots: {} });
    for (const [k, row] of Object.entries(cand.shots || {})) { const n = byKey.get(k); if (!n || !written.has(n.shotId)) continue; row.need = { ...n }; }
    fs.writeFileSync(candFile, JSON.stringify(cand, null, 1) + String.fromCharCode(10));
  }
  const bindFile = path.join(dir, 'bindings.json');
  if (fs.existsSync(bindFile)) {
    const bind = readJson(bindFile, { shots: {} });
    for (const [k, row] of Object.entries(bind.shots || {})) { const n = byKey.get(k); if (!n || !written.has(n.shotId)) continue; if (row && row.needPrint !== needPrint(n)) { row.needPrint = needPrint(n); changed++; } }
    fs.writeFileSync(bindFile, JSON.stringify(bind, null, 1) + String.fromCharCode(10));
  }
  const appFile = path.join(dir, 'approvals.json');
  if (fs.existsSync(appFile)) {
    const app = readJson(appFile, { batches: [] });
    for (const b of app.batches || []) for (const it of b.items || []) { const n = byKey.get(it.shotId); if (!n || !written.has(n.shotId) || !it.needPrint) continue; if (!matchesNeedPrint(it.needPrint, n) && it.status !== 'superseded') { it.status = 'superseded'; changed++; } }
    fs.writeFileSync(appFile, JSON.stringify(app, null, 1) + String.fromCharCode(10));
  }
  if (changed) log('  materials reconciled: ' + changed + ' ledger print(s) updated');
  return changed;
}

export function retireChangedNeeds(cfg, id, { log = () => {} } = {}) {
  const keys = new Set(changedNeeds(cfg, id));
  if (!keys.size) return [];
  throw new Error(`material retirement disabled: changed needs require scoped reconciliation: ${[...keys].join(',')}`);
}

// A picture found to be wrong after it was fetched (the wrong person under a name card: paperclip-138-full B31, a
// news page's lead image was a police officer, not Gao Chengyong) is taken back: its approval is marked rejected,
// its binding moves to bindings.superseded (the library file stays), the shot's slot goes back to its stand-in, and
// the need is skipped so nothing is proposed or approved for it again until it is searched anew.
export async function rejectPick(cfg, id, key, options = {}) {
  const { materialsLock } = await import('./shotplan.mjs');
  const release = await materialsLock(cfg, id, options.log);
  try { return rejectPickLocked(cfg, id, key, options); } finally { release(); }
}

// Caller owns the project materials lock for the entire read/modify/write.
function rejectPickLocked(cfg, id, key, { why = 'wrong picture', log = () => {} } = {}) {
  const dir = materialsDir(cfg, id), at = new Date().toISOString();
  const af = path.join(dir, 'approvals.json'), bf = path.join(dir, 'bindings.json'), rf = path.join(dir, 'review-picks.json');
  const appr = readJson(af, { batches: [] }), bind = readJson(bf, { shots: {} }), rev = readJson(rf, { picks: {}, skip: {} });
  for (const b of appr.batches) for (const i of b.items) if (i.shotId === key && ['approved', 'fetched'].includes(i.status)) Object.assign(i, { status: 'rejected', rejectedAt: at, rejectedWhy: why });
  fs.writeFileSync(af, JSON.stringify(appr, null, 1) + '\n');
  if (bind.shots?.[key]) { bind.superseded = bind.superseded || {}; bind.superseded[`${key}@${at}`] = { ...bind.shots[key], rejectedWhy: why }; delete bind.shots[key]; fs.writeFileSync(bf, JSON.stringify(bind, null, 1) + '\n'); }
  // the wrong picture is out (deadUrls), not the need: the next candidate is proposed and approved as before
  // (2026-10-23: B31's skip after one wrong pick stopped the search; the next page had his photograph)
  rev.rejected = { ...(rev.rejected || {}), [key]: [...(rev.rejected?.[key] || []), { at, why }] }; fs.writeFileSync(rf, JSON.stringify(rev, null, 1) + '\n');
  const need = (readJson(path.join(dir, 'needs.json'), { needs: [] }).needs || []).find((n) => needKey(n) === key);
  if (need?.bind) {
    const sf = path.join(projectPaths(cfg, id).shots, `${need.shotId}.json`), shot = readJson(sf, null);
    const slots = need.scene ? shot?.scenes?.[need.scene]?.slots : shot?.slots, v = slots?.[need.bind];
    if (v && typeof v === 'object') { for (const k of ['asset', 'video', 'screenshot', 'credit', 'source', 'role']) delete v[k]; fs.writeFileSync(sf, JSON.stringify(shot, null, 1) + '\n'); }
  }
  log(`${key}: taken back (${why}); the next candidate goes, the stand-in meanwhile`);
}

// The rules that choose a pick (which pages are no report's source, which pictures are a site's furniture, the names a
// need goes by) are read again on every run: a pick already approved that the current rules refuse is taken back and
// the next goes (2026-10-24: B47's Wikipedia entry and B46's banner flag stayed bound after the rules learned of them,
// until the candidates were cleared by hand)
export function refusedByRules(cfg, item) {
  if (item.asset && NOT_A_PHOTO.test(item.asset) && !/logo/i.test(String(item.needPrint || ''))) return 'a site\'s furniture, not a photo of the need (NOT_A_PHOTO)';
  if (TRUSTED_RIGHTS.includes(item.rights) || item.source === 'library') return null;   // an official release, the public domain, Creative Commons (Wikimedia Commons' files) and the library stay
  const pats = (readJson(path.join(cfg.dataDir, 'routing', 'news-outlets.json'), {}).notSources?.patterns || []).map((x) => new RegExp(x, 'i'));
  const url = String(item.url || '').replace(/^https?:\/\//, '');
  if (pats.some((re) => re.test(url))) return `${url.split('/')[0]} is no report's source (routing/news-outlets.json notSources)`;
  return null;
}
export async function recheckPicks(cfg, id, { log = () => {}, lockOwner = null } = {}) {
  const { materialsLock, ownsMaterialsLock } = await import('./shotplan.mjs');
  if (lockOwner && !ownsMaterialsLock(lockOwner, cfg, id)) throw new Error('invalid materials lock owner');
  const release = lockOwner ? null : await materialsLock(cfg, id, log);
  try { return recheckPicksLocked(cfg, id, { log }); } finally { release?.(); }
}
function recheckPicksLocked(cfg, id, { log = () => {} } = {}) {
  const { approvals } = readMaterials(cfg, id), out = [], stale = new Set(changedNeeds(cfg, id));
  for (const i of approvals.batches.flatMap((b) => b.items)) {
    if (stale.has(i.shotId)) { log(`${i.shotId}: stale material need; recheck skipped`); continue; }
    if (!['approved', 'fetched'].includes(i.status)) continue; // free-text labels do not establish identity
    const why = refusedByRules(cfg, i); if (!why || out.includes(i.shotId)) continue;
    rejectPickLocked(cfg, id, i.shotId, { why: `by the current rules: ${why}`, log }); out.push(i.shotId);
  }
  return out;
}
// the fingerprint of the rules a proposal was made under: when it changes, every need is proposed again
export function pickRulesHash(cfg) {
  const files = [path.join(cfg.dataDir, 'routing', 'news-outlets.json'), path.join(cfg.dataDir, 'routing', 'known-names.json'), fileURLToPath(import.meta.url)];
  return crypto.createHash('sha1').update(files.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')).join('\u0000')).digest('hex').slice(0, 16);
}
export function reproposeOnRuleChange(cfg, id, { log = () => {} } = {}) {
  const f = path.join(materialsDir(cfg, id), 'proposed-batch.json'), prev = readJson(f, null), h = pickRulesHash(cfg);
  if (!prev || prev.rulesHash === h) return false;
  const r = proposeBatch(cfg, id); const now = readJson(f, null); if (now) { now.rulesHash = h; fs.writeFileSync(f, JSON.stringify(now, null, 1) + '\n'); }
  log(`the rules that choose picks changed: every need proposed again (${r.picks.length} picks${r.skipped.length ? `, nothing usable for ${r.skipped.join(',')}` : ''})`);
  return true;
}

// Web page candidates: URLs only (title, publisher, snippet); the page is fetched only after approval.
export function pageCandidatesFrom(result) {
  return (result?.candidates || []).map((c) => ({
    id: `web:${c.id}`, source: 'web', title: c.title, publisher: c.publisher, url: c.url, thumb: null, mediaType: 'WEBPAGE', duration: null,
    snippet: c.snippet || '', rights: 'news', rightsLabel: `${LABELS.news}（网页截图引用）`, score: +(c.excerptMatch?.score ?? 0).toFixed(3),
  }));
}
// Official sites of the org a page is about (routing/known-names.json `domains`); papers live on arXiv.
export function officialDomains(cfg, need) {
  const lex = readJson(path.join(cfg.dataDir, 'routing', 'known-names.json'), { names: [] }).names || [];
  const text = `${need.entity || ''} ${(need.page?.entities || []).join(' ')} ${need.original || ''}`;
  const d = lex.filter((e) => e.domains && e.names.some((n) => text.includes(n))).flatMap((e) => e.domains);
  return [...new Set([...(need.form === 'paper' ? ['arxiv.org'] : []), ...d])];
}
const hostOf = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).toLowerCase(); } catch { return ''; } };
export const isOfficial = (url, domains) => domains.some((d) => hostOf(url).startsWith(d) || hostOf(url).split('/')[0].endsWith('.' + d.split('/')[0]) && !d.includes('/'));

// The public index throttles bursts (it answers with an empty page): searches are spaced, and an empty
// answer is tried once more after a pause.
let lastPageSearch = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// English sources first (user decision 2026-10-17: news is cited from English-language outlets). The
// English query is the page's own, or the storyboard evidence it came from (older needs did not keep it).
export const isEnglish = (c) => { const t = `${c.title || ''}`; const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length; return t.length > 0 && cjk / t.length < 0.1; };
export function englishQuery(cfg, id, need) {
  if (need.page?.queryEn) return need.page.queryEn;
  if (['photo', 'video'].includes(need.form)) {
    const own = need.queryEn || need.clip || need.youtube?.[0] || need.archive?.keywords?.[0];
    if (own) return own;
  }
  const sb = id ? readJson(path.join(projectPaths(cfg, id).root, 'storyboard.json'), null) : null;
  for (const shot of sb?.shots || []) for (const e of shot.evidence || []) if (e.queryEn && e.what === need.original) return e.queryEn;
  return null;
}
// (pure) how much of a reference headline a page title carries: the share of its characters (spaces and punctuation
// aside) in the title's, in order-free bigrams so a reworded repost scores below the report itself
export function titleMatch(ref, title) {
  const clean = (x) => String(x || '').toLowerCase().replace(/[\s，,。.、：:；;！!？?“”"'‘’（）()《》「」【】|·\-—_]/g, '');
  const a = clean(ref), b = clean(title); if (a.length < 4 || !b) return 0;
  const grams = (x) => new Set(Array.from({ length: x.length - 1 }, (_, i) => x.slice(i, i + 2)));
  const ga = grams(a), gb = grams(b); let n = 0; for (const g of ga) if (gb.has(g)) n++;
  return +(n / ga.size).toFixed(3);
}
async function pageCandidates(cfg, need, { spacingMs = 2500, retryMs = 15000, id = null } = {}) {
  const m = await mainLine(cfg, 'a1-article-source-discovery-v1.mjs');
  const en = englishQuery(cfg, id, need);
  let english = [];
  if (en) {
    const q = m.compileArticleSourceDiscoveryRequest({ id: `${needKey(need)}-en`, articleTitle: en, entities: (need.page?.entities || []).filter((x) => /^[\x20-\x7e]+$/.test(x)), keywords: [], limit: 6 });
    if (q.status === 'READY_FOR_DISCOVERY') {
      await sleep(Math.max(0, lastPageSearch + spacingMs - Date.now())); lastPageSearch = Date.now();
      try { english = pageCandidatesFrom(await m.discoverArticleSourceCandidates(q, { limit: 6 })).filter(isEnglish); } catch {}
    }
  }
  // the reference's own report first: its headline as the card read it, searched as written (the reference cited
  // 「幻方量化花10个亿，就为了这1万张A100显卡」; the line searched its English gist and took a blog)
  let refd = [];
  if (need.page?.refTitle) {
    const q = m.compileArticleSourceDiscoveryRequest({ id: `${needKey(need)}-ref`, articleTitle: need.page.refTitle, entities: [], keywords: [], limit: 6 });
    if (q.status === 'READY_FOR_DISCOVERY') {
      await sleep(Math.max(0, lastPageSearch + spacingMs - Date.now())); lastPageSearch = Date.now();
      try { refd = pageCandidatesFrom(await m.discoverArticleSourceCandidates(q, { limit: 6 })); } catch {}
    }
  }
  // and the claim itself: its figure or quoted words with the subject (「5926.58亿」 英伟达), as the reference searched what
  // it says rather than what it is about
  if (need.page?.must?.length) {
    const q = m.compileArticleSourceDiscoveryRequest({ id: `${needKey(need)}-claim`, articleTitle: `"${need.page.must[0]}" ${need.entity || (need.page?.entities || [])[0] || ''}`.trim(), entities: [], keywords: [], limit: 6 });
    if (q.status === 'READY_FOR_DISCOVERY') {
      await sleep(Math.max(0, lastPageSearch + spacingMs - Date.now())); lastPageSearch = Date.now();
      try { refd.push(...pageCandidatesFrom(await m.discoverArticleSourceCandidates(q, { limit: 6 }))); } catch {}
    }
  }
  const r = await pageCandidatesOpen(m, cfg, need, { spacingMs, retryMs });
  const domains = officialDomains(cfg, need);
  const seen = new Set();
  const all = [...refd, ...english.map((c) => ({ ...c, official: isOfficial(c.url, domains) })), ...r.list].filter((c) => !seen.has(c.url) && seen.add(c.url));
  if (need.page?.refTitle) for (const c of all) c.refMatch = titleMatch(need.page.refTitle, c.title);
  all.forEach((c) => (c.lang = isEnglish(c) ? 'en' : 'other'));
  // a news page: English outlets only when there are any; official pages and papers stay either way. A story told in
  // Chinese (its entity is written in Chinese: 白银连环杀人案) keeps its Chinese reports first: they are the primary
  // sources (paperclip-138-full B21: the China News report with the wanted portraits was dropped for an English blog)
  const local = !!need.page?.local || /[\u4e00-\u9fff]/.test((need.page?.entities || [])[0] || need.entity || '');
  const enOnly = !local && need.form !== 'paper' && all.some((c) => c.lang === 'en') ? all.filter((c) => c.lang === 'en' || c.official) : all;
  return { list: enOnly.sort((a, b) => (local ? (a.lang === 'en') - (b.lang === 'en') : (b.lang === 'en') - (a.lang === 'en'))).slice(0, 8), errors: r.errors };
}
async function pageCandidatesOpen(m, cfg, need, { spacingMs, retryMs }) {
  // an official-site search first (site:domain + the entity and keywords), then the open search
  const domains = officialDomains(cfg, need);
  const terms = [...(need.page?.entities || []), ...(need.page?.keywords || [])].slice(0, 3).join(' ');
  let official = [];
  for (const d of domains.slice(0, 2)) {
    const q = m.compileArticleSourceDiscoveryRequest({ id: `${needKey(need)}-site`, articleTitle: `site:${d.split('/')[0]} ${terms}`, limit: 4 });
    if (q.status !== 'READY_FOR_DISCOVERY') continue;
    await sleep(Math.max(0, lastPageSearch + spacingMs - Date.now())); lastPageSearch = Date.now();
    try { official.push(...pageCandidatesFrom(await m.discoverArticleSourceCandidates(q, { limit: 4 })).filter((c) => isOfficial(c.url, domains))); } catch {}
  }
  official.forEach((c) => (c.official = true));
  const request = m.compileArticleSourceDiscoveryRequest({ id: needKey(need), articleTitle: need.page?.title || need.original, entities: need.page?.entities || [], keywords: need.page?.keywords || [], limit: 6 });
  if (request.status !== 'READY_FOR_DISCOVERY') return { list: official, errors: request.failures };
  const merge = (list) => { const seen = new Set(); return [...official, ...list.map((c) => ({ ...c, official: isOfficial(c.url, domains) }))].filter((c) => !seen.has(c.url) && seen.add(c.url)).slice(0, 8); };
  for (let attempt = 0; attempt < 2; attempt++) {
    await sleep(Math.max(0, lastPageSearch + (attempt ? retryMs : spacingMs) - Date.now()));
    lastPageSearch = Date.now();
    try {
      const found = await m.discoverArticleSourceCandidates(request, { limit: 6 });
      const list = merge(pageCandidatesFrom(found));
      if (list.length || attempt) return { list, errors: found.providerRuns.filter((r) => r.status === 'UNAVAILABLE').map((r) => r.reason) };
    } catch (e) {
      if (attempt) return { list: [], errors: [String(e.message || e)] };
    }
  }
  return { list: official, errors: [] };
}

// Stock libraries with a licence and an API (Pexels, Pixabay): the reference's atmosphere shots (dollar bills, hands on
// a keyboard, a lab) are graded, shallow and clean where YouTube gave flat office stock and watermarked previews (talent
// S3, B80). Searched for a need that names no one, only with a key (PEXELS_API_KEY, PIXABAY_API_KEY in the environment).
export function stockCandidates(need, query) {
  const q = String(query || '').replace(/[^A-Za-z0-9 ,'-]/g, ' ').trim(), out = [], video = need.form === 'video' || (need.form !== 'photo' && need.kind === 'archival');
  if (!q) return out;
  const get = (url, headers = []) => { const r = spawnSync('curl', ['-sSL', '--fail', '--max-time', '30', ...headers.flatMap((h) => ['-H', h]), url], { encoding: 'utf8', maxBuffer: 20 << 20 }); try { return r.status === 0 ? JSON.parse(r.stdout) : null; } catch { return null; } };
  if (process.env.PEXELS_API_KEY) {
    const d = get(`https://api.pexels.com/${video ? 'videos/' : 'v1/'}search?per_page=6&orientation=landscape&query=${encodeURIComponent(q)}`, [`Authorization: ${process.env.PEXELS_API_KEY}`]);
    for (const v of d?.videos || []) { const f = (v.video_files || []).filter((x) => /mp4/.test(x.file_type || '') && (x.width || 0) >= 1280).sort((a, b) => Math.abs(a.width - 1920) - Math.abs(b.width - 1920))[0]; if (f) out.push({ id: `pexels:${v.id}`, source: 'stock', title: `${q} (Pexels ${v.id})`, publisher: v.user?.name ? `Pexels · ${v.user.name}` : 'Pexels', url: v.url, asset: f.link, w: f.width, h: f.height, duration: v.duration, rights: 'stock', thumb: v.image }); }
    for (const p of d?.photos || []) out.push({ id: `pexels:${p.id}`, source: 'stock', title: p.alt || `${q} (Pexels ${p.id})`, publisher: `Pexels · ${p.photographer || ''}`, url: p.url, asset: p.src?.original, w: p.width, h: p.height, rights: 'stock', thumb: p.src?.medium });
  }
  if (process.env.PIXABAY_API_KEY) {
    const d = get(`https://pixabay.com/api/${video ? 'videos/' : ''}?key=${process.env.PIXABAY_API_KEY}&per_page=6&safesearch=true&q=${encodeURIComponent(q)}`);
    for (const h of d?.hits || []) { if (video) { const f = h.videos?.large?.url ? h.videos.large : h.videos?.medium; if (f?.url && (f.width || 0) >= 1280) out.push({ id: `pixabay:${h.id}`, source: 'stock', title: `${h.tags || q} (Pixabay ${h.id})`, publisher: `Pixabay · ${h.user || ''}`, url: h.pageURL, asset: f.url, w: f.width, h: f.height, duration: h.duration, rights: 'stock', thumb: f.thumbnail }); }
      else out.push({ id: `pixabay:${h.id}`, source: 'stock', title: h.tags || q, publisher: `Pixabay · ${h.user || ''}`, url: h.pageURL, asset: h.largeImageURL, w: h.imageWidth, h: h.imageHeight, rights: 'stock', thumb: h.previewURL }); }
  }
  return out;
}
// Which needs a search covers: `only` may name shots (every cut of them) or single cuts (B05~2).
// A need nothing usable came for is searched again in other words, round after round (the user 2026-10-27: 之后尽量不要卡住
// 搜不到就多搜几轮 不行就3d展示概念或ai生图), and after SEARCH_ROUNDS it is given up: its slot is stood in by art in the
// film's look marked 示意 (arttemplates.mjs fillProjectArt), never left as a TODO plate. materials/rounds.json
export const SEARCH_ROUNDS = 3;
const roundsFile = (cfg, id) => path.join(materialsDir(cfg, id), 'rounds.json');
export const readRounds = (cfg, id) => readJson(roundsFile(cfg, id), { needs: {} }).needs || {};
const writeRounds = (cfg, id, needs) => fs.writeFileSync(roundsFile(cfg, id), JSON.stringify({ contract: 'A1RecipeBoardMaterialRounds/v1', needs }, null, 1) + '\n');
// the needs to search again now: missed last time, rounds left
export const researchDue = (rounds) => Object.entries(rounds).filter(([, r]) => r.missed && !r.gaveUp && (r.round || 0) < SEARCH_ROUNDS).map(([k]) => k);
export const givenUp = (rounds) => new Set(Object.entries(rounds).filter(([, r]) => r.gaveUp).map(([k]) => k));
// (pure) the need in other words for round n: its name as the English and the Chinese write it, with what is asked for
// (a satellite image, an aerial, a photo), then with the storyboard's own words, then where open pictures are kept
export function searchVariant(need, round) {
  const names = nameParts([need.entity, ...(need.archive?.entities || [])]);
  const latin = names.filter((n) => /[a-z]/.test(n) && !/[\u3400-\u9fff]/.test(n)), cjk = names.filter((n) => /[\u3400-\u9fff]/.test(n) && !/[a-z]/.test(n));
  const cap = (x) => (x ? x.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : x);
  const o = String(need.original || ''), what = /卫星/.test(o) ? 'satellite image' : /航拍|俯瞰/.test(o) ? 'aerial photo' : need.form === 'video' ? 'news footage' : 'photo';
  const base = String(need.queryEn || need.archive?.keywords?.[0] || ''), en = cap(latin[0]), zh = cjk[0];
  const rest = base.split(/\s+/).filter((w) => w && !String(latin[0] || '').includes(w.toLowerCase())).slice(0, 3).join(' ');
  const sets = [
    [en && `${en} ${what}`, zh && `${zh}${/卫星/.test(o) ? '卫星图' : '照片'}`],
    [en && rest && `${en} ${rest}`, base && `${base} news photo`],
    [en && `${en} Wikimedia Commons`, zh && `${zh} 新闻图片`],
  ];
  const qs = [...new Set((sets[Math.max(1, Math.min(round, sets.length)) - 1] || []).filter(Boolean))];
  return qs.length ? { ...need, queryEn: qs[0], archive: { ...(need.archive || {}), keywords: qs } } : need;
}
// after a proposal: the needs it found nothing for are marked missed (given up once their rounds are spent); found ones are cleared
export function noteRounds(cfg, id, skipped, picked) {
  const rounds = readRounds(cfg, id);
  for (const k of picked) if (rounds[k]) rounds[k] = { ...rounds[k], missed: false, gaveUp: false };
  for (const k of skipped) { const r = rounds[k] || { round: 0, tried: [] }; rounds[k] = { ...r, missed: true, gaveUp: (r.round || 0) >= SEARCH_ROUNDS, at: new Date().toISOString() }; }
  writeRounds(cfg, id, rounds);
  return rounds;
}
export const needsToSearch = (needs, only) => needs.filter((n) => !only || only.includes(n.shotId) || only.includes(needKey(n)));

export async function findCandidates(cfg, id, { only = null, log = () => {} } = {}) {
  const dir = materialsDir(cfg, id);
  const { needs } = JSON.parse(fs.readFileSync(path.join(dir, 'needs.json'), 'utf8'));
  const stale = new Set(changedNeeds(cfg, id));
  const staleShots = new Set([...stale].map(k => k.split('~')[0]));
  // Reference frames are stored per shot, not scene: do not touch a shared frame
  // when any scene in that shot is blocked.
  for (const need of needs) if (!staleShots.has(need.shotId)) refFrame(cfg, id, need);
  const file = path.join(dir, 'candidates.json');
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { shots: {} };
  const ledger = readJson(path.join(dir, 'bindings.json'), { shots: {} });
  const bound = Object.fromEntries(Object.entries(ledger.shots || {}).filter(([k]) => !stale.has(k)));
  const rounds = readRounds(cfg, id), again = new Set(researchDue(rounds));
  for (const need0 of needsToSearch(needs, only)) {
    if (stale.has(needKey(need0))) { log(`${needKey(need0)} blocked: changed material need requires reconciliation`); continue; }
    // a need searched before with nothing usable: its next round, in other words; its earlier candidates are kept
    const key0 = needKey(need0), round = again.has(key0) ? (rounds[key0].round || 0) + 1 : 0, need = round ? searchVariant(need0, round) : need0;
    const kept = round ? prev.shots[key0]?.candidates || [] : [];
    if (round) { rounds[key0] = { ...rounds[key0], round, missed: false, tried: [...(rounds[key0].tried || []), ...(need.archive?.keywords || [])] }; log(`${key0.padEnd(8)} round ${round}: ${(need.archive?.keywords || []).join(' / ')}`); }
    const retired = Object.keys(ledger.superseded || {}).some(k => k.startsWith(`${needKey(need)}@`));
    const same = !retired && !stale.has(needKey(need)) && !bound[needKey(need)] && sameSubject(need, needs, bound, { shots: prev.shots, approvals: readJson(path.join(dir, 'approvals.json'), { batches: [] }) });
    if (same) { prev.shots[needKey(need)] = { need, candidates: [], reuse: same.key, ...(same.provenance ? { provenance: same.provenance } : { searchedAt: new Date().toISOString() }) }; log(`${needKey(need).padEnd(8)} reuses ${same.key}'s confirmed picture of ${need.entity}`); continue; }
    if (need.kind === 'presenter') {
      prev.shots[needKey(need)] = { need, candidates: [], note: need.note || '主讲人口播：用你自己录的片段（对标时用原片这一段作参照）。' };
      continue;
    }
    if (need.kind === 'page') {
      const web = await pageCandidates(cfg, need, { id });
      // nothing found is not "searched": the index may have been throttling; the next run tries again
      if (!web.list.length) { delete prev.shots[needKey(need)]; log(`${needKey(need).padEnd(8)}  0 web pages (not recorded: searched again next run)${web.errors.length ? ` ${web.errors.join(',')}` : ''}`); continue; }
      prev.shots[needKey(need)] = { need, candidates: web.list, errors: web.errors, searchedAt: new Date().toISOString() };
      log(`${needKey(need).padEnd(8)} ${String(web.list.length).padStart(2)} web pages`);
      continue;
    }
    // a video need registered without search words still gets searched: the storyboard's English query,
    // else the entity's name with what is asked for (clara-auto: 15 interview needs had none and found nothing)
    // (a named person's portrait or an organisation's mark is not searched on YouTube: its talks are their own request,
    // and a YouTube search took most of each need's minute for candidates never picked: the material library)
    const stillOfNamed = need.form === 'photo' || (need.entity && need.form === 'logo' && !need.youtube?.length);
    const ytQueries0 = stillOfNamed ? [] : need.youtube?.length ? need.youtube : need.form === 'video' || need.kind === 'archival' || need.kind === 'stock'
      ? [englishQuery(cfg, id, need), need.entity && `${need.entity} ${/采访|interview|讲述|回忆|谈/.test(need.original || '') ? '采访' : ''}`.trim()].filter(Boolean)
      : [];
    // a subject told in Chinese is searched in Chinese too (2026-10-23: B36's CCTV report on the case was found only by
    // its Chinese title; the English query brought American news)
    const ytQueries = stillOfNamed ? ytQueries0 : [...new Set([...ytQueries0, ...(need.form === 'video' ? chineseQueries(need) : [])])];
    const stock = !need.entity ? stockCandidates(need, englishQuery(cfg, id, need) || need.clip || (need.youtube || [])[0] || '') : [];
    const yt = youtubeCandidates({ ...need, youtube: ytQueries });
    const arc = await archiveCandidates(cfg, need);
    const film = await filmSuggestions(cfg, need);
    const lib = libraryCandidates(cfg, need);
    const own = need.form === 'video' ? [] : await officialImageCandidates(cfg, need);
    const news = need.form === 'video' ? [] : await newsPhotoCandidates(cfg, need, id);
    // a person is matched by every name they go by: the known-names aliases and the capitalised name in the
    // storyboard's English query ("Masayoshi Son" for 孙正义), or English titles are thrown out
    const aliases = [...new Set([
      ...(readJson(path.join(cfg.dataDir, 'routing', 'known-names.json'), { names: [] }).names || []).filter((e) => e.names.includes(need.entity)).flatMap((e) => e.names),
      ...((englishQuery(cfg, id, need) || '').match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{1,})+/g) || []),
    ])].filter((n) => n && n !== need.entity);
    const named = aliases.length ? { ...need, archive: { ...(need.archive || {}), entities: [...(need.archive?.entities || []), ...aliases] } } : need;
    const external = contextFilter(cfg, named, personFilter(cfg, named, [...arc.list, ...yt.list]));
    const found = [...lib, ...stock, ...own, ...external, ...news];
    prev.shots[needKey(need)] = { need: need0, candidates: [...found, ...kept.filter((c) => !found.some((f) => f.id === c.id))], film, errors: [...yt.errors, ...arc.errors], searchedAt: new Date().toISOString(), ...(round ? { round } : {}) };
    log(`${needKey(need).padEnd(8)} ${String(lib.length).padStart(2)} library  ${String(yt.list.length).padStart(2)} youtube  ${String(arc.list.length).padStart(2)} archive  ${String(own.length).padStart(2)} official/gallery  ${String(news.length).padStart(2)} news photos  ${film.length} film${external.length < arc.list.length + yt.list.length ? `  (${arc.list.length + yt.list.length - external.length} dropped: name or context not in title)` : ''}`);
  }
  fs.writeFileSync(file, JSON.stringify({ contract: 'A1RecipeBoardMaterialCandidates/v1', boundary: '候选清单，未下载；下载需要用户按批确认。', ...prev }, null, 1) + '\n');
  if (again.size) writeRounds(cfg, id, rounds);
  return { file, shots: prev.shots };
}

// ---- After approval: download, pick the seconds, cut, file in the NAS library with a receipt. ----
// Originals go to <library>/sources/<rights>/, cuts to <library>/clips/review/, receipts to
// <library>/receipts/ (same layout, distinct acquisition receipt; not a NAS bridge clearance). The project
// keeps a local copy of each cut in materials/clips/ (not committed) and materials/bindings.json.
export const LIBRARY = process.env.A1_MATERIAL_LIBRARY || '/Volumes/personalfolder/电影/A1素材库';
const FFMPEG = 'ffmpeg';
const shaFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const probeDuration = (file) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout) || 0;
// Probe the content, not the provider's label or filename. Ambiguous formats fail closed.
function actualMedia(file) {
  try { if (typeof file !== 'string' || !path.isAbsolute(file) || !fs.statSync(file).isFile()) return 'unknown'; } catch { return 'unknown'; }
  const p = spawnSync('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=format_name,duration:format_tags=major_brand:stream=codec_type,nb_frames', '-of', 'json', file], { encoding: 'utf8', timeout: 30000 });
  if (p.status !== 0) return 'unknown';
  let data; try { data = JSON.parse(p.stdout); } catch { return 'unknown'; }
  if (!(data.streams || []).some(s => s.codec_type === 'video')) return 'unknown';
  const formats = (data.format?.format_name || '').split(',');
  const image = formats.some(f => /^(image2|image2pipe|jpeg_pipe|png_pipe|webp_pipe|tiff_pipe|bmp_pipe)$/.test(f));
  const brand = String(data.format?.tags?.major_brand || '').toLowerCase();
  const video = formats.some(f => /^(mov|mp4|matroska|webm|avi|mpeg|mpegts)$/.test(f)) && !/^(avif|avis|mif1|msf1|heic|heix|hevc|hevx)$/.test(brand) && Number(data.format?.duration) > 0 && Number((data.streams || []).find(s => s.codec_type === 'video')?.nb_frames || 2) > 1;
  if (image === video) return 'unknown';
  const decoded = spawnSync(FFMPEG, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', file, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-'], { timeout: 30000 });
  return decoded.status === 0 ? (image ? 'image' : 'video') : 'unknown';
}
// Leave undeclared legacy needs unchanged; explicit needs must match the actual bytes.
export function bindingMatchesForm(need, binding) {
  if (!['photo', 'video'].includes(need?.form)) return true;
  const expected = need.form === 'photo' ? 'image' : 'video';
  return binding?.kind === expected && actualMedia(binding?.file) === expected;
}
// A persisted binding may still be present in the shot even after its requested form changes.
// Do not mutate either the slot or historical approvals: surface the conflict to the caller.
export function blockedMaterialForms(cfg, id, { only = null } = {}) {
  const needs = readMaterials(cfg, id).needs;
  const bindings = readJson(path.join(materialsDir(cfg, id), 'bindings.json'), {})?.shots || {};
  const hasPlacedMedia = n => {
    const shot = readJson(path.join(projectPaths(cfg, id).shots, `${n.shotId}.json`), null);
    const target = n.scene ? shot?.scenes?.[n.scene] : shot;
    const fill = n.bind === 'backdrop' ? shot?.backdrop : target?.slots?.[n.bind || 'background'];
    return !!(fill?.asset || fill?.video);
  };
  return needs.filter(n => (!only || only.has(n.shotId)) && ['photo', 'video'].includes(n.form) &&
    (Object.hasOwn(bindings, needKey(n)) ? !bindingMatchesForm(n, bindings[needKey(n)]) : !n.module && hasPlacedMedia(n))).map(needKey);
}
// Check only locations bindShots actually owns; unrelated card backgrounds are not material bindings.
export function materialSlotConflicts(cfg, id, { only = null } = {}) {
  const needs = readMaterials(cfg, id).needs;
  const bindings = readJson(path.join(materialsDir(cfg, id), 'bindings.json'), {})?.shots || {};
  const chapters = chapterBeats(cfg, id);
  const errors = [];
  for (const n of needs) {
    if ((only && !only.has(n.shotId)) || !['photo', 'video'].includes(n.form) || n.module || chapters.has(n.shotId)) continue;
    const b = bindings[needKey(n)];
    if (!b || !bindingMatchesForm(n, b) || (b.role === 'logo' && n.bind === 'background')) continue;
    const shot = readJson(path.join(projectPaths(cfg, id).shots, `${n.shotId}.json`), null);
    if (!shot) continue;
    const k = n.scene || 0, target = shot.scenes?.length ? shot.scenes[k] : shot;
    const page = b.role === 'page' && b.archive?.window && (target?.recipe || shot.recipe) === 'screen-full';
    const slot = page ? 'screen' : n.bind;
    const locations = [];
    if (slot === 'backdrop') locations.push(['backdrop', shot.backdrop]);
    else if (slot) {
      if (k === 0 && shot.slots && Object.hasOwn(shot.slots, slot)) locations.push([`slots.${slot}`, shot.slots[slot]]);
      if (shot.scenes?.[k]?.slots && Object.hasOwn(shot.scenes[k].slots, slot)) locations.push([`scenes.${k}.slots.${slot}`, shot.scenes[k].slots[slot]]);
    } else if (shot.recipe === 'footage-plate' && shot.slots && Object.hasOwn(shot.slots, 'background')) locations.push(['slots.background', shot.slots.background]);
    const file = page ? b.archive.window.file : b.role === 'page' && b.archive?.window?.version >= 2 && fs.existsSync(b.archive.window.file) ? b.archive.window.file : b.file;
    for (const [where, fill] of locations) {
      if (fill == null) continue;
      const actual = fill.asset || fill.video?.path;
      if (!actual || !file) errors.push(`${needKey(n)} ${where}: unknown material reference`);
      else if (path.resolve(cfg.sourceRoot, actual) !== path.resolve(file)) errors.push(`${needKey(n)} ${where}: material differs from binding`);
    }
  }
  return errors;
}
const slug = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40);

// Longest single-take videos we download whole when the user gave no seconds; longer ones need a range.
const WHOLE_DOWNLOAD_LIMIT = 600;
// a long talk of a named person (a library's talk, a person's footage) is not passed over: any minute of it shows them, so
// a minute and a half is taken from past its opening (the library found six interviews of Boris Cherny, all longer than
// ten minutes, and kept none)
export function autoSegment(c, need) {
  if (c?.source !== 'youtube' || !((c.duration ?? 0) > WHOLE_DOWNLOAD_LIMIT) || !need?.entity || need.form !== 'video') return null;
  const s = Math.round(Math.max(30, c.duration * .2)); return [s, s + 90];
}
const WEAK_MATCH = 0.25;

function download(item, dir) {
  // Library material is already verified and on disk: use it as is.
  if (item.source === 'library') return { file: item.file, kind: /\.(mp4|mov|webm)$/i.test(item.file) ? 'video' : 'image', client: 'library' };
  fs.mkdirSync(dir, { recursive: true });
  // Check legacy caches before creating a fresh acquisition directory.
  const caches = [dir, ...fs.readdirSync(dir, {withFileTypes:true}).filter(d => d.isDirectory() && d.name.startsWith('acquisition-') && fs.existsSync(path.join(dir, d.name, 'source.window.json'))).map(d => path.join(dir, d.name))];
  for (const cached of caches) {
    if (item.source === 'stock' && item.asset && !/\.(jpe?g|png|webp|tiff?)(\?|$)/i.test(item.asset) && fs.existsSync(path.join(cached, 'source.mp4'))) return { file: path.join(cached, 'source.mp4'), kind: 'video', client: 'stock' };
    if ((!item.asset || !/\.(jpe?g|png|webp|tiff?)(\?|$)/i.test(item.asset)) && item.source !== 'news-photo' && item.source !== 'stock' && !/collection\.json$/.test(item.asset || '')) {
      const windowFile = path.join(cached, 'source.window.json');
      const sameWindow = JSON.stringify(item.segment || null) === (fs.existsSync(windowFile) ? fs.readFileSync(windowFile, 'utf8').trim() : 'null');
      const have = fs.readdirSync(cached).find(n => n.startsWith('source.') && !n.endsWith('.part') && n !== 'source.window.json');
      if (sameWindow && have) return { file: path.join(cached, have), kind: 'video', client: 'cached' };
    }
  }
  dir = fs.mkdtempSync(path.join(dir, 'acquisition-'));
  // NASA image library gives a manifest; take the largest rendition it lists.
  if (item.asset && /collection\.json$/.test(item.asset)) {
    const r = spawnSync('curl', ['-sSL', '--fail', item.asset], { encoding: 'utf8', timeout: 60000 });
    const urls = r.status === 0 ? JSON.parse(r.stdout) : [];
    item = { ...item, asset: urls.find((u) => /~orig\.(jpe?g|png)$/i.test(u)) || urls.find((u) => /~large\.(jpe?g|png)$/i.test(u)) || null };
    if (!item.asset) throw new Error('NASA manifest has no image');
  }
  // a Commons SVG (a logo) is fetched as the 1280 px PNG Commons renders of it
  const svg = item.asset && item.asset.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(\w)\/(\w\w)\/([^?]+\.svg)/i);
  if (svg) item = { ...item, asset: `https://upload.wikimedia.org/wikipedia/commons/thumb/${svg[1]}/${svg[2]}/${svg[3]}/1280px-${svg[3]}.png` };
  // a news photo's address often has no extension: fetch it and name it by what it is
  if (item.source === 'news-photo' && item.asset && !/\.(jpe?g|png|webp|tiff?)(\?|$)/i.test(item.asset)) {
    const raw = path.join(dir, 'source.bin');
    const r = spawnSync('curl', ['-sSL', '--fail', '-A', 'Mozilla/5.0 (A1RecipeBoard research)', '-o', raw, item.asset], { timeout: 120000 });
    if (r.status !== 0) throw new Error(`download failed: ${item.asset}`);
    const head = fs.readFileSync(raw).subarray(0, 12);
    const ext = head[0] === 0xff ? 'jpg' : head[0] === 0x89 ? 'png' : head.toString('latin1', 8, 12) === 'WEBP' ? 'webp' : null;
    if (!ext) throw new Error('news photo is not an image');
    const file = path.join(dir, `source.${ext}`);
    fs.renameSync(raw, file);
    return { file, kind: 'image' };
  }
  if (item.asset && /\.(jpe?g|png|webp|tiff?)(\?|$)/i.test(item.asset)) {
    const ext = item.asset.match(/\.(jpe?g|png|webp|tiff?)/i)[1].toLowerCase();
    const file = path.join(dir, `source.${ext}`);
    const r = spawnSync('curl', ['-sSL', '--fail', '-A', 'A1RecipeBoard/1.0 (research)', '-o', file, item.asset], { timeout: 120000 });
    if (r.status !== 0) throw new Error(`download failed: ${item.asset}`);
    return { file, kind: 'image' };
  }
  // a stock library's video: its file, fetched as it is
  if (item.source === 'stock' && item.asset && !/\.(jpe?g|png|webp|tiff?)(\?|$)/i.test(item.asset)) {
    const file = path.join(dir, 'source.mp4');
    if (!fs.existsSync(file)) { const r = spawnSync('curl', ['-sSL', '--fail', '-o', file, item.asset], { timeout: 300000 }); if (r.status !== 0) throw new Error(`download failed: ${item.asset}`); }
    fs.writeFileSync(path.join(dir, 'source.window.json'), JSON.stringify(item.segment || null));
    return { file, kind: 'video', client: 'stock' };
  }
  // Video only (cuts are silent). The embedded web client serves 1080p without a PO token; others are
  // fallbacks. The proxy is passed explicitly so ffmpeg (used for --download-sections) goes through it
  // too: stream URLs are bound to the proxy's exit address.
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || null;
  const base = ['--quiet', '--no-warnings', '--no-playlist', '--no-part', ...(proxy ? ['--proxy', proxy] : []),
    '-f', 'bv*[height<=1080][ext=mp4]/bv*[height<=1080]/b[height<=1080]', '-o', path.join(dir, 'source.%(ext)s')];
  if (item.segment) base.push('--download-sections', `*${item.segment[0]}-${item.segment[1]}`);
  // YouTube may ask an address to sign in; with the user's go-ahead a run passes their browser's session
  // (A1_YTDLP_COOKIES_BROWSER=chrome). Never on by default; the cookies are read by yt-dlp and not stored.
  if (process.env.A1_YTDLP_COOKIES_BROWSER) base.push('--cookies-from-browser', process.env.A1_YTDLP_COOKIES_BROWSER);
  // Already downloaded (re-cutting an approved item): reuse the original in the library.
  // only when it was downloaded for the same window: a section cut for another window starts elsewhere
  // in the film, and its seconds would be counted from the wrong place (hupo-auto2 B31~1)
  const windowFile = path.join(dir, 'source.window.json');
  const sameWindow = JSON.stringify(item.segment || null) === (fs.existsSync(windowFile) ? fs.readFileSync(windowFile, 'utf8').trim() : 'null');
  const have = fs.readdirSync(dir).find((n) => n.startsWith('source.') && !n.endsWith('.part') && n !== 'source.window.json');
  if (have && sameWindow) return { file: path.join(dir, have), kind: 'video', client: 'cached' };
  const errors = [];
  for (const client of ['web_embedded', 'default', 'mweb']) {
    for (const n of fs.readdirSync(dir)) if (n.startsWith('source.')) fs.rmSync(path.join(dir, n));
    const r = spawnSync(YTDLP, [...base, '--extractor-args', `youtube:player_client=${client}`, item.url], { encoding: 'utf8', timeout: 900000, maxBuffer: 20 << 20 });
    const file = fs.readdirSync(dir).filter((n) => n.startsWith('source.') && !n.endsWith('.part') && n !== 'source.window.json').map((n) => path.join(dir, n))[0];
    if (r.status === 0 && file) { fs.writeFileSync(windowFile, JSON.stringify(item.segment || null)); return { file, kind: 'video', client }; }
    errors.push(`${client}: ${String(r.stderr).trim().split('\n').pop()}`);
  }
  throw new Error(`yt-dlp failed: ${errors.join(' | ').slice(-400)}`);
}

// Pick the `len` seconds that best match the need: scene cuts, one keyframe per scene, OpenCLIP
// similarity to the need's English description (main line workers). Falls back to the first long scene.
// (pure, tested) how far a clip's own move goes along with the reference's: 1 the same way, -1 against it, 0 standing or
// either too slight to tell (|log zoom| under MOVE_MIN)
export const MOVE_MIN = .01, MOVE_WEIGHT = .08;
export const motionAgree = (refZ, z) => { const a = Math.log(refZ), b = Math.log(z); return Math.abs(a) <= MOVE_MIN || Math.abs(b) <= MOVE_MIN ? 0 : Math.sign(a) === Math.sign(b) ? 1 : -1; };
// the reference's camera zoom over the sub-shot holding a moment of the film (its breakdown cards, on the film's clock)
function refZoomAt(cfg, id, t) {
  try { const root = path.join(projectPaths(cfg, id).root, 'out', 'passages');
    for (const seg of fs.readdirSync(root)) { const f = path.join(root, seg, 'breakdown', 'card.json'); if (!fs.existsSync(f)) continue; const s = (JSON.parse(fs.readFileSync(f, 'utf8')).subs || []).find((r) => t >= r.at && t < r.end); if (s?.camera?.zoom) return s.camera.zoom; }
  } catch {}
  return null;
}
const run0 = (py, args) => { const r = spawnSync(fs.existsSync(py) ? py : 'python3', args, { encoding: 'utf8', timeout: 180000 }); try { return r.status === 0 ? JSON.parse(r.stdout) : null; } catch { return null; } };
function pickRange(cfg, file, need, len, workDir, avoid = [], id = null) {
  const total = probeDuration(file);
  if (total <= len + 0.2) return { inS: 0, outS: total, basis: 'whole clip' };
  const run = (cmd, args, input) => {
    const r = spawnSync(cmd, args, { cwd: cfg.sourceRoot, input: JSON.stringify(input), encoding: 'utf8', timeout: 600000, maxBuffer: 20 << 20 });
    const line = String(r.stdout || '').trim().split('\n').reverse().find((l) => l.startsWith('{'));
    return r.status === 0 && line ? JSON.parse(line) : null;
  };
  const sc = run('/Users/a1/.local/bin/uv', ['run', '--quiet', '--with', 'scenedetect[opencv]==0.6.7.1', 'python', 'scripts/a1_scene_detect_worker.py'], { videoPath: file });
  let scenes = (sc?.scenes || []).filter((x) => x.endMs - x.startMs >= Math.min(len, 2) * 1000).slice(0, 40);
  if (!scenes.length) scenes = [{ startMs: 0, endMs: total * 1000 }];
  // A long take (or a scene detector that misses the cuts of old black-and-white film: the Sputnik newsreel came as 5
  // scenes and its launch pad sat inside one): every scene longer than two clips is sliced into clip-length windows,
  // so each moment of the footage has a frame to be judged
  {
    const step = len * 1000;
    scenes = scenes.flatMap((x) => {
      const n = (x.endMs - x.startMs) > 2 * step ? Math.max(1, Math.min(12, Math.floor((x.endMs - x.startMs) / step))) : 1;
      return Array.from({ length: n }, (_, i) => ({ startMs: x.startMs + i * step, endMs: n === 1 ? x.endMs : x.startMs + (i + 1) * step }));
    });
  }
  // the ranker takes 48 frames at most (a 3-minute news clip sliced into 63: the pick fell back to the longest scene, a
  // news anchor, for open-S11): evenly thinned to 48, every part of the clip still has a frame
  if (scenes.length > 48) scenes = Array.from({ length: 48 }, (_, i) => scenes[Math.floor(i * scenes.length / 48)]);
  const frames = scenes.map((x, i) => {
    const at = (x.startMs + x.endMs) / 2000;
    const img = path.join(workDir, `key-${String(i).padStart(2, '0')}.png`);
    spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', img]);
    return { id: `k${i}`, imagePath: path.relative(cfg.sourceRoot, img), sha256: shaFile(img), scene: x };
  });
  const query = need.clip || need.youtube?.[0] || need.original;
  const rr = run(path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python'), ['scripts/a1_external_source_tools.py'],
    { contract: 'A1ExternalSourceToolRequest/v1', operation: 'semantic-rerank', query, candidates: frames.map(({ id, imagePath, sha256 }) => ({ id, imagePath, sha256 })) });
  // CLIP is drawn to frames whose printed text matches the query (title cards, captions, slides),
  // and our own text will sit on this footage: penalise frames by OCR text coverage (macOS Vision).
  const ocr = spawnSync('swift', [path.join(path.dirname(new URL(import.meta.url).pathname), 'textcover.swift'), ...frames.map((f) => path.join(cfg.sourceRoot, f.imagePath))], { encoding: 'utf8', timeout: 300000 });
  const textCover = new Map(ocr.status === 0 ? JSON.parse(ocr.stdout).map((x, i) => [frames[i].id, Math.min(0.2, x.coverage * 2 + (x.chars > 12 ? 0.05 : 0))]) : []);
  // the reference film's frame at the shot's moment, when there is one: the segment most like it is the one the shot
  // wants (the text alone picked a grey Earth limb from the Sputnik newsreel; the reference shows a rocket on its pad:
  // meta-S6). Image likeness and the text are added, the text's caption penalty kept
  let refRank = null;
  { const p = id ? loadProject(cfg, id) : null;
    const video = p?.sourceVideo ? sourcePath(cfg, p.sourceVideo) : null;
    if (video && fs.existsSync(video) && need.refAt != null) {
      const ref = path.join(workDir, 'ref.png'); spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-ss', String(need.refAt), '-i', video, '-frames:v', '1', '-vf', 'scale=640:-2', ref]);
      if (fs.existsSync(ref)) refRank = run(path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python'), ['scripts/a1_external_source_tools.py'],
        { contract: 'A1ExternalSourceToolRequest/v1', operation: 'semantic-rerank', queryImage: path.relative(cfg.sourceRoot, ref), candidates: frames.map(({ id, imagePath, sha256 }) => ({ id, imagePath, sha256 })) });
    } }
  const like = new Map((refRank?.ranking || []).map((x) => [x.id, x.cosineScore]));
  const scores = new Map((rr?.ranking || []).map((x) => [x.id, x.cosineScore - (textCover.get(x.id) ?? 0) + (like.size ? (like.get(x.id) ?? 0) - 0.5 : 0)]));
  // seconds another shot already cut from this same video are left to it (a motif that returns comes back
  // as another moment of the footage, not the same four seconds: clara-auto B13/B18/B36)
  const clash = (f) => avoid.some(([a, b]) => f.scene.startMs / 1000 < b && f.scene.endMs / 1000 > a);
  const pool = frames.filter((f) => !clash(f)).length ? frames.filter((f) => !clash(f)) : frames;
  // (and footage that moves as the reference moves at the moment: of the segments ranked best, each one's own move read
  // over the stretch it would be cut to — a push into it, a pull out of it — against the reference's camera there (the
  // card's measure); one that runs the other way gives place to one that goes along: the motion parity audit of
  // 2026-10-26 found most out-of-tolerance pushes in b-roll whose own move ran against the reference's)
  const refZ = id && need.refAt != null ? refZoomAt(cfg, id, need.refAt) : null;
  if (refZ && Math.abs(Math.log(refZ)) > MOVE_MIN && scores.size) {
    const top = [...pool].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)).slice(0, 6);
    const cut = (f) => { const mid = (f.scene.startMs + f.scene.endMs) / 2000, a = Math.max(f.scene.startMs / 1000, Math.min(mid - len / 2, f.scene.endMs / 1000 - len)); return { file, t0: a + .1, t1: Math.min(f.scene.endMs / 1000, a + len) - .1 }; };
    const mv = run0(path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python'), [path.join(path.dirname(new URL(import.meta.url).pathname), 'clipmotion.py'), JSON.stringify(top.map(cut))]);
    top.forEach((f, i) => { const z = mv?.[i]?.zoom; if (!(z > 0)) return; scores.set(f.id, (scores.get(f.id) ?? 0) + MOVE_WEIGHT * motionAgree(refZ, z)); });
  }
  const best = [...pool].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || (b.scene.endMs - b.scene.startMs) - (a.scene.endMs - a.scene.startMs))[0];
  const mid = (best.scene.startMs + best.scene.endMs) / 2000;
  const inS = Math.max(best.scene.startMs / 1000, Math.min(mid - len / 2, best.scene.endMs / 1000 - len));
  const scored = rr?.status === 'PASS';
  const best_score = scores.get(best.id) ?? 0;
  return { inS: +inS.toFixed(3), outS: +Math.min(total, inS + len).toFixed(3), basis: scored ? `openclip "${query}"${like.size ? ' + likeness to the reference frame' : ''} ${best_score.toFixed(3)} best of ${scenes.length} scenes` : `longest scene of ${scenes.length} (semantic pick failed: ${rr?.failures?.[0] || 'no result'})`, scenes: scenes.length,
    // Below ~0.25 the footage probably does not show what the need describes (e.g. a misleading thumbnail).
    weak: !scored || best_score < WEAK_MATCH };
}

// Labels and historical batches do not establish identity. Only our automatic path records its mechanism.
const selectionStatus = (batch) => batch.selection?.status === 'SYSTEM_SELECTED' ? 'SYSTEM_SELECTED' : 'UNKNOWN';
function writeAcquisitionReceipt(file, receipt) {
  for (let n = 0; ; n++) {
    const target = n ? file.replace(/\.receipt\.json$/, `.${n}.receipt.json`) : file;
    try { fs.writeFileSync(target, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' }); return target; }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
}

export async function fetchApproved(cfg, id, { batchId = null, log = () => {}, lockOwner = null } = {}) {
  const { materialsLock, ownsMaterialsLock } = await import('./shotplan.mjs');
  if (lockOwner && !ownsMaterialsLock(lockOwner, cfg, id)) throw new Error('invalid materials lock owner');
  const release = lockOwner ? null : await materialsLock(cfg, id, log);
  try { return await fetchApprovedLocked(cfg, id, { batchId, log }); }
  finally { if (release) release(); }
}
async function fetchApprovedLocked(cfg, id, { batchId, log }) {
  if (!fs.existsSync(LIBRARY)) throw new Error(`material library not mounted: ${LIBRARY}`);
  const dir = materialsDir(cfg, id);
  const needsFile = path.join(dir, 'needs.json');
  const approvalsFile = path.join(dir, 'approvals.json');
  const bindingsFile = path.join(dir, 'bindings.json');
  const files = [needsFile, approvalsFile, bindingsFile, path.join(dir, 'candidates.json')];
  const bytes = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  let snapshot = files.map(bytes);
  const { needs = [] } = snapshot[0] === null ? {} : JSON.parse(snapshot[0]);
  // find() below must never silently select one of two different requests for the
  // same ledger key. Refuse before acquisition or ledger writes, preserving history.
  const keys = needs.map(needKey);
  const duplicates = [...new Set(keys.filter((key, i) => keys.indexOf(key) !== i))];
  if (duplicates.length) throw new Error(`material fetch blocked: duplicate need key: ${duplicates.join(', ')}`);
  const approvals = snapshot[1] === null ? { batches: [] } : JSON.parse(snapshot[1]);
  const bindings = snapshot[2] === null ? { contract: 'A1RecipeBoardMaterialBindings/v1', shots: {} } : JSON.parse(snapshot[2]);
  // Optimistic detection only: uncoordinated writers can still race this check.
  // Multi-file ledger writes are not a crash-atomic transaction.
  const checkSnapshot = () => {
    if (files.some((file, i) => bytes(file) !== snapshot[i])) {
      const error = new Error('material fetch conflict: concurrent ledger change; retry after reconciliation');
      error.code = 'MATERIAL_FETCH_CONFLICT';
      throw error;
    }
  };
  // Compute while holding the cooperative project lock, then verify our snapshot.
  const stale = new Set(changedNeeds(cfg, id));
  checkSnapshot();
  const batches = approvals.batches.filter((b) => !batchId || b.id === batchId);
  // Progress is written after every item; never retry a conflict with the old objects.
  const save = () => {
    checkSnapshot();
    fs.writeFileSync(approvalsFile, JSON.stringify(approvals, null, 1) + '\n');
    snapshot[1] = bytes(approvalsFile);
    checkSnapshot();
    fs.writeFileSync(bindingsFile, JSON.stringify(bindings, null, 1) + '\n');
    snapshot[2] = bytes(bindingsFile);
  };
  for (const batch of batches) {
    // a retry only while the cut is still waiting (a later confirmation may already have filled it)
    for (const item of batch.items.filter((i) => i.status === 'approved' || (retryable(i) && !bindings.shots[i.shotId]))) {
      if (stale.has(item.shotId)) { log(`${item.shotId}: stale need, preserved and skipped`); continue; }
      const need = needs.find((n) => needKey(n) === item.shotId);
      // the cut this was confirmed for no longer exists (the shot was rewritten with fewer cuts)
      if (!need) { item.status = 'orphaned'; item.orphanedAt = new Date().toISOString(); log(`${item.shotId}: no such cut any more, skipped`); save(); continue; }
      // New articles have no reference timing: take about 4 seconds.
      const len = need.range ? Math.max(2.5, need.range[1] - need.range[0] + 0.5) : 4;
      const previousBinding = bindings.shots[item.shotId];
      try {
        if (!item.segment && item.source === 'youtube' && (item.duration ?? 0) > WHOLE_DOWNLOAD_LIMIT) {
          item.status = 'needs-segment';
          log(`${item.shotId} needs seconds: ${Math.round(item.duration)}s video, give a range on the page`);
          save();
          continue;
        }
        const key = `${slug(item.publisher || item.source)}-${slug(item.title)}-${crypto.createHash('sha256').update(item.url).digest('hex').slice(0, 8)}`;
        if (item.source === 'web') {
          if (['photo', 'video'].includes(need.form)) { log(`${item.shotId} rejected: web page is not verified ${need.form}`); continue; }
          const pageBinding = await archivePage(cfg, id, item, need, key, batch, log);
          checkSnapshot();
          bindings.shots[item.shotId] = pageBinding;
          item.status = 'fetched';
          save();
          continue;
        }
        const srcDir = path.join(LIBRARY, 'sources', item.rights, key);
        const got = download(item, srcDir);
        if (!fs.existsSync(got.file)) throw new Error(`material source missing: ${got.file}`);
        if (['photo', 'video'].includes(need.form)) {
          const actual = actualMedia(got.file), expected = need.form === 'photo' ? 'image' : 'video';
          if (actual !== expected || got.kind !== actual) { log(`${item.shotId} rejected: expected ${expected}, actual ${actual}, acquisition kind ${got.kind}; approval and binding retained`); continue; }
          got.kind = actual;
        }
        const srcSha = shaFile(got.file);
        const offset = item.segment && got.kind === 'video' ? item.segment[0] : 0;
        let range = null;
        let pick = null;
        const clipName = `${id}-${item.shotId}-${key}-${crypto.randomUUID()}`;
        let cut;
        if (got.kind === 'image') {
          cut = path.join(LIBRARY, 'clips', 'review', `${clipName}${path.extname(got.file)}`);
          fs.mkdirSync(path.dirname(cut), { recursive: true });
          fs.copyFileSync(got.file, cut, fs.constants.COPYFILE_EXCL);
        } else {
          // Keyframes must sit inside the repo: the main line's OpenCLIP worker refuses outside paths.
          const work = path.join(projectPaths(cfg, id).out, 'material-pick', item.shotId);
          fs.rmSync(work, { recursive: true, force: true });
          fs.mkdirSync(work, { recursive: true });
          const avoid = Object.entries(bindings.shots).filter(([k, b]) => k !== item.shotId && b.url === item.url && b.range).map(([, b]) => b.range);
          pick = pickRange(cfg, got.file, need, len, work, avoid, id);
          range = [pick.inS, pick.outS];
          cut = path.join(LIBRARY, 'clips', 'review', `${clipName}.mp4`);
          fs.mkdirSync(path.dirname(cut), { recursive: true });
          const encoded = spawnSync(FFMPEG, ['-loglevel', 'error', '-n', '-ss', String(range[0]), '-to', String(range[1]), '-i', got.file, '-an', '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=60', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', cut]);
          if (encoded.status !== 0) throw new Error(`ffmpeg cut failed: ${String(encoded.stderr || encoded.error || '').slice(0, 300)}`);
        }
        if (['photo', 'video'].includes(need.form) && actualMedia(cut) !== got.kind) {
          fs.rmSync(cut, { force: true });
          log(`${item.shotId} rejected: output media could not be verified; approval and binding retained`);
          continue;
        }
        // a stock site's preview carries its watermark across the picture: refuse it (hupo-auto2 B31)
        const mark = watermarkOf(cut, got.kind);
        if (mark) throw new Error(`watermarked: "${mark}" on the picture; pick another candidate`);
        // a picture whose own signs name another place is of another place (B29: 泉州市安平高氏宗祠 for Qingcheng's hall)
        const elsewhere = got.kind !== 'video' && need ? placeConflictOf(cut, need) : null;
        if (elsewhere) throw new Error(`another place: "${elsewhere}" on the picture, the need is ${need.entity || need.original}; pick another candidate`);
        checkSnapshot();
        const receipt = {
          contract: 'A1RecipeBoardMaterialAcquisitionReceipt/v1', version: 1, status: 'RECORDED',
          selection: { status: selectionStatus(batch) },
          source: { path: got.file, sha256: srcSha, url: item.url, title: item.title, publisher: item.publisher },
          output: { path: cut, sha256: shaFile(cut), bytes: fs.statSync(cut).size, durationMs: got.kind === 'video' ? Math.round(probeDuration(cut) * 1000) : null },
          // Times are in the original video; a user window only limits what was downloaded.
          range: range ? { inMs: Math.round((offset + range[0]) * 1000), outMs: Math.round((offset + range[1]) * 1000), basis: item.segment ? `${pick.basis}, inside user window ${item.segment.join('-')}s` : pick.basis } : null,
          rights: { status: 'UNKNOWN', clearance: 'NOT_ASSESSED', type: item.rights, label: item.rightsLabel, attribution: `${item.publisher || item.source} · ${item.url}` },
          approval: { batch: batch.id, approvedAt: batch.approvedAt, confirmedBy: batch.confirmedBy, note: item.note },
          use: { project: id, shotId: item.shotId },
        };
        fs.mkdirSync(path.join(LIBRARY, 'receipts'), { recursive: true });
        const receiptFile = writeAcquisitionReceipt(path.join(LIBRARY, 'receipts', `${path.basename(cut)}.receipt.json`), receipt);
        // Local copy so renders do not depend on the NAS being mounted.
        const local = path.join(dir, 'clips', path.basename(cut));
        fs.mkdirSync(path.dirname(local), { recursive: true });
        fs.copyFileSync(cut, local, fs.constants.COPYFILE_EXCL);
        checkSnapshot();
        bindings.shots[item.shotId] = { needPrint: needPrint(need), kind: got.kind, weakMatch: !!pick?.weak, role: item.role || null, file: local, library: cut, receipt: receiptFile, range, credit: item.publisher || SOURCE_NAMES[item.source] || item.source, url: item.url, rights: item.rightsLabel, batch: batch.id };
        item.status = 'fetched';
        save();
        if (pick?.weak) log(`${item.shotId} WEAK MATCH: check this footage by eye`);
        log(`${item.shotId} ${got.kind} ${range ? `${(offset + range[0]).toFixed(2)}–${(offset + range[1]).toFixed(2)}s (${receipt.range.basis})` : ''} -> ${cut}`);
      } catch (e) {
        if (e.code === 'MATERIAL_FETCH_CONFLICT') throw e;
        checkSnapshot();
        if (previousBinding === undefined) delete bindings.shots[item.shotId]; else bindings.shots[item.shotId] = previousBinding;
        // a site that will not serve its page to the capture is remembered and ranked last from now on
        if (item.source === 'web' && /bot check|paywall|blank/.test(String(e.message || e))) rememberBlockedHost(cfg, item.url, String(e.message || e));
        item.status = 'failed';
        item.attempts = (item.attempts || 0) + 1;
        item.error = String(e.message || e).slice(0, 300);
        save();
        log(`${item.shotId} failed: ${item.error}`);
      }
    }
  }
  checkSnapshot();
  return bindings;
}
export function rememberBlockedHost(cfg, url, why) {
  const file = path.join(cfg.dataDir, 'routing', 'blocked-hosts.json');
  const d = readJson(file, { contract: 'A1RecipeBoardBlockedHosts/v1', hosts: {} });
  let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return; }
  if (d.hosts[host]) return;
  d.hosts[host] = { reason: /bot check|paywall/.test(why) ? 'bot check or paywall' : 'blank page', at: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
}
// (pure) the Internet Archive's copy of a page, nearest to now, its own toolbar left out
export const waybackUrl = (url) => `https://web.archive.org/web/2if_/${url}`;
// A confirmed web page: capture it into the library (sources/web/<key>/), copy the screenshot as the cut,
// write a receipt with URL and capture time, keep the text locally for the facts step.
async function archivePage(cfg, id, item, need, key, batch, log) {
  const { capturePage } = await import('./page-capture.mjs');
  const srcDir = path.join(LIBRARY, 'sources', 'web', key);
  const have = path.join(srcDir, 'archive.json');
  const { englishNumbers } = await import('./page-capture.mjs');
  const en = englishQuery(cfg, id, need);
  const terms = [...new Set([...(need.page?.keywords || []), ...(need.page?.entities || []), ...englishNumbers(need.line || '')])].filter(Boolean).slice(0, 12);
  // an archive that found neither the sentence nor any term (an English page read with Chinese words) is read again
  const candidates = [have, ...(fs.existsSync(srcDir) ? fs.readdirSync(srcDir, {withFileTypes:true}).filter(d => d.isDirectory() && d.name.startsWith('capture-')).map(d => path.join(srcDir, d.name, 'archive.json')) : [])];
  const records = candidates.flatMap(file => { try { return [JSON.parse(fs.readFileSync(file, 'utf8'))]; } catch { return []; } });
  const found = (r) => r && (r.places?.__line?.length || Object.entries(r.places || {}).some(([k, v]) => k !== '__line' && v.length));
  const { isBlockedPage: blocked, CAPTURE_VERSION } = await import('./page-capture.mjs');
  // a screenshot cut short on the NAS (not a whole PNG) is captured again too
  const wholePng = (f) => { try { const b = fs.readFileSync(f); return b.length > 1000 && b.slice(1, 4).toString() === 'PNG' && b.slice(-8, -4).toString() === 'IEND'; } catch { return false; } };
  const opts = { highlight: terms, line: need.line || '', lineEn: [en, ...englishNumbers(need.line || '')].filter(Boolean).join(' ') };
  const freshCapture = async url => {
    fs.mkdirSync(srcDir, {recursive:true});
    return capturePage(url, fs.mkdtempSync(path.join(srcDir, 'capture-')), opts);
  };
  let rec = records.find(old => found(old) && !blocked(old) && (old.captureVersion || 1) >= CAPTURE_VERSION && wholePng(old.files?.fullPage)) || await freshCapture(item.url);
  // the publisher's own page behind a bot check (Reuters, SCMP, AP turned the headless browser away, and the line fell
  // back to blogs retelling them): the Internet Archive's copy of the same page, without its toolbar (if_); the
  // receipt keeps the publisher's address and says it came through the archive
  if (blocked(rec) && !/web\.archive\.org/.test(item.url)) {
    try { const via = await freshCapture(waybackUrl(item.url)); if (!blocked(via)) { rec = { ...via, viaArchive: waybackUrl(item.url) }; log(`${item.shotId} the publisher blocked the capture; captured the Internet Archive's copy (${rec.viaArchive})`); } } catch { /* the archive has no copy: the block stands */ }
  }
  const version = crypto.randomUUID();
  const cut = path.join(LIBRARY, 'clips', 'review', `${id}-${item.shotId}-${key}-${version}.png`);
  fs.mkdirSync(path.dirname(cut), { recursive: true });
  // the still shows one screen of the page around the line that matters; the full page stays in the archive
  const { readingCrop } = await import('./page-capture.mjs');
  // written locally first and checked, then copied: a crop written straight onto the NAS was read back half-written
  const tmp = path.join(projectPaths(cfg, id).out, 'page-crops', `${item.shotId}-${version}.png`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  // readingWindow / readingCrop pick the narration-like sentence, then a number; a shot director's request (need.module)
  // names what the page must show (a report's title first), which leads: the narration of h800-S2 ("2022年…") found
  // the page's date and the crop showed the footer
  const prefer = need.module ? (need.page?.entities || []) : [];
  const crop = readingCrop(rec, { prefer, out: tmp, rows: need.module === 'article' ? 2160 : 720 });
  // a page that loaded nothing (a login wall, a blocked site) is a failed capture, not material
  const { isBlockedPage } = await import('./page-capture.mjs');
  if (isBlockedPage(rec)) throw new Error(`${item.shotId}: the site served a bot check or paywall, not the page (${item.url})`);
  // the reading window (the text column around the sentence) is what goes on screen: it must not be blank;
  // the older full-width crop may be (the top of a page whose header is hidden), and then the window stands in
  const { readingWindow } = await import('./page-capture.mjs');
  const winTmp = path.join(projectPaths(cfg, id).out, 'page-crops', `${item.shotId}-${version}-window.png`);
  const win = readingWindow(rec, { prefer, out: winTmp });
  const { isBlankImage } = await import('./resolve.mjs');
  if (isBlankImage(winTmp)) throw new Error(`${item.shotId}: the captured page is blank (${item.url})`);
  if (isBlankImage(tmp)) fs.copyFileSync(winTmp, tmp);
  fs.copyFileSync(tmp, cut, fs.constants.COPYFILE_EXCL);
  if (shaFile(tmp) !== shaFile(cut)) throw new Error(`${item.shotId}: the page crop did not copy intact to the library`);
  const receipt = {
    contract: 'A1RecipeBoardMaterialAcquisitionReceipt/v1', version: 1, status: 'RECORDED',
          selection: { status: selectionStatus(batch) },
    source: { path: rec.files.fullPage, sha256: rec.sha256.fullPage, url: item.url, finalUrl: rec.finalUrl, title: rec.title || item.title, publisher: item.publisher, capturedAt: rec.capturedAt, text: rec.files.text, textSha256: rec.sha256.text },
    output: { path: cut, sha256: shaFile(cut), bytes: fs.statSync(cut).size, durationMs: null },
    range: null,
    rights: { status: 'UNKNOWN', clearance: 'NOT_ASSESSED', type: 'news', label: item.rightsLabel, attribution: `${item.publisher || ''} · ${item.url}${rec.viaArchive ? ` · 经互联网档案馆 ${rec.viaArchive}` : ''} · 截图于 ${rec.capturedAt}` },
    approval: { batch: batch.id, approvedAt: batch.approvedAt, confirmedBy: batch.confirmedBy, note: item.note },
    use: { project: id, shotId: item.shotId },
  };
  fs.mkdirSync(path.join(LIBRARY, 'receipts'), { recursive: true });
  const receiptFile = writeAcquisitionReceipt(path.join(LIBRARY, 'receipts', `${path.basename(cut)}.receipt.json`), receipt);
  // local copies: the screenshot to bind, the text and archive record for the facts step
  const dir = materialsDir(cfg, id);
  const local = path.join(dir, 'clips', path.basename(cut));
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.copyFileSync(cut, local, fs.constants.COPYFILE_EXCL);
  const winLocal = path.join(dir, 'clips', path.basename(cut).replace(/\.png$/, '-window.png'));
  fs.copyFileSync(winTmp, winLocal, fs.constants.COPYFILE_EXCL);
  const textLocal = path.join(dir, 'sources', `${item.shotId}-${version}.txt`);
  fs.mkdirSync(path.dirname(textLocal), { recursive: true });
  fs.copyFileSync(rec.files.text, textLocal, fs.constants.COPYFILE_EXCL);
  log(`${item.shotId} web page archived ${rec.finalUrl} (${rec.capturedAt}) -> ${cut}`);
  return { needPrint: needPrint(need), kind: 'image', weakMatch: false, role: 'page', file: local, library: cut, receipt: receiptFile, range: null, credit: item.publisher || 'web', url: item.url, rights: item.rightsLabel, batch: batch.id,
    archive: { url: item.url, finalUrl: rec.finalUrl, title: rec.title, capturedAt: rec.capturedAt, text: textLocal, marks: rec.marks, pageHeight: rec.pageHeight, fullPage: rec.files.fullPage, readAt: crop.at, readTop: crop.top,
      window: { file: winLocal, at: win.at, scale: win.scale, boxes: win.boxes, sentence: win.sentence, term: win.term, paper: win.paper, version: win.version } } };
}

// a stock library's mark on a picture (read by the index's OCR): its name, its slogan, a price tag (B80: "artefacti
// BRINGING MOTION TO IDEAS 1,00 €" over a researcher; the line kept it as a stand-in)
export const STOCK_MARK = /(shutterstock|adobe ?stock|getty ?images|istock|alamy|dreamstime|depositphotos|123rf|pond5|storyblocks|envato|motion ?array|artefacti|bringing motion|videoblocks|stock ?footage ?provided|preview only|\d+[.,]\d{2} ?€|€ ?\d+[.,]\d{2})/i;
// The page a material file was captured from: a derived cut's .from.json names it (or the file it was cut from), else
// the approval that fetched it (its shot id in the file name, its host in the slug).
export function pageUrlOf(cfg, id, file) {
  const abs = path.isAbsolute(file) ? file : path.join(cfg.sourceRoot, file), from = `${abs}.from.json`;
  if (fs.existsSync(from)) { const src = String(readJson(from, {}).source || ''), u = src.match(/https?:\/\/\S+/); if (u) return u[0].replace(/[),.]+$/, ''); const f = src.match(/[\w~.-]+\.(png|jpe?g)/); if (f && f[0] !== path.basename(abs)) return pageUrlOf(cfg, id, path.join(path.dirname(abs), f[0])); }
  const base = path.basename(abs).toLowerCase(), items = (readJson(path.join(materialsDir(cfg, id), 'approvals.json'), { batches: [] }).batches || []).flatMap((b) => b.items || []);
  const slug = (u) => { try { return new URL(u).host.replace(/^www\./, '').replace(/\./g, '-').toLowerCase(); } catch { return null; } };
  const hit = items.filter((x) => x.url && base.includes(`-${String(x.shotId).toLowerCase()}-`) && slug(x.url) && base.includes(slug(x.url))).pop()
    || items.filter((x) => x.url && slug(x.url) && base.includes(slug(x.url))).pop();
  return hit?.url || null;
}
// (pure on its inputs) the pages a spec shows that are no report's source (routing/news-outlets.json notSources: a blog, a
// self-media account, a community): the plan is refused and the director asks for the report itself (user 2026-10-23:
// 对标找到很正式很好 你为什么从博客截呢)
export function notSourceErrors(cfg, id, spec) {
  const pats = (readJson(path.join(cfg.dataDir, 'routing', 'news-outlets.json'), {}).notSources?.patterns || []).map((x) => new RegExp(x, 'i'));
  const files = [...new Set(JSON.stringify(spec).match(/work\/recipe-board-v1\/projects\/[^"]+?\/materials\/clips\/[^"]+?\.(?:png|jpe?g|mp4|mov|webm)/g) || [])], out = [];
  // (and a stock library's watermark read on a picture or a clip by the index: never shown, stand-in or not)
  const idx = readJson(path.join(materialsDir(cfg, id), 'index.json'), { files: {} }).files || {};
  for (const f of files) { const e = idx[f], w = e && e.kind !== 'page' && String(e.text || '').match(STOCK_MARK); if (w) out.push(`${path.basename(f)} carries a stock library's watermark or price tag ("${w[0]}"): ask for a clean picture`); }
  for (const f of files) { const u = pageUrlOf(cfg, id, f); if (u && pats.some((re) => re.test(u.replace(/^https?:\/\//, '')))) out.push(`${path.basename(f)} is a page of ${new URL(u).host}, a blog, self-media or community page and no report's source: ask for the report itself (its outlet, the official page; the reference's own headline first)`); }
  return out;
}
// Archived source texts a shot may trace numbers to: every web page the project archived (the user
// confirmed it, it was captured with URL and time), this shot's own first. One entry per URL.
export function sourceTextsFor(cfg, id, shotId) {
  const { shots = {} } = readJson(path.join(materialsDir(cfg, id), 'bindings.json'), {});
  const own = (k) => k === shotId || k.startsWith(`${shotId}~`);
  const seen = new Set();
  return Object.entries(shots).filter(([, b]) => b.archive?.text && fs.existsSync(b.archive.text)).sort(([a], [b]) => Number(own(b)) - Number(own(a)))
    .filter(([, b]) => !seen.has(b.archive.url) && seen.add(b.archive.url))
    .map(([, b]) => ({ url: b.archive.url, capturedAt: b.archive.capturedAt, title: b.archive.title, text: fs.readFileSync(b.archive.text, 'utf8') }));
}
// Sentences with numbers from the archived pages, for the writer (what a data card may cite).
export function archivedFigures(cfg, id, { max = 12 } = {}) {
  return sourceTextsFor(cfg, id, '').flatMap((s) => s.text.split(/(?<=[。！？\n])/).map((x) => x.trim()).filter((x) => /\d/.test(x) && x.length >= 8 && x.length <= 160)
    .slice(0, max).map((sentence) => ({ url: s.url, capturedAt: s.capturedAt, sentence })));
}

const SOURCE_NAMES = { youtube: 'YouTube', wikimedia_commons: 'Wikimedia Commons', internet_archive: 'Internet Archive', nasa_images: 'NASA' };

// Turn fetched material into shots on the footage-plate card (one per need), with source credit.
// Reading windows cut by an older rule are cut again from the archived full page (no new capture): the
// binding gets the new window, and the shots that read it are bound again. Returns the needs refreshed.
export async function refreshReadingWindows(cfg, id, { log = () => {}, only = null } = {}) {
  const { readingWindow, READ_WINDOW_VERSION } = await import('./page-capture.mjs');
  const file = path.join(materialsDir(cfg, id), 'bindings.json');
  const all = readJson(file, null);
  const stale = new Set(changedNeeds(cfg, id));
  const selected = only ? new Set(only) : null;
  const done = [];
  for (const [k, b] of Object.entries(all?.shots || {})) {
    if (selected && !selected.has(k) && !selected.has(k.split('~')[0])) continue;
    if (stale.has(k)) { log(`${k}: stale material need; reading window skipped`); continue; }
    const w = b.archive?.window;
    if (!w || (w.version || 1) >= READ_WINDOW_VERSION) continue;
    const recFile = path.join(path.dirname(b.archive.fullPage || ''), 'archive.json');
    if (!fs.existsSync(recFile)) continue;
    const win = readingWindow(JSON.parse(fs.readFileSync(recFile, 'utf8')), { out: w.file, prefer: w.term ? [w.term] : [] });
    b.archive.window = { file: w.file, at: win.at, scale: win.scale, boxes: win.boxes, sentence: win.sentence, term: win.term, paper: win.paper, version: win.version };
    done.push(k);
  }
  if (done.length) { fs.writeFileSync(file, JSON.stringify(all, null, 1) + '\n'); log(`reading windows cut again (text column only): ${done.join(',')}`); }
  return done;
}

const PRESENTER_BACKGROUND = new Set(['presenter-side-card', 'presenter-tags', 'product-side-card', 'presenter-plain', 'poster-pair', 'presenter-quotes']);
// the beats a chapter module draws (the storyboard's morph-chapter card)
export const chapterBeats = (cfg, id) => new Set((readJson(path.join(projectPaths(cfg, id).root, 'storyboard.json'), {}).shots || []).filter((s) => s.card === 'morph-chapter').map((s) => s.beat));
export function bindShots(cfg, id, { log = () => {}, only = null } = {}) {
  const dir = materialsDir(cfg, id);
  const { needs } = readMaterials(cfg, id);
  const { shots = {} } = readJson(path.join(dir, 'bindings.json'), {});
  const shotsDir = path.join(projectPaths(cfg, id).root, 'shots');
  const made = [];
  const stale = new Set(changedNeeds(cfg, id));
  for (const need of needs) {
    if (only && !only.has(need.shotId)) continue;
    if (stale.has(needKey(need))) { log(`${needKey(need)}: stale material need; binding skipped`); continue; }
    // a shot director's request (shotplan.mjs): fetched into materials/clips for the index, never bound into a shot
    if (need.module) continue;
    const b = shots[needKey(need)];
    if (!b) continue;
    if (!bindingMatchesForm(need, b)) { log(`${needKey(need)}: binding does not match requested media form`); continue; }
    // a chapter beat's picture is its chapter module's (it shows the material itself, IMG.m_<beat>): binding it into the
    // shot replaced the chapter's slice with a still (paperclip-138-full B47 B51, 2026-10-25)
    if (chapterBeats(cfg, id).has(need.shotId)) continue;
    // Logos (library role 'logo') sit whole inside the slot and are never stretched into a background.
    const isLogo = b.role === 'logo';
    if (isLogo && need.bind === 'background') {
      // only the cut that asked for it, and a presenter cut keeps the presenter (it was wiped to a TODO
      // across the whole shot before, B05 / B49)
      const file = path.join(shotsDir, `${need.shotId}.json`);
      const shot = JSON.parse(fs.readFileSync(file, 'utf8'));
      const presenter = loadProject(cfg, id).presenter;
      const k = need.scene || 0;
      const target = shot.scenes?.length ? shot.scenes[k] : shot;
      const card = target?.recipe || shot.recipe;
      // any other card (a title over the cut) goes over the presenter, blurred and darkened
      const keep = presenter && PRESENTER_BACKGROUND.has(card) ? presenter : presenter ? { ...presenter, blur: 6, darken: 0.45 } : { gen: need.original };
      if (target?.slots?.background) target.slots.background = keep;
      if (k === 0 && shot.slots?.background) { shot.slots.background = keep; shot.backdrop = undefined; }
      fs.writeFileSync(file, JSON.stringify(shot, null, 1) + '\n');
      log(`${needKey(need)}: logo not used as a background (${keep.gen ? 'left as TODO' : 'presenter kept'})`);
      continue;
    }
    // need.look carries per-shot treatment (zoom past a logo, darken, blur, push) so re-binding keeps it.
    const fill = b.kind === 'video'
      ? { video: { path: path.relative(cfg.sourceRoot, b.file), in: 0, out: +(b.range[1] - b.range[0]).toFixed(3) }, push: 0.03, ...need.look }
      // a web page is shown as its text column around the sentence (reading window), never the site's frame
      : { asset: path.relative(cfg.sourceRoot, b.role === 'page' && b.archive?.window?.version >= 2 && fs.existsSync(b.archive.window.file) ? b.archive.window.file : b.file), push: isLogo ? 0 : 0.06, ...(isLogo ? { fit: 'contain' } : {}), ...need.look };
    // a product shot on a plain studio backdrop (white or flat grey all round) is cut out and stood in the
    // frame, never stretched over it as footage: full-bleed it shows a grey wall and an edge (hupo-auto2 B33)
    if (b.kind !== 'video' && !isLogo && b.role !== 'page' && (!need.bind || need.bind === 'background') && studioShot(b.file)) Object.assign(fill, { cutout: true, position: 'center 58%', push: 0.03 });
    // need.bind puts the material into an existing card shot (its backdrop or a named image slot)
    // instead of making a full-frame footage plate.
    if (need.bind) {
      const file = path.join(shotsDir, `${need.shotId}.json`);
      const shot = JSON.parse(fs.readFileSync(file, 'utf8'));
      // need.scene (default 0) picks the scene of a multi-scene shot; scene 0 is also the still.
      const k = need.scene || 0;
      // 读报: a web page on the whole-screen card is read, not decorated — the window around the sentence,
      // a push-in from the whole window to the sentence, then a highlight over its lines. No type on top.
      const cardOf = shot.scenes?.length ? shot.scenes[k]?.recipe || shot.recipe : shot.recipe;
      if (b.role === 'page' && b.archive?.window && cardOf === 'screen-full') {
        const target = shot.scenes?.length ? shot.scenes[k] : shot;
        const cuts = shot.motion?.cuts || [0];
        const d = ((cuts[k + 1] ?? shot.motion?.duration ?? 4) - (cuts[k] ?? 0)) || 4;
        const start = +Math.min(0.3, d * 0.1).toFixed(2), end = +Math.min(start + 1.3, d * 0.55).toFixed(2);
        target.slots = { ...(target.slots || {}), screen: { asset: path.relative(cfg.sourceRoot, b.archive.window.file), fit: 'fill', light: true, ...(b.archive.window.paper ? { paper: b.archive.window.paper } : {}), ...(b.archive.window.sentence ? { quote: b.archive.window.sentence } : {}) } };
        if (shot.scenes?.length && k === 0) shot.slots = { ...(shot.slots || {}), screen: target.slots.screen };   // cut 0 is also the still
        target.screen = { camera: { mode: 'manual', push: { at: b.archive.window.at, scale: b.archive.window.scale, start, end } } };
        // the reference highlights one or two lines; four lines of black is no emphasis at all (hupo-auto2 B55)
        // (the bar itself is drawn by marks.js on this phrase found on the page, motion.mjs readHighlight; the boxes give the push its scale)
        target.cues = { ...(target.cues || {}), highlight: { ...(b.archive.window.sentence ? { phrase: b.archive.window.sentence } : {}), boxes: b.archive.window.boxes.slice(0, 2), at: +(end + 0.05).toFixed(2), dur: 0.5 } };
        if (shot.scenes?.length) target.preset = 'screen'; else shot.motion = { ...(shot.motion || {}), preset: 'screen' };
        // the address and capture time stay in the receipt; nothing about the site goes on screen
        delete shot.credit;
        fs.writeFileSync(file, JSON.stringify(shot, null, 1) + '\n');
        made.push(needKey(need));
        log(`${needKey(need)} -> 读报 on screen-full (push to "${(b.archive.window.sentence || '').slice(0, 24)}…", ${b.archive.window.boxes.length} highlighted lines)`);
        continue;
      }
      const into = (slots) => { if (slots) slots[need.bind] = { ...fill, ...(slots[need.bind]?.position ? { position: slots[need.bind].position } : {}), ...(slots[need.bind]?.zoom ? { zoom: slots[need.bind].zoom } : {}) }; };
      if (need.bind === 'backdrop') shot.backdrop = fill;
      else {
        if (k === 0) into(shot.slots);
        if (shot.scenes?.[k]?.slots) into(shot.scenes[k].slots);
      }
      if (b.role === 'page') delete shot.credit; else shot.credit = `素材：${b.credit}`;
      fs.writeFileSync(file, JSON.stringify(shot, null, 1) + '\n');
      made.push(need.shotId);
      log(`${need.shotId} -> ${need.bind} of ${shot.recipe} (${b.kind})`);
      continue;
    }
    const len = need.range ? +(need.range[1] - need.range[0]).toFixed(3) : 4;
    const shot = {
      shotId: need.shotId, recipe: 'footage-plate', subtitle: need.line, credit: `素材：${b.credit}`,
      note: `原片：${need.original}。素材 ${b.url}（${b.rights}，${b.batch} 确认）`,
      slots: { background: fill },
      motion: { preset: 'footage', duration: len, ref: { start: 0 }, ...(need.range ? { refAt: need.range[0] } : {}) },
    };
    fs.writeFileSync(path.join(shotsDir, `${need.shotId}.json`), JSON.stringify(shot, null, 1) + '\n');
    made.push(need.shotId);
    log(`${need.shotId} -> footage-plate (${b.kind})`);
  }
  return made;
}

// Auto-propose one candidate per need (the user still confirms the batch before anything downloads).
// People: a photo first (cutout-ready). Otherwise: official / public / archive / news over unknown,
// one-scene lengths over long videos; long videos only with a user window, so they are skipped here.
const RIGHTS_RANK = { official: 5, public: 5, cc: 4, archive: 4, news: 3, stock: 2, unknown: 1, film: 0 };
// The same page picked again for a shot within `gap` shots of one that already shows it: two beats about
// one fact otherwise both land on its best page, and the film shows one screenshot twice in a row
// (hupo-auto2 B02/B03). Another page wins when there is a decent one.
// Text a stock site stamps over its previews (Vision OCR on a middle frame). Returns the word or null.
const WATERMARK_RE = /\bpreview\b|shutterstock|pond5|storyblocks|motion ?array|envato|videohive|getty ?images|istock|adobe ?stock|dreamstime|alamy|123rf|depositphotos|stocksubmitter|wowstockfootage/i;
export function watermarkOf(file, kind = 'image', ocr = (img) => spawnSync('swift', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'ocr.swift'), img], { encoding: 'utf8', timeout: 120000 }).stdout || '[]') {
  if (!file || !fs.existsSync(file)) return null;
  let img = file;
  if (kind === 'video') {
    img = path.join(os.tmpdir(), `wm-${crypto.createHash('sha1').update(file).digest('hex').slice(0, 10)}.jpg`);
    const d = probeDuration(file);
    spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(Math.max(0, d / 2)), '-i', file, '-frames:v', '1', img]);
    if (!fs.existsSync(img)) return null;
  }
  try { for (const line of JSON.parse(ocr(img))) { const m = String(line.text || '').match(WATERMARK_RE); if (m) return m[0]; } } catch {}
  return null;
}
// Places a picture names on itself (plaques, signs, captions): a 2-4 character name before 省/市/县/区/镇/村, or a
// province by name. A picture naming a place the need does not, when the need names one, is of somewhere else.
const PROVINCES = ['北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门'];
export function placesIn(text) {
  const s = String(text || ''), out = new Set();
  for (const m of s.matchAll(/([\u4e00-\u9fff]{2,4}?)(省|市|县|縣|区|區|镇|鎮)/g)) out.add(m[1]);
  for (const p of PROVINCES) if (s.includes(p)) out.add(p);
  return [...out];
}
export function placeConflict(seen, need) {
  const want = [need.line, need.original, need.entity, need.what].filter(Boolean).join(' '), named = placesIn(want);
  if (!named.length) return null;
  return placesIn(seen).find((p) => !want.includes(p) && !named.some((q) => q.includes(p) || p.includes(q))) || null;
}
export function placeConflictOf(file, need, ocr = (img) => spawnSync('swift', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'ocr.swift'), img], { encoding: 'utf8', timeout: 120000 }).stdout || '[]') {
  if (!file || !fs.existsSync(file)) return null;
  // small signs read wrong on a small picture (福建 as 福逮): it is read 2.5 times larger as well
  const big = path.join(os.tmpdir(), `place-${crypto.createHash('sha1').update(file).digest('hex').slice(0, 10)}.png`);
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', file, '-vf', "scale='if(lt(iw,1600),iw*2.5,iw)':-1:flags=lanczos", big]);
  const read = (f) => { try { return JSON.parse(ocr(f)).map((l) => l.text || '').join(' '); } catch { return ''; } };
  return placeConflict([read(file), fs.existsSync(big) ? read(big) : ''].join(' '), need);
}
// A plain studio backdrop: the picture's outer ring is one flat light tone (product photography),
export function studioShot(file) {
  if (!file || !fs.existsSync(file) || !/\.(jpe?g|png|webp)$/i.test(file)) return false;
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', 'scale=32:18:flags=area,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 16 });
  if (r.status !== 0 || r.stdout.length < 576) return false;
  const px = r.stdout, ring = [];
  for (let y = 0; y < 18; y++) for (let x = 0; x < 32; x++) if (y < 2 || y > 15 || x < 2 || x > 29) ring.push(px[y * 32 + x]);
  const mean = ring.reduce((a, v) => a + v, 0) / ring.length;
  const sd = Math.sqrt(ring.reduce((a, v) => a + (v - mean) ** 2, 0) / ring.length);
  // or the object fills most of the picture and a long stretch of the edge is pure white (a product
  // photographed close on white)
  const white = ring.filter((v) => v >= 245).length / ring.length;
  return (mean > 200 && sd < 14) || white > 0.35;
}
export function repeatsNearby(picks, order, shotId, c, gap = 3) {
  if (!c.url) return false;
  const at = order.indexOf(shotId);
  return picks.some((p) => p.url === c.url && Math.abs(order.indexOf(String(p.shotId).split('~')[0]) - at) <= gap);
}
// Latin forms of Chinese names (latin.swift, the system's transform), cached for the process
const LATIN = new Map();
export function latinNames(names) {
  const todo = names.filter((n) => /[\u4e00-\u9fff]/.test(n) && !LATIN.has(n));
  if (todo.length) {
    const r = spawnSync('swift', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'latin.swift'), ...todo], { encoding: 'utf8', timeout: 120000 });
    const out = String(r.stdout || '').trim().split('\n');
    todo.forEach((n, i) => LATIN.set(n, r.status === 0 && out[i] ? out[i].trim().toLowerCase() : null));
  }
  return names.map((n) => LATIN.get(n)).filter(Boolean);
}
const GENERIC = new Set(['footage', 'video', 'city', 'street', 'streets', 'archival', 'archive', 'investigation', 'china', 'chinese', 'news', 'drone', 'aerial', 'photo', 'portrait', 'court', 'case', 'the', 'and']);
export function properNouns(need) {
  const qs = [...(need.youtube || []), need.clip, need.archive?.query, need.page?.query, need.page?.queryEn, need.queryEn].filter(Boolean).join(' | ');   // a photo need's own English search too (B46: the Golden State Killer's composite went unnamed)
  return (qs.match(/(?:[A-Z][a-zA-Z]+(?:\s+|$))+/g) || []).map((r) => r.trim().split(/\s+/).filter((w) => !GENERIC.has(w.toLowerCase())).join(' ')).filter((r) => r.length >= 4).map((r) => r.toLowerCase());
}
// an alias is in a text when all its words are (pinyin syllables may run together: gao cheng yong ~ Gaochengyong)
export function aliasIn(aliases, text) {
  const t = String(text).toLowerCase(), tight = t.replace(/[^a-z]/g, '');
  return aliases.some((a) => { const ws = a.split(/\s+/).filter(Boolean); return ws.length && (ws.every((w) => t.includes(w)) || tight.includes(ws.join(''))); });
}

export function proposeBatch(cfg, id, { only = null } = {}) {
  const { needs: all, shots } = readMaterials(cfg, id);
  const stale = new Set(changedNeeds(cfg, id));
  // `only`: re-pick these needs and keep the rest of the proposed batch as it is
  const file0 = path.join(materialsDir(cfg, id), 'proposed-batch.json');
  const prevBatch = (only || stale.size) && fs.existsSync(file0) ? JSON.parse(fs.readFileSync(file0, 'utf8')) : null;
  const needs = needsToSearch(all, only).filter(n => !stale.has(needKey(n)));
  const redo = new Set(needs.map(needKey));
  const keep = (k) => !redo.has(k) && (only || stale.has(k));
  const picks = prevBatch ? prevBatch.picks.filter((p) => keep(p.shotId)) : [];
  const skipped = prevBatch ? (prevBatch.skipped || []).filter(keep) : [];
  const weakPicks = prevBatch ? (prevBatch.weakPicks || []).filter((p) => keep(p.shotId)) : [];
  const thumbsRoot = path.join(projectPaths(cfg, id).out, 'material-thumbs');
  const order = [...new Set(all.map((n) => n.shotId))];
  const approved = readJson(path.join(materialsDir(cfg, id), 'approvals.json'), { batches: [] }).batches.flatMap((bt) => bt.items).filter((i) => !redo.has(i.shotId));
  for (const need of needs) {
    const r = rankNeed(cfg, id, need, { picks, order, approved });
    if (!r) { skipped.push(needKey(need)); continue; }
    // the order the agent gave by eye for the candidates it was shown (matpick.mjs), the next alive one first; without
    // an answer the ranking's best (a run with no agent); an eye that found none fitting skips the need
    // a picture the director named from a page they looked at (addSourcePage) counts as picked by eye
    const byDirector = (r.ranked || []).filter((c) => c.namedBy === 'director').map((c) => c.id);
    const { named, look, names } = r, { print } = shownFor(r.ranked), selection = eyeSelection(cfg, id, needKey(need), need.original ?? null)(print), eye = selection?.order || (byDirector.length ? byDirector : null);
    if (eye && !eye.length) { skipped.push(needKey(need)); weakPicks.push({ shotId: needKey(need), why: 'looked at by eye: none of the candidates shows what is asked' }); continue; }
    // (the eye's picks all tried and failed: a verified item of the library it was never shown is tried before giving up —
    // open-S11 kept a dark White House stand-in for Musk while the library held his verified TED clip, film review 0:18)
    const unseen = r.ranked.filter((c) => c.source === 'library' && !(eye || []).includes(c.id));
    const best = eye ? eye.map((cid) => r.ranked.find((c) => c.id === cid)).find(Boolean) || unseen[0] : r.ranked[0];
    if (!best) { skipped.push(needKey(need)); weakPicks.push({ shotId: needKey(need), why: 'every candidate chosen by eye was tried and failed' }); continue; }
    const visual = look.get(best.id), fit = selection?.assessments?.[best.id] || null;
    // a need about someone or somewhere wants a candidate that names them (a scan of an old diary was proposed for the
    // Golden State Killer: paperclip-138-full B46)
    const unnamed = names.length && best.source !== 'library' && !named(best);
    const pick = { shotId: needKey(need), candidateId: best.id, title: best.title, publisher: best.publisher, duration: best.duration ?? null, rights: best.rightsLabel, url: best.url,
      segment: fit?.segment || null, materialFit: fit,
      // a candidate that names the need's people or events is not weak for its thumbnail (an old news broadcast scores
      // low against "archival investigation footage" yet is the right clip: B46); the user still confirms it
      named: !!(names.length && named(best)),   // checked: the pick names the need's people or places (auto-approved, 2026-10-21)
      // chosen by eye from its contact sheet (matpick): checked, as a pick that names the need is (a need that names
      // no one, generic stock, still waits for the user: the gate of 2026-10-21)
      eye: !!eye && names.length > 0,
      thumbScore: visual != null ? +visual.toFixed(3) : null, weak: eye ? false : !!unnamed || (names.length && named(best) ? false : best.source === 'web' ? !best.official && (best.score ?? 0) < 0.3 : best.source !== 'library' && (visual == null || visual < WEAK_MATCH)) };
    // a weak match is not put to the user: the beat keeps its stand-in (art in the film's look, or type), which is
    // better than a picture of somewhere else (Suzhou drone footage for a street in Baiyin: B05, B37, B53)
    if (pick.weak) { skipped.push(needKey(need)); weakPicks.push({ ...pick, why: unnamed ? 'the title names none of the need\'s people or places' : 'the picture does not match what the shot must show' }); continue; }
    picks.push(pick);
  }
  const file = path.join(materialsDir(cfg, id), 'proposed-batch.json');
  fs.writeFileSync(file, JSON.stringify({ ...(prevBatch || {}), status: 'PROPOSED_NOT_APPROVED', rulesHash: pickRulesHash(cfg), picks, skipped, weakPicks }, null, 1) + '\n');
  noteRounds(cfg, id, skipped.filter((k) => redo.has(k)), picks.map((p) => p.shotId).filter((k) => redo.has(k)));   // only updated needs affect search state
  return { file, picks, skipped, weakPicks };
}

// A need's candidates in order, best first (the same scoring proposeBatch has always used, as a list so the next one is
// at hand when the first cannot be fetched or fails its check: hupo-auto2 meta-S2 stopped at a blocked repost though
// Fortune's own report was second). Reposts and aggregators rank below the publisher; a picture known to be too small
// for a full frame (its size asked before downloading) is left out (meta-S6: a 332 px Sputnik model was picked).
// ctx: { picks (proposed so far), order (shot order), approved (approved items) }. Returns null when nothing is left.
// a need's names, each as the titles write it: an entity written in two scripts ("长赐号 Ever Given") is two names, the
// Chinese and the English, either of which a title may carry (suez-evergiven-blind: a Copernicus image titled "Container
// Ship 'Ever Given' stuck in the Suez Canal" was held as naming no one, and the beat kept its placeholder)
export function nameParts(list) {
  const out = [];
  for (const x of list.filter(Boolean).map((v) => String(v).toLowerCase().trim())) {
    out.push(x);
    const parts = x.match(/[\u3400-\u9fff]+|[a-z0-9][a-z0-9 .'&-]*[a-z0-9]/g) || [];
    if (parts.length > 1) out.push(...parts.map((v) => v.trim()).filter((v) => v.length >= 2));
  }
  return [...new Set(out)];
}

// Only positive provider/asset evidence establishes a media type; thumbnails are not the asset.
function candidateMedia(c) {
  const declared = String(c.mediaType || '').toUpperCase();
  if (declared === 'IMAGE') return 'photo';
  if (declared === 'VIDEO') return 'video';
  if (declared) return 'unknown';
  if (c.source === 'youtube') return 'video';
  if (['news-photo', 'official', 'gallery'].includes(c.source)) return 'photo';
  const asset = String(c.file || c.asset || '').split(/[?#]/)[0];
  if (/\.(jpe?g|png|webp|tiff?|gif)$/i.test(asset)) return 'photo';
  if (/\.(mp4|mov|webm|m4v)$/i.test(asset)) return 'video';
  return 'unknown';
}

export function rankNeed(cfg, id, need, { picks = [], order = [], approved = [] } = {}) {
  const { shots } = readMaterials(cfg, id);
  const thumbsRoot = path.join(projectPaths(cfg, id).out, 'material-thumbs');
  const dead = deadUrls(readJson(path.join(materialsDir(cfg, id), 'approvals.json'), { batches: [] }), needKey(need));
  // (a library's watermarked preview is never a pick: matindex PREVIEW_VENDORS, recap-S9 Kilmer Media)
  // (candidates found before a rule was learned are read under it: a government page's picture is official, a site's
  // furniture is no picture of the need)
  const list = (shots[needKey(need)]?.candidates || []).filter((c) => !['photo', 'video'].includes(need.form) || candidateMedia(c) === need.form).map((c) => (c.source === 'news-photo' ? { ...c, rights: pageRights(c.url), rightsLabel: LABELS[pageRights(c.url)] } : c)).filter((c) => !(c.source === 'news-photo' && NOT_A_PHOTO.test(c.asset || '') && need.kind !== 'logo')).filter((c) => (c.source !== 'youtube' || (c.duration ?? 0) <= WHOLE_DOWNLOAD_LIMIT || autoSegment(c, need)) && !dead.has(c.asset || c.url) && !PREVIEW_VENDORS.test(`${c.title || ''} ${c.publisher || ''} ${c.url || ''}`));
  if (!list.length) return null;
  // Look before choosing: score each candidate's thumbnail against what the shot must show
  // (OpenCLIP), minus OCR text coverage; titles and thumbnails of search results often mislead.
  const look = thumbScores(cfg, need, list, path.join(thumbsRoot, needKey(need)));
  const wantsPhoto = need.look?.cutout || need.kind === 'archival';
  // an official page counts when it is about this need (its title names the need's entity), a little otherwise
  const names = nameParts([...(need.page?.entities || []), need.entity]);
  const about = (c) => names.some((x) => `${c.title}`.toLowerCase().includes(x));
  // the same people and places as an English title writes them: the pinyin of the Chinese name (高承勇 -> Gao
  // Chengyong) or the proper nouns of the need's own English search (Golden State Killer); all words of one
  // must be in the title (paperclip-138-full: the right Baiyin drive and the BBC report were dropped as unnamed)
  // and every other name the house lexicon knows for them (routing/known-names.json: 金州杀手案 = Golden State Killer)
  const lexicon = (readJson(path.join(cfg.dataDir, 'routing', 'known-names.json'), { names: [] }).names || []).filter((e) => (e.names || []).some((n) => names.includes(String(n).toLowerCase()))).flatMap((e) => e.names).map((n) => String(n).toLowerCase());
  const aliases = [...latinNames(names), ...properNouns(need), ...lexicon.filter((n) => /[a-z]/.test(n))];
  const named = (c) => about(c) || aliasIn(aliases, `${c.title} ${c.publisher || ''}`) || lexicon.some((n) => !/[a-z]/.test(n) && `${c.title}`.includes(n));
  // a logo need wants a logo: the library's verified picture of the org (often a building) is no logo,
  // a logo file or the official site's own mark is; a forum thread or Q&A post is not a source page
  const isLogo = (c) => /logo|标识|图标/i.test(`${c.title} ${c.asset || ''}`);
  const forum = (c) => /(^|\/\/)(community|forum|forums|bbs|ask|zhidao)\.|\/t\/|csdn\.net|cnblogs\.com/i.test(c.url || '');
  const outlets = readJson(path.join(cfg.dataDir, 'routing', 'news-outlets.json'), { outlets: [] }).outlets;
  const outlet = (c) => { const h = hostOf(c.url).split('/')[0]; return outlets.some((o) => h === o || h.endsWith('.' + o)); };
  const blockedHosts = Object.keys(readJson(path.join(cfg.dataDir, 'routing', 'blocked-hosts.json'), { hosts: {} }).hosts || {});
  const blocked = (c) => { const h = hostOf(c.url).split('/')[0]; return c.source === 'web' && blockedHosts.some((o) => h === o || h.endsWith('.' + o)); };
  // not a source: a blog, a self-media account, a community or a content farm retelling a report (user 2026-10-23: 对标找到
  // 很正式很好 你为什么从博客截呢: a CO/AI blog stood for Reuters, a 网易号 repost for the report it copied)
  const notSources = (readJson(path.join(cfg.dataDir, 'routing', 'news-outlets.json'), {}).notSources?.patterns || []).map((x) => new RegExp(x, 'i'));
  const notSource = (c) => c.source === 'web' && notSources.some((re) => re.test(String(c.url || '').replace(/^https?:\/\//, '')));
  // (a blocked outlet is captured through the Internet Archive and keeps its rank: the list of blocked hosts held Reuters,
  // the FT, CNBC, AP and SCMP down by 40 and sent the line to the blogs that retold them)
  const rank = (c) => (blocked(c) && !outlet(c) && !c.official ? -40 : 0) + (c.source === 'web' && outlet(c) ? 30 : 0) - (notSource(c) ? 45 : 0)
    // the report the reference itself shows (its headline read on the card): the same title leads
    + (c.refMatch ? c.refMatch * 60 : 0)
    // (a licensed stock library's clip leads YouTube for a need that names no one: clean, graded, no watermark)
    + (c.source === 'stock' && !need.entity ? 20 : 0) + (c.source === 'library' ? (need.form === 'logo' && !isLogo(c) ? 0 : 50) : 0) + (need.form === 'logo' && isLogo(c) && c.official ? 60 + (c.score ?? 0) * 10 : 0) - (c.source === 'web' && forum(c) ? 25 : 0)
    // an official page counts when it is about the need and says what the need asks (its excerpt matches)
    + (c.official ? (about(c) && (c.source !== 'web' || (c.score ?? 0) >= 0.7) ? 20 : 2) : 0) + (c.source === 'web' && about(c) ? 3 : 0) + (c.source === 'web' && c.lang === 'en' && !need.page?.local ? 8 : 0) + (wantsPhoto && c.source !== 'youtube' && /\.(jpe?g|png|webp)/i.test(c.asset || '') ? 10 : 0)
    + (look.get(c.id) ?? 0) * 40 + RIGHTS_RANK[c.rights] * 0.5 + (c.duration && c.duration <= 90 ? 0.3 : 0)
    - (repeatsNearby(picks, order, need.shotId, c) ? 30 : 0)
    // stock-site previews come watermarked
    - (WATERMARK_RE.test(`${c.title || ''} ${c.publisher || ''}`) || /stock (footage|video)/i.test(c.title || '') ? 40 : 0)
    // anywhere else in the film (picked now or approved before): a picture is used once unless a recap replays it
    - (c.url && [...picks, ...approved].some((p) => p.url === c.url && String(p.shotId).split('~')[0] !== need.shotId) ? 15 : 0)
    // a shot director's request (shotplan.mjs) says exactly what the page must say: how well the page's text matches
    // the request leads (hupo-auto2 h800-S8: the CRN report on A800 scored .88, NVIDIA's A800 product page .3 and won)
    + (need.module && c.source === 'web' ? (c.score ?? 0) * 40 : 0)
    // a repost or an aggregator below the report's own publisher (it is more often blocked, and not the source)
    - (c.source === 'web' && AGGREGATOR.test(hostOf(c.url)) ? 25 : 0)
    // a picture too small for the frame it must fill (its size asked before downloading)
    - (c.w && c.w < minWidth(need) ? 80 : 0);
  sizeUp(cfg, list);
  // the candidates that name the need's people or places come first; the rest only when none does
  const namedOnes = names.length ? list.filter((c) => c.source === 'library' || named(c)) : [];
  const pool = (namedOnes.length ? namedOnes : list).filter((c) => !(c.w && c.w < minWidth(need)) && look.get(c.id) !== -1);   // (-1: drawn, seen on the thumbnail)
  if (!pool.length) return null;
  return { ranked: [...pool].sort((a, b) => rank(b) - rank(a)), named, look, names, rank };
}
// the smallest picture that can fill its slot: a photo or a page shown full frame, a logo or cutout smaller
// a picture shown full frame needs 1280 px (matindex SLOTS: insert, title, brand); one size here and there (1200 here let
// a 1200 px portrait through that the slot then turned down: open-S11)
// (a picture shown in part of the frame needs less: need.slotWidth, from the shot that asks: a person card's framed photo,
// a quote's portrait half; ending-S3's verified portrait, 1000 px, was refused for 1280)
export const minWidth = (need) => need.slotWidth ?? (need.form === 'logo' ? 200 : need.look?.cutout ? 400 : need.form === 'webpage' ? 0 : 1280);
// reposting sites and aggregators (not the publisher of a report)
export const AGGREGATOR = /(^|\.)(inkl\.com|openworld\.news|msn\.com|news\.yahoo\.com|newsbreak\.com|flipboard\.com|ground\.news|promptblueprints\.tech|biztoc\.com|newsnow\.|headtopics\.com|archive\.ph|muckrack\.com|scoop\.it|pressreader\.com)/;
// the pixel size of image candidates, asked before downloading (Wikimedia Commons answers it; cached per project)
function sizeUp(cfg, list) {
  const todo = list.filter((c) => c.source === 'wikimedia_commons' && c.w == null && /File[:%3A]/i.test(c.url || ''));
  if (!todo.length) return;
  const titles = todo.map((c) => 'File:' + decodeURIComponent(c.url.split(/File(?::|%3A)/i)[1] || '').replace(/_/g, ' '));
  for (let i = 0; i < titles.length; i += 40) {
    const q = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=size&titles=${encodeURIComponent(titles.slice(i, i + 40).join('|'))}`;
    let d; try { d = JSON.parse(fetchText(q)); } catch { continue; }
    const pages = Object.values(d?.query?.pages || {}), norm = Object.fromEntries((d?.query?.normalized || []).map((n) => [n.from, n.to]));
    todo.slice(i, i + 40).forEach((c, j) => { const t = norm[titles[i + j]] || titles[i + j], pg = pages.find((x) => x.title === t), ii = pg?.imageinfo?.[0]; if (ii) { c.w = ii.width; c.h = ii.height; } });
  }
}

// Thumbnail check: download each candidate's preview (small image), OpenCLIP-score it against the
// need, subtract OCR text coverage. Library items are already verified and are not scored.
function thumbScores(cfg, need, list, dir) {
  fs.mkdirSync(dir, { recursive: true });
  // the scores of this set for this need, kept: the loop ranks every need again each round and the proposal once more,
  // and each ranking loaded OpenCLIP afresh (the material library spent most of an hour there)
  const query0 = need.clip || need.youtube?.[0] || need.original, memo = path.join(dir, `scores-${crypto.createHash('sha256').update(JSON.stringify([query0, need.entity || null, list.map((c) => c.id).sort()])).digest('hex').slice(0, 16)}.json`);
  if (fs.existsSync(memo)) { try { return new Map(Object.entries(JSON.parse(fs.readFileSync(memo, 'utf8')))); } catch { /* */ } }
  const items = [], fileOf = (c) => path.join(dir, crypto.createHash('sha256').update(c.id).digest('hex').slice(0, 12) + '.jpg');
  const srcOf = (c) => (c.source === 'library' ? null : c.thumb || (/\.(jpe?g|png|webp)(\?|$)/i.test(c.asset || '') ? c.asset : null));
  // the previews fetched together, eight at a time (one after another, each up to 20 s through the proxy)
  const todo = list.filter((c) => srcOf(c) && !fs.existsSync(fileOf(c)));
  if (todo.length) { const proxy = process.env.HTTPS_PROXY ? ['-x', process.env.HTTPS_PROXY] : [];
    spawnSync('curl', ['-sSL', '--fail', '-m', '20', '--parallel', '--parallel-max', '8', ...proxy, '-A', 'A1RecipeBoard/1.0 (research)', ...todo.flatMap((c) => ['-o', fileOf(c) + '.raw', srcOf(c)])], { timeout: 120000 });
    for (const c of todo) { const raw = fileOf(c) + '.raw'; if (!fs.existsSync(raw)) continue; spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-i', raw, '-frames:v', '1', '-vf', 'scale=480:-2', fileOf(c)]); fs.rmSync(raw, { force: true }); } }
  for (const c of list) { if (!srcOf(c)) continue; const file = fileOf(c); if (!fs.existsSync(file)) continue;
    items.push({ id: c.id, imagePath: path.relative(cfg.sourceRoot, file), sha256: shaFile(file), abs: file }); }
  const scores = new Map();
  if (items.length < 2) { items.forEach((i) => scores.set(i.id, 0.25)); return scores; }
  const query = need.clip || need.youtube?.[0] || need.original;
  const r = spawnSync(path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python'), ['scripts/a1_external_source_tools.py'], {
    cwd: cfg.sourceRoot, encoding: 'utf8', timeout: 300000, maxBuffer: 20 << 20,
    input: JSON.stringify({ contract: 'A1ExternalSourceToolRequest/v1', operation: 'semantic-rerank', query, candidates: items.map(({ id, imagePath, sha256 }) => ({ id, imagePath, sha256 })) }),
  });
  const line = String(r.stdout || '').trim().split('\n').reverse().find((l) => l.startsWith('{'));
  const res = line ? JSON.parse(line) : null;
  const ocr = spawnSync('swift', [path.join(path.dirname(new URL(import.meta.url).pathname), 'textcover.swift'), ...items.map((i) => i.abs)], { encoding: 'utf8', timeout: 300000 });
  const text = ocr.status === 0 ? JSON.parse(ocr.stdout) : [];
  const pen = new Map(items.map((it, i) => [it.id, text[i] ? Math.min(0.2, text[i].coverage * 2 + (text[i].chars > 12 ? 0.05 : 0)) : 0]));
  for (const x of res?.ranking || []) scores.set(x.id, x.cosineScore - (pen.get(x.id) ?? 0));
  // a named person's picture that is a drawing, a cartoon or a render is seen on its thumbnail, before anything is
  // downloaded (OpenCLIP, likeness.py --drawn): marked -1, left out of the ranking (the explainer's illustrated Ilya was
  // downloaded, refused, and the next one tried; the material library, 2026-10-22)
  if (need.entity && !need.look?.cutout && !(need.archive?.keywords || []).includes('product') && ((need.archive?.keywords || []).includes('portrait') || /照片|人像|portrait/i.test(need.original || ''))) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-drawnthumb-'));
    fs.writeFileSync(path.join(tmp, 'in.json'), JSON.stringify(items.map((it) => ({ id: it.id, image: it.abs }))));
    spawnSync(path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python'), [path.join(path.dirname(new URL(import.meta.url).pathname), 'likeness.py'), '--drawn', path.join(tmp, 'in.json'), path.join(tmp, 'out.json')], { encoding: 'utf8', timeout: 300000 });
    const d = readJson(path.join(tmp, 'out.json'), {}); fs.rmSync(tmp, { recursive: true, force: true });
    for (const it of items) if ((d[it.id] ?? 0) > .6) scores.set(it.id, -1);
  }
  if (items.length >= 2) fs.writeFileSync(memo, JSON.stringify(Object.fromEntries(scores)));
  return scores;
}

// The director names a source page for a shot (`materials --project <id> --only <shot> --page <url>`): the search did
// not reach it (paperclip-138-full B21: the China News report carrying the three Baiyin wanted portraits). Its cover
// and its captioned pictures that say what the need asks for are added to the shot's candidates, credited to the outlet
// and approved like any other pick (nothing is downloaded here).
export function addSourcePage(cfg, id, shotId, url, { get = fetchText, log = () => {} } = {}) {
  const dir = materialsDir(cfg, id), cf = path.join(dir, 'candidates.json'), all = readJson(cf, { contract: 'A1RecipeBoardMaterialCandidates/v1', shots: {} });
  const need = (readJson(path.join(dir, 'needs.json'), { needs: [] }).needs || []).find((n) => n.shotId === shotId);
  if (!need) throw new Error(`${shotId}: no material need`);
  const html = get(url).slice(0, 800_000), title = ((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || url).trim();
  // a need for a report: the page the director names is itself the candidate (the open search timed out on a Chinese
  // headline and offered ads.facebook.com for 澎湃's 《…Meta被曝组建4个小组专门研究》, meta-S4 2026-10-24)
  if (need.kind === 'page' || need.form === 'webpage') {
    const row = (all.shots[shotId] ||= { need, candidates: [] });
    if (!row.candidates.some((c) => c.url === url)) row.candidates.unshift({ id: `web:${crypto.createHash('sha1').update(url).digest('hex').slice(0, 24)}`, source: 'web', title, publisher: hostOf(url).split('/')[0], url, thumb: null, mediaType: 'WEBPAGE', duration: null, rights: 'news', rightsLabel: LABELS.news, score: 0.9, official: false, lang: isEnglish({ title }) ? 'en' : 'other', namedBy: 'director' });
    fs.writeFileSync(cf, JSON.stringify(all, null, 1) + '\n'); log(`${shotId}: + page ${title}`); return 1;
  }
  const lead = leadImageOf(html, url), pics = articleImagesOf(html, url).map((p) => ({ ...p, k: captionScore(p.caption, need.original) })).filter((p) => p.k >= 0.25).sort((a, b) => b.k - a.k).slice(0, 3);
  const add = [...pics.map((p) => ({ asset: p.src, caption: p.caption, score: Math.min(1, 0.6 + p.k) })), ...(lead ? [{ asset: lead, caption: '', score: 0.5 }] : [])];
  const row = (all.shots[shotId] ||= { need, candidates: [] });
  for (const a of add) {
    if (row.candidates.some((c) => c.asset === a.asset)) continue;
    row.candidates.unshift({ id: `newsphoto:${crypto.createHash('sha1').update(a.asset).digest('hex').slice(0, 16)}`, source: 'news-photo', title: a.caption ? `${title}：${a.caption.slice(0, 30)}` : title, publisher: hostOf(url).split('/')[0],
      url, asset: a.asset, thumb: a.asset, mediaType: 'IMAGE', duration: null, rights: pageRights(url), rightsLabel: LABELS[pageRights(url)], score: a.score, lang: 'other', ...(a.caption ? { caption: a.caption } : {}), namedBy: 'director' });
    log(`${shotId}: + ${a.caption || 'cover'} (${a.asset.split('/').pop()})`);
  }
  fs.writeFileSync(cf, JSON.stringify(all, null, 1) + '\n');
  return add.length;
}
