// Task-only, read-only inventory. It is not a rights, quality or provenance check.
import fs from 'node:fs';
import path from 'node:path';
// Keep in sync with store.mjs PROJECT_ID; inventory does not need project metadata or NAS output.
const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

const MAX_BINDINGS = 4 * 1024 * 1024;
const MAX_IMAGE = 32 * 1024 * 1024, MAX_ENTRIES = 1000;
const flags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
function directory(p) { const s = fs.lstatSync(p); return s.isDirectory() && !s.isSymbolicLink(); }
function regular(p, limit, read) {
  let fd;
  try {
    const before = fs.lstatSync(p);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (limit && before.size > limit)) return null;
    fd = fs.openSync(p, flags);
    const s = fs.fstatSync(fd);
    if (!s.isFile() || s.nlink !== 1 || s.dev !== before.dev || s.ino !== before.ino || (limit && s.size > limit)) return null;
    return read(fd, s);
  } catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
}
// Fixed-size read window: no image-sized allocation, including for large inputs.
function windowed(fd, size) {
  const chunk = 64 * 1024; let start = -1, data = Buffer.alloc(0);
  function page(offset) {
    const base = Math.floor(offset / chunk) * chunk;
    if (base !== start) { const b = Buffer.alloc(Math.min(chunk, size - base)); let n = 0;
      while (n < b.length) { const got = fs.readSync(fd, b, n, b.length - n, base + n); if (!got) throw new Error('short image read'); n += got; }
      start = base; data = b;
    }
    return data;
  }
  function bytes(offset, length) {
    if (offset < 0 || length < 0 || offset + length > size || length > chunk) throw new Error('image read out of bounds');
    const first = page(offset), i = offset - start;
    if (i + length <= first.length) return first.subarray(i, i + length);
    const left = Buffer.from(first.subarray(i)); return Buffer.concat([left, page(offset + left.length).subarray(0, length - left.length)]);
  }
  const obj = { length: size, readUInt16BE: p => bytes(p,2).readUInt16BE(), readUInt16LE: p => bytes(p,2).readUInt16LE(),
    readUInt32BE: p => bytes(p,4).readUInt32BE(), readUInt32LE: p => bytes(p,4).readUInt32LE(),
    toString: (encoding,a,b) => bytes(a,b-a).toString(encoding), subarray: (a,b) => bytes(a,b-a),
    nextFF(p) { while (p < size) { const buf = page(p), i = buf.indexOf(255, p - start); if (i >= 0) return start + i; p = start + buf.length; } return size; } };
  return new Proxy(obj, { get(target, key) { if (typeof key === 'string' && /^\d+$/.test(key)) { const p = Number(key); return p < size ? page(p)[p-start] : undefined; } return target[key]; } });
}
// Samsung SEFT is an indexed container, not a short JPEG suffix. Bound and
// validate its directory and contiguous records; record payloads remain opaque.
function seftTrailer(buf, start, n) {
  if (n-start > 4*1024*1024 || n-start < 32 || buf.toString('ascii', n-4, n) !== 'SEFT') return false;
  const size = buf.readUInt32LE(n-8), dir = n - 8 - size;
  if (dir < start || size < 12 || size > 4096 || buf.toString('ascii',dir,dir+4) !== 'SEFH') return false;
  const count = buf.readUInt32LE(dir+8);
  if (!count || count > 128 || 12 + 12*count !== size) return false;
  let cursor = start;
  for (let i=0; i<count; i++) {
    const e=dir+12+12*i, type=buf.readUInt32LE(e), offset=buf.readUInt32LE(e+4), len=buf.readUInt32LE(e+8), p=dir-offset;
    if (p !== cursor || len < 8 || p+len > dir || buf.readUInt32LE(p) !== type) return false;
    const nameLen=buf.readUInt32LE(p+4);
    if (!nameLen || nameLen > 128 || nameLen > len-8 || !/^[A-Za-z0-9_]+$/.test(buf.toString('ascii',p+8,p+8+nameLen))) return false;
    cursor += len;
  }
  return cursor === dir;
}
// Bounded structural inspection only; no pixel decode or provenance assertion.
function dimensions(buf) {
  const n = buf.length;
  const valid = (width, height, format) => width && height && width <= 32768 && height <= 32768 && width * height <= 100000000 ? {width, height, format} : null;
  if (n >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' && buf.readUInt32LE(4) === n - 8) {
    let p = 12, result = null, image = false;
    while (p + 8 <= n) {
      const type = buf.toString('ascii', p, p + 4), len = buf.readUInt32LE(p + 4), start = p + 8;
      if (len > n - start || start + len + (len & 1) > n) return null;
      if (type === 'VP8 ' && len >= 10 && buf[start+3] === 0x9d && buf[start+4] === 1 && buf[start+5] === 0x2a) { result = valid(buf.readUInt16LE(start+6)&0x3fff, buf.readUInt16LE(start+8)&0x3fff, 'webp'); image = true; }
      if (type === 'VP8L' && len >= 5 && buf[start] === 0x2f) { const bits = buf.readUInt32LE(start+1); if (bits >>> 29) return null; result = valid((bits & 0x3fff)+1, ((bits >>> 14)&0x3fff)+1, 'webp'); image = true; }
      p = start + len + (len & 1);
    }
    return p === n && image ? result : null;
  }
  if (n >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let p = 2, result = null, scan = false;
    while (p < n) {
      if (buf[p++] !== 0xff) return null;
      while (p < n && buf[p] === 0xff) p++;
      if (p >= n) return null;
      const marker = buf[p++];
      if (marker === 0xd9) {
        const trailingBytes = n - p;
        // Known bounded editor trailer only; opaque bytes are not authenticated or decoded.
        if (!scan || !result) return null;
        if (!trailingBytes) return result;
        if (seftTrailer(buf, p, n)) return { ...result, trailingBytes, trailingData: 'unverified-seft-container' };
        if (trailingBytes > 4096 || trailingBytes < 32 || buf.toString('ascii', p+8, p+32) !== 'PhotoEditor_Re_Edit_Data') return null;
        return { ...result, trailingBytes, trailingData: 'unverified-photoeditor' };
      }
      if (marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) return null;
      if (marker === 0x01) continue;
      if (p + 2 > n) return null;
      const len = buf.readUInt16BE(p); if (len < 2 || len > n-p) return null;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (len < 8 || len !== 8 + 3*buf[p+7]) return null;
        result = valid(buf.readUInt16BE(p+5),buf.readUInt16BE(p+3),'jpeg');
        if (!result) return null;
      }
      p += len;
      if (marker === 0xda) {
        if (!result || len < 6) return null;
        const start = p; scan = true;
        while (p < n) { p = buf.nextFF(p); if (p >= n) return null; if (p+1 >= n) return null; const next = buf[p+1]; if (next === 0 || (next >= 0xd0 && next <= 0xd7)) { p += 2; continue; } break; }
        if (p === start) return null;
      }
    }
  }
  return null;
}
export function taskMaterialInventory(cfg, id) {
  if (!PROJECT_ID.test(String(id))) throw new Error(`invalid project id: ${id}`);
  const projects = path.join(cfg.dataDir, 'projects');
  const root = path.join(projects, id), materials = path.join(root, 'materials'), clips = path.join(materials, 'clips');
  const unknown = { status: 'unknown', materials: {}, diagnostics: {}, truncated: false, qualityStatus: 'unknown' };
  try { if (!directory(projects) || !directory(root) || !directory(materials)) return unknown; } catch { return unknown; }
  const bindings = regular(path.join(materials, 'bindings.json'), MAX_BINDINGS, (fd, st) => {
    const buf = Buffer.alloc(st.size); let n = 0;
    while (n < buf.length) { const got = fs.readSync(fd, buf, n, buf.length - n, n); if (!got) break; n += got; }
    try { return JSON.parse(buf.subarray(0, n).toString('utf8')); } catch { return null; }
  });
  if (!bindings?.shots || typeof bindings.shots !== 'object' || Array.isArray(bindings.shots)) return unknown;
  const out = Object.create(null), diagnostics = Object.create(null);
  let count = 0, truncated = false;
  for (const [key, v] of Object.entries(bindings.shots)) {
    if (count++ >= MAX_ENTRIES) { truncated = true; break; }
    if (!/^[A-Za-z0-9_-]{1,32}(?:~[A-Za-z0-9_-]{1,32})?$/.test(key)) continue;
    const beat = key.split('~')[0];
    let need = []; try { if (typeof v?.needPrint === 'string' && v.needPrint.length <= 8192) need = JSON.parse(v.needPrint); } catch {}
    const item = { key, kind: ['image','video'].includes(v?.kind) ? v.kind : null, what: typeof need?.[2] === 'string' ? need[2].slice(0, 2048) : null, file: null, q: null, quality: null, qualityStatus: 'unknown', provenanceStatus: 'unknown', decoded: false, status: 'unknown' };
    const file = typeof v?.file === 'string' ? v.file : '';
    try {
      const abs = path.isAbsolute(file) ? path.resolve(file) : path.resolve(root, file);
      const relative = path.relative(clips, abs), parts = relative.split(path.sep);
      if (v?.kind === 'image' && file && relative && !path.isAbsolute(relative) && !parts.includes('..') && directory(clips)) {
        let dir = clips; for (const part of parts.slice(0,-1)) { dir = path.join(dir, part); if (!directory(dir)) throw new Error('unsafe directory'); }
        const info = regular(abs, MAX_IMAGE, (fd, st) => {
          const n = st.size, buf = windowed(fd, n);
          const other = dimensions(buf); if (other) return { bytes: st.size, ...other };
          if (n < 45 || !buf.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) return null;
          let pos = 8, width = 0, height = 0, idat = false, end = false, first = true;
          while (pos + 12 <= n) {
            const len = buf.readUInt32BE(pos), type = buf.toString('ascii',pos+4,pos+8);
            if (len > n - pos - 12) return null;
            if (first) {
              if (type !== 'IHDR' || len !== 13) return null;
              width = buf.readUInt32BE(pos+8); height = buf.readUInt32BE(pos+12);
              if (!width || !height || width > 32768 || height > 32768 || width * height > 100000000) return null;
              first = false;
            } else if (type === 'IHDR') return null;
            if (type === 'IDAT' && len > 0) idat = true;
            pos += len + 12;
            if (type === 'IEND') { end = len === 0 && pos === n; break; }
          }
          return idat && end ? { bytes: st.size, width, height, format: 'png' } : null;
        });
        if (info) { item.file = abs; item.metadata = info; item.status = 'present-unverified'; }
      }
    } catch {}
    ((item.status === 'present-unverified' ? out : diagnostics)[beat] ||= []).push(item);
  }
  return { status: 'unverified', materials: out, diagnostics, truncated, qualityStatus: 'unknown' };
}
