import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {bundleRemotionExactPublicV1, REMOTION_SMOKE_OUTPUT_MAX_BYTES, assertFreshRemotionOutputPathV1} from '../apps/studio-next/src/lib/a1-p45-remotion-build-consumer-v1.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Import is pure. Called only by the existing parent-owned, bridge-reserved process-group worker.
// There is deliberately no standalone execution CLI or automatic claim/retry.
export async function runRemotionPublicBundleSmokeV1({outputRoot, workDeadlineMs, onCheckpoint}) {
  if (!path.isAbsolute(outputRoot || '') || fs.existsSync(outputRoot)
    || !Number.isFinite(workDeadlineMs) || workDeadlineMs <= Date.now()) throw new Error('SMOKE_FRESH_OWNED_OUTPUT_AND_DEADLINE_REQUIRED');
  const started = Date.now(), cases = [];
  assertFreshRemotionOutputPathV1(outputRoot);
  const check = () => { if (Date.now() >= workDeadlineMs) throw new Error('SMOKE_WORK_DEADLINE'); };
  const checkpoint = (stage) => { check(); onCheckpoint?.({stage, elapsedMs: Date.now() - started}); };
  // A valid 1x1 fixture. Never imports or copies the renderer's default public directory.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9F0AAAAASUVORK5CYII=', 'base64');
  fs.mkdirSync(outputRoot, {recursive: false});
  let totalNewBytes = 0;
  try {
    for (const id of ['empty-public', 'exact-tiny-public']) {
      checkpoint(id + ':PREPARE');
      const directory = path.join(outputRoot, id); fs.mkdirSync(directory);
      const entryPoint = path.join(directory, 'entry.tsx'), publicDir = path.join(directory, 'public'), outDir = path.join(directory, 'bundle');
      const assets = [];
      if (id === 'exact-tiny-public') {
        const source = path.join(directory, 'fixture.png'); fs.writeFileSync(source, png, {flag: 'wx'});
        assets.push({absolutePath: source, bytes: png.length, sha256: sha(png), name: sha(png) + '.png'});
        totalNewBytes += png.length;
      }
      const source = `import React from 'react';\nimport {Composition,registerRoot,Img,staticFile} from 'remotion';\nconst Frame=()=>${assets.length ? `<Img src={staticFile('${assets[0].name}')} />` : '<div>empty public smoke</div>'};\nregisterRoot(()=> <Composition id="Smoke" component={Frame} width={16} height={16} fps={30} durationInFrames={1} />);\n`;
      fs.writeFileSync(entryPoint, source, {flag: 'wx'}); totalNewBytes += Buffer.byteLength(source);
      // Each case is capped at 9.5 MiB, leaving 1 MiB for fixtures/receipts under the total 20 MiB.
      checkpoint(id + ':BUNDLE');
      const result = await bundleRemotionExactPublicV1({entryPoint, outDir, publicDir, assets,
        compact: true, maximumOutputBytes: 9.5 * 1024 ** 2});
      totalNewBytes += result.totalNewBytes; check();
      if (totalNewBytes > REMOTION_SMOKE_OUTPUT_MAX_BYTES) throw new Error('SMOKE_TOTAL_OUTPUT_LIMIT');
      cases.push({id, ...result, elapsedMs: Date.now() - started});
      checkpoint(id + ':PUBLIC_BYTES_VERIFIED');
    }
    return {status: 'PASS_REAL_BUNDLE_PUBLIC_BYTES_ONLY', actualStartUTC: new Date(started).toISOString(),
      elapsedMs: Date.now() - started, cases, totalNewBytes, maximumOutputBytes: REMOTION_SMOKE_OUTPUT_MAX_BYTES,
      realBundles: 2, realBrowser: 0, realEncoder: 0, renderFrames: 0, largeMediaCopy: 0,
      automaticRetry: false, filesDeleted: 0, productionAdmission: false, visualApproval: 'NOT_GRANTED'};
  } catch (error) {
    error.smokePartial = {status: 'FAIL_BOUNDED_BUNDLE_SMOKE', cases, totalNewBytes,
      elapsedMs: Date.now() - started, outputRoot, evidenceRetained: true, automaticRetry: false};
    throw error;
  }
}
