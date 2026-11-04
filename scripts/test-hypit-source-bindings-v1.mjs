import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolveHypitPackageRootV1,hypitFontPathAllowedV1,SHARED_HYPIT_TOOLCHAIN_V1 as pin} from '../apps/studio-next/src/lib/a1-node-hypit-render-adapter-v1.mjs';
const task=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-hypit-source-bindings-')));
try {
 const root=path.join(task,'local-hypit'),project=path.join(task,'project');fs.mkdirSync(root);fs.mkdirSync(project);
 assert.equal(resolveHypitPackageRootV1(task,{hypitPackageRootRelative:'local-hypit'}),root);
 const shared={hypitPackageRootRepoRelative:pin.repoRelativePath,hypitPackageJsonSha256:pin.packageJsonSha256,hypitCliSha256:pin.cliSha256};
 assert.ok(resolveHypitPackageRootV1(task,shared).endsWith(pin.repoRelativePath));
 for(const bad of [{...shared,hypitPackageRootRepoRelative:'work/unrelated'}, {...shared,hypitCliSha256:'0'.repeat(64)}, {...shared,hypitPackageJsonSha256:'0'.repeat(64)}])assert.throws(()=>resolveHypitPackageRootV1(task,bad),/PIN_MISMATCH/);
 assert.throws(()=>resolveHypitPackageRootV1(task,{hypitPackageRootRelative:'../outside'}),/PATH_INVALID/);
 fs.symlinkSync(root,path.join(task,'link-hypit'));assert.throws(()=>resolveHypitPackageRootV1(task,{hypitPackageRootRelative:'link-hypit'}),/PATH_INVALID/);
 assert.equal(hypitFontPathAllowedV1(path.join(project,'assets','Times.ttf'),project),true);
 assert.equal(hypitFontPathAllowedV1(path.join(task,'unrelated','Times.ttf'),project),false);
 assert.equal(hypitFontPathAllowedV1(path.join(project,'settings.json'),project),false);
 assert.equal(hypitFontPathAllowedV1('/System/Library/Fonts/Supplemental/Times New Roman.ttf',project),false);
 console.log(JSON.stringify({status:'PASS',checks:['legacy-local-toolchain','exact-existing-readonly-package-and-cli-pins','reject-unrelated-root-and-wrong-hashes','reject-traversal-and-symlink','private-project-font-only','reject-arbitrary-system-font-path']},null,2));
} finally {fs.rmSync(task,{recursive:true,force:true});}
