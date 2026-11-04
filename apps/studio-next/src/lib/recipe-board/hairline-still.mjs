// Still-only fixed-phase rasterization. Never replace or drive the parent renderer clock.
import fs from 'node:fs/promises';
import { constants as FSC } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const here = fileURLToPath(import.meta.url);
// Tokens are valid only in this process and only for the exact bytes just generated.
const preparedTokens = new WeakMap();
export function validateHairlinePng(png) {
  if (!Buffer.isBuffer(png) || png.length > 2 * 1024 * 1024) throw new Error('Hairline PNG size exceeds limit');
  if (png.length < 24 || !png.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) || png.readUInt32BE(8) !== 13 || png.toString('ascii',12,16) !== 'IHDR') throw new Error('invalid Hairline PNG header');
  if (png.readUInt32BE(16) !== 400 || png.readUInt32BE(20) !== 320) throw new Error('invalid Hairline PNG dimensions');
}
export async function consumePreparedHairline(root, spec, token) {
  const saved = token && preparedTokens.get(token);
  const rootReal = await fs.realpath(path.resolve(root));
  if (!saved || saved.root !== rootReal || saved.spec !== JSON.stringify(spec)) throw new Error('invalid prepared Hairline token');
  const st = await fs.lstat(saved.file);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || await fs.realpath(saved.file) !== saved.file || sha(await fs.readFile(saved.file)) !== saved.pngHash) throw new Error('prepared Hairline bytes changed');
  return saved.file;
}
export async function prepareFixedHairline(root, spec, { timeoutMs = 30000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 120000) throw new Error('invalid Hairline timeout');
  if (!spec || Object.keys(spec).some(k => !['key','figure','phaseMs','intensity'].includes(k)) || !/^hairline_[A-Za-z0-9_]{1,48}$/.test(spec.key || '') || spec.figure !== 'exploded' || !Number.isInteger(spec.phaseMs) || spec.phaseMs < 0 || spec.phaseMs > 5000 || typeof spec.intensity !== 'number' || !Number.isFinite(spec.intensity) || spec.intensity < 0 || spec.intensity > 1) throw new Error('invalid Hairline key, figure, phase or intensity');
  const bundle = (await build({stdin:{contents:"import {exploded} from '@lucasmarkes/hairline'; window.mountHairline=exploded;",resolveDir:path.dirname(here)},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'})).outputFiles[0].text;
  const key = sha(JSON.stringify({spec,bundle:sha(bundle),implementation:sha(await fs.readFile(here)),package:sha(await fs.readFile(require.resolve('@lucasmarkes/hairline/package.json')))}));
  // The project root is the trust boundary: macOS keeps os.tmpdir() under /var,
  // which is itself a system symlink to /private/var, so only a symlinked root
  // and components at or below it are rejected.
  const requestedRoot = path.resolve(root);
  if ((await fs.lstat(requestedRoot)).isSymbolicLink()) throw new Error('project path contains a symlink');
  const absoluteRoot = await fs.realpath(requestedRoot);
  if (!(await fs.stat(absoluteRoot)).isDirectory()) throw new Error('project root is not a directory');
  let dir = absoluteRoot;
  for (const part of ['out', 'hairline-stills']) {
    dir = path.join(dir, part);
    try { await fs.mkdir(dir); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const st = await fs.lstat(dir);
    if (st.isSymbolicLink() || !st.isDirectory() || await fs.realpath(dir) !== dir) throw new Error('Hairline output path is a symlink or not a directory');
  }
  const file = path.join(dir, `${key}.png`);
  // Recompute rather than trusting a missing or corrupt cached image.
  const profile = await fs.mkdtemp(path.join(process.env.TMPDIR, 'hairline-browser-')); let browser, controller;
  try {
    controller = new AbortController();
    const launchTimer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      browser = await puppeteer.launch({signal:controller.signal,timeout:timeoutMs + 1000,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,args:['--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--disable-sync','--host-resolver-rules=MAP * ~NOTFOUND']});
    } catch (e) { if (controller.signal.aborted) throw new Error('Hairline browser launch timeout'); throw e; }
    finally { clearTimeout(launchTimer); }
    let timer;
    const data = await Promise.race([ (async () => {
    const page=await browser.newPage(); await page.setViewport({width:400,height:320,deviceScaleFactor:1});
    await page.setRequestInterception(true); page.on('request',r=>r.url().startsWith('data:image/svg+xml')?r.continue():r.abort());
    await page.setContent('<!doctype html><body></body>');
    return await page.evaluate(async ({bundle,spec})=>{
      const frame=document.createElement('iframe'); frame.style.cssText='position:absolute;left:-10000px;width:400px;height:320px;border:0'; frame.setAttribute('sandbox','allow-scripts allow-same-origin'); document.body.appendChild(frame); let fig;
      try {
        const w=frame.contentWindow,d=w.document; d.open(); d.write('<!doctype html><body style="margin:0"><div id="figure" style="width:400px;height:320px"></div></body>'); d.close();
        let now=0,id=0,q=new Map(); Object.defineProperty(w.performance,'now',{value:()=>now}); w.requestAnimationFrame=cb=>{q.set(++id,cb);return id}; w.cancelAnimationFrame=id=>q.delete(id);
        w.IntersectionObserver=class {constructor(cb){this.cb=cb;this.alive=true} observe(target){w.queueMicrotask(()=>{if(this.alive)this.cb([{target,isIntersecting:true}])})} unobserve(){} disconnect(){this.alive=false}};
        w.eval(bundle); const host=d.querySelector('#figure'); fig=w.mountHairline(host,{intensity:spec.intensity,theme:'light',play:false}); await Promise.resolve();
        const rect=host.getBoundingClientRect();host.dispatchEvent(new w.PointerEvent('pointermove',{clientX:rect.left+350,clientY:rect.top+130,pointerType:'mouse',bubbles:true}));
        const step=t=>{now=t;const batch=[...q.values()];q.clear();for(const cb of batch)cb(t)}; for(let t=16;t<spec.phaseMs;t+=16)step(t);if(spec.phaseMs)step(spec.phaseMs);
        const original=host.querySelector('svg');if(!original)throw Error('Hairline did not create SVG');const clone=original.cloneNode(true),src=[original,...original.querySelectorAll('*')],dst=[clone,...clone.querySelectorAll('*')];
        for(let i=0;i<src.length;i++){const style=w.getComputedStyle(src[i]);for(const p of ['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','vector-effect','opacity','fill-opacity','stroke-opacity'])dst[i].style.setProperty(p,style.getPropertyValue(p));}
        clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width','400');clone.setAttribute('height','320');const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(clone));await image.decode();const canvas=document.createElement('canvas');canvas.width=400;canvas.height=320;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png').split(',')[1];
      } finally {if(fig)fig.destroy();frame.remove()}
    },{bundle,spec});
    })(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Hairline browser execution timeout')); }, timeoutMs); }) ]).finally(() => clearTimeout(timer));
    if (typeof data !== 'string' || data.length > Math.ceil(2 * 1024 * 1024 / 3) * 4) throw new Error('Hairline PNG size exceeds limit');
    const png=Buffer.from(data,'base64'); validateHairlinePng(png);
    const temp=path.join(dir,`.${key}.${crypto.randomUUID()}.tmp`);
    let handle, created = false;
    try {
      handle = await fs.open(temp, FSC.O_WRONLY | FSC.O_CREAT | FSC.O_EXCL | FSC.O_NOFOLLOW, 0o600);
      created = true;
      await handle.writeFile(png); await handle.close(); handle = null;
      // Atomic rename replaces a final symlink itself; it never follows or truncates its target.
      // Same-UID concurrent path replacement remains outside this boundary.
      await fs.rename(temp,file); created = false;
    } finally {
      if (handle) await handle.close();
      if (created) await fs.unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; });
    }
    const result = Object.freeze({file,key,pngHash:sha(png)});
    preparedTokens.set(result, {root:absoluteRoot,spec:JSON.stringify(spec),file,pngHash:result.pngHash});
    return result;
  } finally {
    try {
      if (browser) {
        let closeTimer;
        try {
          await Promise.race([
            browser.close(),
            new Promise(resolve => { closeTimer = setTimeout(() => { controller.abort(); resolve(); }, 2000); }),
          ]);
        } finally { clearTimeout(closeTimer); }
      }
    } finally { await fs.rm(profile,{recursive:true,force:true}); }
  }
}
