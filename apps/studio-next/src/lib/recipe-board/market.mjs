// Market pictures drawn by code from real prices (user, 2026-10-22: 为什么素材对不上；你找那么差的视频素材哪里来的).
// The reference cuts to a TV board of share prices and to a K-line chart; neither can be had as free footage, and a
// trading room's LED ticker stood in for both (open-S2, S17). A picture of data is code's work (AGENTS.md: readable
// text, numbers and data graphics are code): the market module draws the board or the candles from the daily prices
// of a public source, archived in the project (materials/sources/market-<SYM>-<from>-<to>.json: URL, capture time and
// the series), so every number on screen traces to it and the director types none.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectPaths } from './store.mjs';

export const marketUrl = (sym, from, to) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000)}&period2=${Math.floor(Date.parse(`${to}T23:59:59Z`) / 1000)}&interval=1d`;
export const marketFile = (cfg, id, sym, from, to) => path.join(projectPaths(cfg, id).root, 'materials', 'sources', `market-${sym}-${from}-${to}.json`);

// the series of one symbol, from the archive or fetched once and archived
export async function marketSeries(cfg, id, sym, from, to) {
  const f = marketFile(cfg, id, sym, from, to);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  // (curl: the source answers Node's fetch with 403)
  const url = marketUrl(sym, from, to), r = spawnSync('curl', ['-s', '-m', '30', '-A', 'Mozilla/5.0', url], { encoding: 'utf8', maxBuffer: 1 << 24 });
  let j = null; try { j = JSON.parse(r.stdout); } catch { throw new Error(`market ${sym}: no answer from ${url}`); }
  const d = j?.chart?.result?.[0], q = d?.indicators?.quote?.[0];
  if (!d?.timestamp?.length || !q) throw new Error(`market ${sym}: no series from ${url}`);
  const days = d.timestamp.map((t, i) => ({ day: new Date(t * 1000).toISOString().slice(0, 10), open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] })).filter((x) => x.close != null);
  const rec = { kind: 'A1MarketSeries/v1', symbol: sym, name: d.meta?.longName || d.meta?.shortName || sym, currency: d.meta?.currency || 'USD', source: 'Yahoo Finance', url, capturedAt: new Date().toISOString(), days };
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(rec, null, 1) + '\n');
  return rec;
}

// a board's rows on a day (pure, tested): the close, the change from the day before and its percentage, as printed
export function boardRows(series, day) {
  return series.map((s) => {
    const i = s.days.findIndex((x) => x.day === day);
    if (i < 1) throw new Error(`market ${s.symbol}: no close on ${day} or the day before`);
    const c = s.days[i].close, p = s.days[i - 1].close, ch = c - p;
    return { symbol: s.symbol, name: s.name, price: c.toFixed(2), change: `${ch >= 0 ? '+' : '-'}${Math.abs(ch).toFixed(2)}`, pct: `${ch >= 0 ? '+' : '-'}${Math.abs((ch / p) * 100).toFixed(2)}%`, up: ch >= 0 };
  });
}
// the candles up to a day (pure, tested), with the moving averages the reference draws (5, 10, 20 days)
export function candles(series, day) {
  const d = series.days.filter((x) => x.day <= day);
  const ma = (n) => d.map((_, i) => (i + 1 >= n ? +(d.slice(i + 1 - n, i + 1).reduce((a, x) => a + x.close, 0) / n).toFixed(2) : null));
  return { days: d.map((x) => ({ day: x.day, o: +x.open.toFixed(2), h: +x.high.toFixed(2), l: +x.low.toFixed(2), c: +x.close.toFixed(2) })), ma: { 5: ma(5), 10: ma(10), 20: ma(20) } };
}
// the spec checked (pure): mode, symbols, the day, a window that holds it
export function marketErrors(s) {
  const err = [];
  if (!['board', 'candles'].includes(s.mode)) err.push('market: mode is board or candles');
  if (!/^\d{4}-\d\d-\d\d$/.test(s.day || '')) err.push('market: day is YYYY-MM-DD (the day shown)');
  if (!/^\d{4}-\d\d-\d\d$/.test(s.from || '') || !(s.from < s.day)) err.push('market: from is YYYY-MM-DD before the day (the series archived)');
  const syms = s.mode === 'candles' ? [s.symbol] : s.symbols || [];
  if (!syms.length || syms.some((x) => !/^[A-Z0-9.^-]{1,10}$/.test(x || ''))) err.push(s.mode === 'candles' ? 'market: symbol (one ticker, e.g. NVDA)' : 'market: symbols (tickers, e.g. ["NVDA", "AMD"])');
  if (s.mode === 'board' && syms.length > 5) err.push('market: a board of 5 rows at most');
  if (s.rowsAt && (!Array.isArray(s.rowsAt) || s.rowsAt.some((t) => !(t >= s.at && t < s.end)))) err.push('market: rowsAt are times inside the shot');
  if (s.headline && [...s.headline].length > 12) err.push('market: headline 12 characters at most');
  return err;
}
