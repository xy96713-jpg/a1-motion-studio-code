import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { materialsLock } from '../apps/studio-next/src/lib/recipe-board/shotplan.mjs';

if (process.argv[2] === 'worker') {
  const cfg = {dataDir: process.argv[3]};
  try {
    const release = await materialsLock(cfg, 'fixture', () => {}, {waitMs: 10, maxWait: +process.argv[4]});
    process.send('acquired');
    process.on('message', (m) => { if (m === 'release') { release(); process.send('released'); process.disconnect(); } });
  } catch (e) { process.send(`error:${e.message}`); process.disconnect(); }
} else {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'materials-lock-live-'));
  const cfg = {dataDir: root}, file = path.join(root, 'projects/fixture/materials/.lock');
  const children = new Set();
  const start = (timeout) => {
    const child = fork(fileURLToPath(import.meta.url), ['worker', root, String(timeout)], {silent:true});
    children.add(child); child.on('exit', () => children.delete(child));
    const messages = [], waiters = [];
    child.on('message', (msg) => { const w = waiters.shift(); if (w) w(msg); else messages.push(msg); });
    child.next = () => messages.length ? Promise.resolve(messages.shift()) : new Promise((resolve) => waiters.push(resolve));
    return child;
  };
  try {
    fs.mkdirSync(path.join(root, 'projects/fixture'), {recursive:true});
    fs.writeFileSync(path.join(root, 'projects/fixture/project.json'), '{}');
    const a = start(1000); assert.equal(await a.next(), 'acquired');
    const content = fs.readFileSync(file, 'utf8');
    const b = start(100); assert.match(await b.next(), /^error:.*timed out/);
    assert.equal(fs.readFileSync(file, 'utf8'), content, 'timeout leaves live lock untouched');
    const c = start(2000); let acquired = false; const pending = c.next().then((m) => { acquired = true; return m; });
    await new Promise((r) => setTimeout(r, 150)); assert.equal(acquired, false, 'two processes cannot hold concurrently');
    a.send('release'); assert.equal(await a.next(), 'released'); assert.equal(await pending, 'acquired');
    c.send('release'); assert.equal(await c.next(), 'released'); assert.equal(fs.existsSync(file), false);
    for (const value of ['', '999999999']) {
      fs.writeFileSync(file, value);
      const d = start(80); assert.match(await d.next(), /^error:.*timed out/);
      assert.equal(fs.readFileSync(file, 'utf8'), value, 'empty/dead lock retained');
      fs.unlinkSync(file); // isolated fixture, no holder or other worker
    }
    // Deterministically exercise the narrow EEXIST -> owner release -> ENOENT window.
    fs.writeFileSync(file, 'old');
    const original = fs.readFileSync; let injected = false;
    fs.readFileSync = function(p, ...args) { if (p === file && !injected) { injected = true; fs.unlinkSync(file); } return original.call(this, p, ...args); };
    let release;
    try { release = await materialsLock(cfg, 'fixture', () => {}, {waitMs: 10, maxWait: 100}); } finally { fs.readFileSync = original; }
    assert.ok(injected); release(); assert.equal(fs.existsSync(file), false);
    fs.mkdirSync(file); await assert.rejects(materialsLock(cfg, 'fixture', () => {}, {waitMs:10, maxWait:50}), (e) => e.code === 'EISDIR'); fs.rmdirSync(file);
    const open = fs.openSync;
    fs.openSync = function(p, ...args) { if (p === file) { const e = new Error('denied'); e.code = 'EACCES'; throw e; } return open.call(this, p, ...args); };
    try { await assert.rejects(materialsLock(cfg, 'fixture'), (e) => e.code === 'EACCES'); } finally { fs.openSync = open; }
    const owner = await materialsLock(cfg, 'fixture'); const originalContent = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, 'different'); assert.throws(owner, /ownership changed/); assert.equal(fs.readFileSync(file, 'utf8'), 'different');
    fs.writeFileSync(file, originalContent); owner(); owner();
    console.log('materials lock: real process contention, timeout, release, stale retention, ENOENT and ownership checks passed');
  } finally {
    for (const child of children) child.kill();
    fs.rmSync(root, {recursive:true, force:true});
  }
}
