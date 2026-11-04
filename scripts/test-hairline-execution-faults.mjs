import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { prepareFixedHairline, consumePreparedHairline } from '../apps/studio-next/src/lib/recipe-board/hairline-still.mjs';

// Actual component PNG from a previous capture; fake browser exercises only orchestration.
const png = await fs.readFile(new URL('./fixtures/hairline/exploded-400x320.png', import.meta.url));
const spec = { key:'hairline_test', figure:'exploded', phaseMs:192, intensity:0.8 };
const original = puppeteer.launch;
async function fixture(mode, fn) {
  const root = await fs.mkdtemp(path.join(process.env.TMPDIR, 'hairline-execution-'));
  let profile, signal, closed = 0;
  puppeteer.launch = async opts => {
    profile = opts.userDataDir; signal = opts.signal;
    const page = { setViewport:async()=>{}, setRequestInterception:async()=>{}, on(){}, setContent:async()=>{}, evaluate:async()=> mode === 'execute-hang' ? new Promise(()=>{}) : png.toString('base64') };
    return {newPage:async()=>page, close:()=>{closed++; if(mode==='close-hang') return new Promise(()=>{}); if(mode==='close-throw') return Promise.reject(new Error('controlled close failure')); return Promise.resolve();}};
  };
  try { await fn({root, get profile(){return profile}, get signal(){return signal}, get closed(){return closed}}); }
  finally { puppeteer.launch = original; await fs.rm(root,{recursive:true,force:true}); }
}
async function absent(p) { await assert.rejects(fs.lstat(p), {code:'ENOENT'}); }

test('execution timeout aborts and cleans its own profile', async () => fixture('execute-hang', async f => {
  await assert.rejects(prepareFixedHairline(f.root,spec,{timeoutMs:250}), /execution timeout/);
  assert.equal(f.signal.aborted,true); assert.equal(f.closed,1); await absent(f.profile);
}));
test('hung close is bounded, aborts, and removes its profile', async () => fixture('close-hang', async f => {
  const start=Date.now(); const token=await prepareFixedHairline(f.root,spec,{timeoutMs:250});
  assert(Date.now()-start < 5000); assert.equal(f.signal.aborted,true); assert.equal(f.closed,1); await absent(f.profile);
  assert.equal(await consumePreparedHairline(f.root,spec,token),token.file);
}));
test('close rejection propagates and removes its profile', async () => fixture('close-throw', async f => {
  await assert.rejects(prepareFixedHairline(f.root,spec,{timeoutMs:250}), /controlled close failure/);
  assert.equal(f.closed,1); await absent(f.profile);
}));
test('prepared token is bound to project and exact PNG bytes', async () => fixture('ok', async f => {
  const other=path.join(f.root,'other'); await fs.mkdir(other);
  const token=await prepareFixedHairline(f.root,spec,{timeoutMs:250});
  await assert.rejects(consumePreparedHairline(other,spec,token), /invalid prepared/);
  await assert.rejects(consumePreparedHairline(f.root,spec,{...token}), /invalid prepared/);
  const changed=Buffer.from(png); changed[changed.length-1]^=1; await fs.writeFile(token.file,changed);
  await assert.rejects(consumePreparedHairline(f.root,spec,token), /bytes changed/);
}));
test('atomic replacement removes final symlink without touching its target', async () => fixture('ok', async f => {
  const token=await prepareFixedHairline(f.root,spec,{timeoutMs:250});
  const victim=path.join(f.root,'victim'); await fs.writeFile(victim,'unchanged');
  await fs.unlink(token.file); await fs.symlink(victim,token.file);
  await assert.rejects(consumePreparedHairline(f.root,spec,token), /bytes changed/);
  const next=await prepareFixedHairline(f.root,spec,{timeoutMs:250});
  assert.equal(await fs.readFile(victim,'utf8'),'unchanged');
  assert.equal((await fs.lstat(next.file)).isSymbolicLink(),false);
  assert.deepEqual(await fs.readFile(next.file),png);
}));
