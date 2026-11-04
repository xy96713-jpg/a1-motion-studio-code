// Explicit revalidation of existing model files. This records what exists now;
// it does not manufacture a historical build signature or approve visual quality.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const LEGACY_MODEL_CONTRACT = 'A1LegacyModelRevalidation/v1';
const SCOPE = 'current-content-binding-only';
const NOTE = 'Historical request and mesh records agree; these current hashes are not signatures recorded at original generation. Current-use QA and independent visual review remain required.';
const REQUIRES = ['current-use-qa', 'independent-visual-review'];

function modelRoot(partsRoot, name) {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(name)) throw new Error('invalid model name');
  const root = fs.realpathSync(partsRoot);
  if (!fs.statSync(root).isDirectory()) throw new Error('partsRoot must be a directory');
  return root;
}
function readInside(root, file) {
  if (typeof file !== 'string' || !file.trim()) throw new Error('reference path must be a nonempty string');
  const candidate = path.resolve(root, file), rel = path.relative(root, candidate);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error(`path outside partsRoot is unsupported: ${file}`);
  const real = fs.realpathSync(candidate), realRel = path.relative(root, real);
  if (realRel === '..' || realRel.startsWith('..' + path.sep) || path.isAbsolute(realRel)) throw new Error(`symlink outside partsRoot is unsupported: ${file}`);
  if (!fs.statSync(real).isFile()) throw new Error(`not a file: ${file}`);
  const bytes = fs.readFileSync(real);
  if (!bytes.length) throw new Error(`empty file: ${file}`);
  return { bytes, entry: { path: rel.split(path.sep).join('/'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') } };
}
function snapshot(root, name) {
  const glb = readInside(root, `${name}.glb`), meshFile = readInside(root, `${name}.json`);
  const requestFile = readInside(root, `${name}.request.json`), hashedFile = readInside(root, `${name}.work/request.hashed.json`);
  const mesh = JSON.parse(meshFile.bytes), request = JSON.parse(requestFile.bytes), hashed = JSON.parse(hashedFile.bytes);
  if (request?.contract !== 'A1PartRequest/v1' || hashed?.contract !== 'A1PartRequest/v1' || mesh?.contract !== 'A1PartMesh/v1') throw new Error('unsupported historical request or mesh contract');
  if ([request.name, hashed.name, mesh.name].some((value) => value !== name) || mesh.glb !== `${name}.glb`) throw new Error('historical model names do not match');
  if (typeof mesh.inputHash !== 'string' || !/^[a-f0-9]{16,64}$/.test(mesh.inputHash) || mesh.inputHash !== hashed.inputHash) throw new Error('historical mesh inputHash does not match hashed request');
  for (const [key, value] of Object.entries(request)) {
    if (!Object.hasOwn(hashed, key) || !isDeepStrictEqual(value, hashed[key])) throw new Error(`historical request field does not match hashed request: ${key}`);
  }
  if (request.views && request.image) throw new Error('ambiguous reference mode: both views and image');
  const refs = request.views || (request.image ? { single: request.image } : null);
  if (!refs || typeof refs !== 'object' || Array.isArray(refs) || !Object.keys(refs).length) throw new Error('historical request has no reference images');
  const references = {};
  for (const [key, file] of Object.entries(refs).sort(([a], [b]) => a.localeCompare(b))) {
    if (!(request.views ? ['front', 'back', 'left', 'right'] : ['single']).includes(key)) throw new Error(`unsupported reference view: ${key}`);
    references[key] = readInside(root, file).entry;
  }
  return { inputHash: mesh.inputHash, files: { glb: glb.entry, mesh: meshFile.entry, request: requestFile.entry, hashedRequest: hashedFile.entry, references } };
}
function matches(record, name, current) {
  return record?.contract === LEGACY_MODEL_CONTRACT && record.name === name && record.scope === SCOPE && record.note === NOTE &&
    isDeepStrictEqual(record.requires, REQUIRES) && typeof record.checkedAt === 'string' && Number.isFinite(Date.parse(record.checkedAt)) &&
    record.inputHash === current.inputHash && isDeepStrictEqual(record.files, current.files);
}

// Read-only; never creates a sidecar, updates evidence, or runs generation/QA.
export function legacyModelRevalidationStatus(partsRoot, name) {
  try {
    const root = modelRoot(partsRoot, name), current = snapshot(root, name);
    const record = JSON.parse(readInside(root, `${name}.revalidation.json`).bytes);
    return matches(record, name, current)
      ? { ok: true, scope: SCOPE, requires: [...REQUIRES], record }
      : { ok: false, why: 'revalidation is stale or invalid; a new explicit review is required' };
  } catch (error) { return { ok: false, why: error.message }; }
}

// Explicit operator action. Existing sidecars are immutable: identical inputs
// reuse the original record and timestamp; changed content requires a new review.
export function createLegacyModelRevalidation(partsRoot, name) {
  const root = modelRoot(partsRoot, name), current = snapshot(root, name);
  const file = path.join(root, `${name}.revalidation.json`);
  const record = { contract: LEGACY_MODEL_CONTRACT, name, checkedAt: new Date().toISOString(), scope: SCOPE, note: NOTE, requires: [...REQUIRES], ...current };
  if (!isDeepStrictEqual(current, snapshot(root, name))) throw new Error('model evidence changed during revalidation');
  try { fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const status = legacyModelRevalidationStatus(root, name);
    if (!status.ok) throw new Error(`existing revalidation cannot be overwritten: ${status.why}`);
    return { file, reused: true, record: status.record };
  }
  return { file, reused: false, record };
}
