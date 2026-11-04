// Read-only, fail-closed capability checks; no generation or renderer is invoked here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from 'acorn';
export function moduleImageKeys(code) {
  const keys = new Set();
  try {
    const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    function walk(n) {
      if (!n || typeof n !== 'object' || /Function/.test(n.type || '')) return;
      if (n.type === 'MemberExpression' && n.object?.name === 'images') {
        const key = n.computed ? n.property?.value : n.property?.name;
        if (typeof key === 'string') keys.add(key);
      }
      for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v);
    }
    for (const n of ast.body) if (n.type === 'ExportNamedDeclaration' && n.declaration?.type === 'FunctionDeclaration' && ['fg','bg','draw'].includes(n.declaration.id.name)) walk(n.declaration.body);
  } catch { /* invalid modules have no proven consumer */ }
  return keys;
}
// A bounded static-code capability, not an exemption for arbitrary JS declarations.
// Only direct calls in a renderer export count; comments, strings, nested dead helpers do not.
function inspectCode(a, code) {
  if (a.source !== 'code' || a.operability !== 'code' || !['art', 'type'].includes(a.use) || a.operation !== 'hold') fail('unknown code capability (only static art/type hold supported)');
  if (hash(code) !== a.sha256) fail('module hash missing or changed');
  const entry = a.file.slice('module:'.length);
  if (!['fg', 'bg', 'draw'].includes(entry)) fail('unknown module consumer export');
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const fn = ast.body.find(n => n.type === 'ExportNamedDeclaration' && n.declaration?.type === 'FunctionDeclaration' && n.declaration.id.name === entry)?.declaration;
  if (!fn) fail('module consumer export missing');
  const name = n => n?.type === 'Identifier' ? n.name : n?.type === 'MemberExpression' && !n.computed ? `${name(n.object)}.${name(n.property)}` : '';
  const statements = [];
  for (const n of fn.body.body) { if (n.type === 'ReturnStatement' || n.type === 'ThrowStatement') break; statements.push(n); }
  const calls = statements.filter(n => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression').map(n => name(n.expression.callee));
  const allowed = a.use === 'type' ? ['type.flat.typeBlock', 'type.flat.pair', 'type.flat.spreadWord'] : ['type.dev.visualLanguage'];
  if (!a.targets?.length || a.targets.some(t => !allowed.includes(t) || !calls.includes(t))) fail('code target missing or unsupported consumer anchor');
  return { file: a.file, sha256: a.sha256, capability: 'code', objects: a.targets, files: [] };
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
function pinned(file, expected) {
  const bytes = fs.readFileSync(file), sha256 = hash(bytes);
  if (!/^[a-f0-9]{64}$/.test(expected || '') || expected !== sha256) fail(`hash missing or changed: ${file}`);
  return { bytes, sha256, file: fs.realpathSync(file) };
}
async function image(file) {
  const sharp = (await import('sharp')).default;
  // Decode pixels, not just the extension or a plausible header.
  await sharp(file, { limitInputPixels: 100000000 }).raw().toBuffer();
}
// Deliberately bounded GLB subset: embedded, uncompressed glTF2 positions.
// Unknown extensions/external buffers/sparse geometry are blocked, never guessed.
function glbObjects(bytes) {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) fail('invalid GLB header/length');
  let json, bin;
  for (let off = 12; off < bytes.length;) {
    if (off + 8 > bytes.length) fail('invalid GLB chunk');
    const len = bytes.readUInt32LE(off), type = bytes.readUInt32LE(off + 4); off += 8;
    if (len % 4 || off + len > bytes.length) fail('invalid GLB chunk length');
    if (type === 0x4e4f534a && !json) json = JSON.parse(bytes.subarray(off, off + len).toString());
    else if (type === 0x004e4942 && !bin) bin = bytes.subarray(off, off + len);
    else fail('unknown GLB chunk');
    off += len;
  }
  if (json?.asset?.version !== '2.0' || !bin || json.extensionsRequired?.length || json.buffers?.length !== 1 || json.buffers[0].uri || json.buffers[0].byteLength > bin.length) fail('unknown GLB buffers/extensions');
  const objects = [], seen = new Set();
  function visit(i) {
    if (!Number.isInteger(i) || seen.has(i) || !json.nodes?.[i]) fail('invalid GLB scene node graph');
    seen.add(i); const n = json.nodes[i];
    if (n.mesh != null) {
      const mesh = json.meshes?.[n.mesh];
      if (!mesh?.primitives?.length) fail('GLB mesh has no geometry');
      for (const p of mesh.primitives) {
        const a = json.accessors?.[p.attributes?.POSITION], v = json.bufferViews?.[a?.bufferView];
        if (p.extensions || !a || a.sparse || a.componentType !== 5126 || a.type !== 'VEC3' || !Number.isInteger(a.count) || a.count < 3 || !v || v.buffer !== 0) fail('unknown GLB geometry capability');
        const stride = v.byteStride || 12, start = (v.byteOffset || 0) + (a.byteOffset || 0), end = start + (a.count - 1) * stride + 12;
        if (stride < 12 || start < 0 || end > bin.length || end > (v.byteOffset || 0) + v.byteLength) fail('invalid GLB position bounds');
        for (let k = 0; k < a.count; k++) for (let c = 0; c < 3; c++) if (!Number.isFinite(bin.readFloatLE(start + k * stride + c * 4))) fail('invalid GLB vertex');
      }
      if (n.name) { if (objects.includes(n.name)) fail('ambiguous GLB target names'); objects.push(n.name); }
    }
    for (const child of n.children || []) visit(child);
  }
  const roots = json.scenes?.[json.scene ?? 0]?.nodes;
  if (!roots?.length) fail('GLB has no active scene');
  roots.forEach(visit);
  if (!objects.length) fail('GLB has no named mesh targets');
  return objects;
}
async function inspect(file, expected) {
  const p = pinned(file, expected), ext = path.extname(file).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'].includes(ext)) {
    await image(file); return { ...p, capability: 'whole-image', objects: [], files: [p.file] };
  }
  if (ext === '.glb') return { ...p, capability: 'mesh', objects: glbObjects(p.bytes), files: [p.file] };
  if (ext === '.json') {
    const j = JSON.parse(p.bytes);
    if (j.contract !== 'A1AssetLayers/v1' || !Array.isArray(j.layers) || !j.layers.length) fail('unknown layer resource contract');
    const objects = [], files = [], dependencies = [];
    for (const layer of j.layers) {
      if (typeof layer.id !== 'string' || !layer.id || objects.includes(layer.id)) fail('invalid/duplicate layer target');
      const child = pinned(path.resolve(path.dirname(file), layer.file), layer.sha256);
      await image(child.file);
      objects.push(layer.id); files.push(child.file); dependencies.push({ id: layer.id, file: child.file, sha256: child.sha256 });
    }
    if (new Set(files).size !== files.length) fail('layers must be separate resources, not repeated whole-image files');
    return { ...p, capability: 'layers', objects, files, dependencies };
  }
  fail(`unknown asset capability: ${ext || 'no extension'}`);
}
/** Assets use full sha256 pins; targets are parsed layer IDs / GLB node names.
 * Optional consumedFiles enforces actual chapter input binding. Absence means inspect only.
 * Evidence binds to this beat's materials record AND identical bytes, never provenance prose alone.
 */
export async function assetOperationPreflight({ root, beats = [], shotIds = null, bindings = {}, consumedFiles = null, generatedFiles = [], code = '', phase = 'final', productions = [], resolved = [] } = {}) {
  const errors = [], evidence = [], pending = [];
  const resolve = f => path.resolve(root, f);
  const canonical = f => { try { return fs.realpathSync(resolve(f)); } catch { return resolve(f); } };
  for (const b of beats) {
    if (shotIds && !shotIds.includes(b.beat)) continue;
    const assets = b.directorIntent?.assets;
    if (assets == null) continue; // No retrospective migration of unrelated legacy work.
    if (!Array.isArray(assets)) { errors.push(`asset-operation ${b.beat}: assets must be an array`); continue; }
    for (const a of assets) {
      try {
        let resource = a;
        if (a.sha256 === 'pending') {
          const production = productions.find(p => p.reference === a.file);
          if (a.source !== 'generated' || a.use === 'evidence' || !production?.prompt?.trim() || !production.consumed) fail('pending asset has no realizable generation/consumer binding');
          if (!['hold', 'camera', 'reveal', 'per-object'].includes(a.operation) || !['whole-image', 'mesh'].includes(a.operability) || production.capability !== a.operability) fail('pending operation capability cannot be produced');
          if (a.operation === 'per-object' && (a.operability !== 'mesh' || !a.targets?.length)) fail('pending per-object target missing or unsupported');
          if (phase === 'prepare') { pending.push({ beat: b.beat, id: a.id, reference: a.file }); continue; }
          const pin = resolved.find(p => p.beat === b.beat && p.id === a.id && p.reference === a.file);
          if (!pin?.file || !pin.sha256) fail('pending generation has no final pinned output');
          resource = { ...a, file: pin.file, sha256: pin.sha256 };
        }
        const got = a.file?.startsWith('module:') ? inspectCode(a, code) : await inspect(resolve(resource.file), resource.sha256);
        if (!['hold', 'camera', 'reveal', 'per-object', 'deform'].includes(a.operation)) fail('unknown operation');
        if (a.operability !== got.capability) fail(`capability mismatch: declared ${a.operability}, parsed ${got.capability}`);
        if (a.operation === 'deform') fail('unknown deformation capability: requires a separately verified deformation consumer');
        if (a.operation === 'per-object') {
          if (!['layers', 'mesh'].includes(got.capability)) fail('whole-image cannot satisfy per-object capability');
          if (!Array.isArray(a.targets) || !a.targets.length || a.targets.some(t => !got.objects.includes(t))) fail(`target missing or not found; available: ${got.objects.join(', ')}`);
        }
        if (consumedFiles && got.files.some(f => !consumedFiles.map(canonical).includes(f))) fail('asset not bound to actual chapter consumer inputs');
        if (a.use === 'evidence') {
          if (a.source !== 'real' || !a.provenance) fail('evidence must have real provenance');
          if (generatedFiles.map(canonical).includes(got.file) || /(?:^|\/)art-cache\//.test(got.file)) fail('generated asset cannot be evidence');
          const bound = Object.entries(bindings.shots || {}).filter(([k]) => k === b.beat || k.startsWith(`${b.beat}~`)).map(([, v]) => v);
          if (!bound.some(v => v?.file && canonical(v.file) === got.file && v.sha256 === got.sha256 && v.source !== 'generated' && v.generated !== true && (v.url === a.provenance || v.credit === a.provenance))) fail('evidence binding missing: require matching beat, file, sha256 and source URL/credit');
        }
        evidence.push({ beat: b.beat, id: a.id, file: got.file, sha256: got.sha256, capability: got.capability, objects: got.objects, dependencies: got.dependencies || [] });
      } catch (e) { errors.push(`asset-operation ${b.beat}/${a?.id || '?'}: ${e.message}`); }
    }
  }
  return { errors, evidence, pending };
}
