# Asset operation preflight — two-stage production contract

Run `node scripts/test-asset-operations.mjs`, `npm run test:recipe-board`, and `node scripts/probe-director-consumers.mjs`. Fixtures are isolated under TMPDIR; no production banana answer or approval is changed. The browser probe restores the original dither/静态字组 consumers **alongside**, not instead of, its pinned PNG positive.

## Contracts

`assetOperationPreflight` is read-only, returning `{errors,evidence,pending}`. `phase:'prepare'` is admission to production, NOT final operational success. Default phase is final and rejects unresolved generation.

- Existing raster/layer/GLB: full SHA-256 pins, real byte decode/parse, actual consumer files. Per-object requires parsed layer IDs / reachable mesh node names. Fake layers, absent targets, changed bytes and unsupported deformation remain blocked.
- Pending art: `source:'generated',use:'art',file:'art:<answer.art key>',sha256:'pending'`. A nonempty prompt, no existing art.file, and a parsed images key in a renderer export are required. Only whole-image hold/camera/reveal is producible by this interface. Comments do not count as consumers.
- Pending model: `file:'model:<name>',sha256:'pending'`, matching the chapter's `modelsNamed` task and nonempty `what`; mesh operations only. Existing partset, provenance, model QA and independent visual-review gates remain in place. Per-object targets are checked against the resulting GLB, not assumed from the task.
- Static code/type: `source:'code',operability:'code',operation:'hold',file:'module:fg'`, full SHA-256 of **answer.code**, and `targets` containing actual direct renderer calls. Supported type anchors: `type.flat.typeBlock`, `type.flat.pair`, `type.flat.spreadWord`; art anchor: `type.dev.visualLanguage`. An arbitrary JS file or code declaration is not proof. The bounded parser rejects comments, nested helper declarations, unsupported/missing anchors, and calls after an unconditional return/throw. This is not general JS control-flow or aesthetic verification.

`prepareAssets` first validates requirements, then runs existing generators, then inspects actual output paths/hashes/targets. It writes a code/design/production-bound receipt under `out/asset-operations/<group>.json` only on success. Failed generation invalidates its receipt. Repeat preparation checks previous pins instead of silently accepting changed cached bytes. Runtime checks, animatic, draft render, final preflight (including cache hits) and final rendering re-read bytes before proceeding.

## What the tests actually execute

- Real on-disk synthetic raster decoding, layer dependency hashing, and binary GLB parsing.
- Real `prepareAssets` code path with a narrowly injected `generateArt` stub for pending art success/failure. The stub returns a real synthetic PNG; **no paid image generation, Hunyuan, Blender model production or independent asset QA is claimed**.
- Pending model admission/final binding protocol with a real synthetic triangle GLB; no real model generator invocation.
- Changed pending output rejection both at render entry and repeat preparation; failure cannot reuse a prior receipt.
- Real Chromium rendering through `stepStills`, `runtimeCheck`, and `stepChapters`, retaining code/type and pinned raster positives, missing-contract negatives, derived-font byte/cache checks, and partial chapter coverage checks.

Evidence provenance remains a local same-beat ledger match (canonical file, full hash, real source URL/credit); it is not forensic authentication. Technical consumer success does not approve a design, a film, or an aesthetic delivery.
