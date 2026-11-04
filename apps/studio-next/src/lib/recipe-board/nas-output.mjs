// NAS-backed project output. Existing projects remain local; the link preserves the line's
// project-relative URLs while the project receipt and mount checks prevent local fallback.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const NAS_MOUNT = '/Volumes/personalfolder';
const MARKER = '.a1-output.json';

export function checkNasMount(root) {
  const resolved = path.resolve(root);
  if (!resolved.startsWith(NAS_MOUNT + path.sep)) throw new Error('NAS output must be inside the personalfolder share');
  const mounts = execFileSync('/sbin/mount', { encoding: 'utf8' });
  if (!mounts.split('\n').some((line) => /^\/\/[^@]+@DXP4800PLUS-98E\.local\/personalfolder on \/Volumes\/personalfolder \(smbfs,/.test(line))) throw new Error('expected NAS personalfolder SMB share is not mounted');
  if (!fs.statSync(resolved).isDirectory()) throw new Error('NAS output root is unavailable');
}

export function createNasOutput(root, id, { verify = checkNasMount } = {}) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(id))) throw new Error('invalid project id');
  verify(root);
  const base = path.resolve(root), projects = path.join(base, 'projects');
  fs.mkdirSync(projects, { recursive: true });
  const target = path.join(projects, id);
  fs.mkdirSync(target); // Refuse to overwrite an existing project's output.
  const receipt = { contract: 'A1NasOutput/v1', id, token: crypto.randomUUID(), root: base, target };
  fs.writeFileSync(path.join(target, MARKER), JSON.stringify(receipt) + '\n', { flag: 'wx' });
  return receipt;
}

export function verifyNasOutput(receipt, link, id, { verify = checkNasMount } = {}) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(id)) || !receipt || receipt.contract !== 'A1NasOutput/v1' || receipt.id !== id || !receipt.token ||
      receipt.target !== path.join(receipt.root, 'projects', id)) throw new Error('invalid NAS output receipt');
  verify(receipt.root);
  if (!fs.lstatSync(link).isSymbolicLink() || fs.readlinkSync(link) !== receipt.target) throw new Error('NAS output link does not match project receipt');
  const marker = JSON.parse(fs.readFileSync(path.join(receipt.target, MARKER), 'utf8'));
  if (marker.id !== id || marker.token !== receipt.token || marker.target !== receipt.target) throw new Error('NAS output marker does not match project receipt');
  return receipt.target;
}
