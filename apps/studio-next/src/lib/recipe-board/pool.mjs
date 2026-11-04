// Runs heavy jobs (chapter renders, HyperFrames motion renders) a few at a time, as many as memory allows
// (user decision 2026-10-21: 只要内存不搞崩尽量高速运行). RB_JOBS sets the most at once (default 3); a job starts
// only while the machine has RB_FREE_GB (default 3) of memory it can hand out, else it waits for one to finish.
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export const JOBS = Math.max(1, +process.env.RB_JOBS || 3);
export const FREE_GB = +process.env.RB_FREE_GB || 3;
// and only while the disk has RB_DISK_GB (default 5) free: a render that runs the disk full dies half-written (Suez's final,
// ENOSPC, the night of 2026-10-28) and leaves the machine unable to run a command; under it the job is refused, said why
export const DISK_GB = process.env.RB_DISK_GB != null ? +process.env.RB_DISK_GB : 5;
export function diskFreeGb(dir = process.cwd()) { try { const s = fs.statfsSync(dir); return (s.bavail * s.bsize) / 2 ** 30; } catch { return null; } }
export function diskError(free = diskFreeGb(), need = DISK_GB) {
  if (free === null || !Number.isFinite(free) || free < 0) return 'cannot determine disk free space: check the output volume before rendering';
  return free < need ? `the disk has ${free.toFixed(1)} GB free (${need} GB at least, RB_DISK_GB): free space before rendering` : null;
}

// memory the system can hand out now: free + inactive + speculative + purgeable pages (macOS vm_stat); os.freemem elsewhere
export function availableGb() {
  if (process.platform !== 'darwin') return os.freemem() / 2 ** 30;
  try {
    const t = execFileSync('vm_stat', { encoding: 'utf8' });
    const page = +(t.match(/page size of (\d+)/)?.[1] || 16384);
    const n = (k) => +(t.match(new RegExp(`Pages ${k}:\\s+(\\d+)`))?.[1] || 0);
    return ((n('free') + n('inactive') + n('speculative') + n('purgeable')) * page) / 2 ** 30;
  } catch { return os.freemem() / 2 ** 30; }
}

// fn(item, i) for every item, at most `jobs` at once; a new job waits while memory is short (but one always runs).
// Errors stay with their item: the result is [{ item, value } | { item, error }] in item order.
export async function pool(items, fn, { jobs = JOBS, freeGb = FREE_GB, memory = availableGb, waitMs = 2000, disk = diskFreeGb, diskGb = DISK_GB } = {}) {
  const out = new Array(items.length);
  let next = 0, running = 0;
  const worker = async () => {
    for (let i; (i = next) < items.length;) {
      while (running > 0 && memory() < freeGb) await new Promise((r) => setTimeout(r, waitMs));
      if (next !== i) continue;   // another worker took it while this one waited
      next++; running++;
      try { const d = diskError(disk(), diskGb); if (d) throw new Error(d); out[i] = { item: items[i], value: await fn(items[i], i) }; } catch (error) { out[i] = { item: items[i], error }; } finally { running--; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, worker));
  return out;
}
