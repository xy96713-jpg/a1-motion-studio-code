# Existing B10 layout — final integration evidence

Scope: existing isolated candidate only. No new creative direction, production banana image/approval changes, audio/video render, commit, or Claude-recovery report edits.

## Main consumer and cache

- `test-recipe-board.mjs`: one awaited named test imports `test-layout-contract.mjs` once, plus `test-layout-consumer.mjs` once.
- `chapter.mjs`: ENGINE_CODE includes `templates/layout-contract.mjs` and `display.js` exactly once. `captureLayoutPreflight` is part of checksHash.
- `runtimeCheck`: at the actual keyframe calls `page.evaluate(captureLayoutPreflight)`; persists the real result in frame-hashed shapes telemetry. Declared fail enters errors; absent/malformed/throwing contracts stay unknown (warning), not green.
- `stills.mjs`: hash-checked telemetry → `reviewPackForCheck` → `buildStillReviewPack` → original still review tasks. Layout status is retained only with current input/frame binding. No blanket layout-coverage claim.
- Inner-content layout and final display are distinct. Formal review materials retain finalOutput unknown unless separately measured. No automatic aesthetic verdict.

## B10 safety repair, without relaxed thresholds

Previous final pixels: title y=85. TYPE top safety is 96; its 24px grid optical alignment tolerance was NOT repurposed to excuse vertical safety. Candidate previously had safe top=90: restored to 96, reading-group top moved from 96 to 112 (only B10).

After real rerender at t=21.65:

| element | inner ink XYWH | final pixel LTRB |
|---|---|---|
| title | 724,111,472,263 | 710,101,1210,365 |
| evidence light carrier | 436.5,423,1047,391 | 435,415,1485,806 |
| source | 805,861,310,35 | 801,849,1119,895 |

Title/evidence final axis difference: 63px before → 0px after. Evidence final side margins 435/435. Source crop remains `[0,339,710,98]`; no source retyping or stretch. The central loss sentence is visible; surrounding partial source lines are not claimed to be the entire article.

Final pixel method is explicit ROI RGB threshold, not OCR/occlusion inference. It measures light carrier rather than quote glyph extent. No aesthetics pass assigned.

Artifacts under `work/banana-representative-stills-reference-20261030/layout-proof/`:
- `after.png`, `after-overlay.png`, `before-after.jpg`
- `after-runtime.json`, `pixel-measurements.json`
- `review/review-pack.json`, `review/review-checklist.md`, `review/verification.json`

Final PNG SHA256: `3a2090f560401a4e035bd353e925b4ef9e1530f382fc64bae12af274ff9e9fcb`.
Supplemental pack: version bound, layout pass (inner contract), finalOutput measured (scoped pixels); integrity true; visualInspection unknown, aestheticVerdict not-assessed, complete false (references not verified). Input scope is the explicit proof-render inventory, not a universal dependency attestation.

## Real formal consumer, isolated from production

Cloned the prior fixture to `/Users/a1/.hermes/cache/scratch/layout-final-consumer-20261030` and placed the current candidate/layout module there. Rebased its B10 absolute asset binding to the cloned source (initial run correctly rejected mismatched publication provenance; no check relaxed).

Real `stepStills` rerendered B02/B04/B10 and rebuilt the original review-task pack:
- state `review`, no aesthetic acceptance;
- all three input/frame versions bound;
- B02/B04 layout unknown; B10 layout pass with three nodes, inner-content;
- finalOutput unknown in the formal inner-frame capture (supplemental display measurements above remain separate);
- whole-film 17 other beats missing, not silently covered;
- old forCheck `80355a57a44cdb4d` → `86ff6e1bfe9680f0`;
- old forAnswer `146283a31ca43a15` → `9fdf2e2c6c668534`, old answer receipts cannot carry.

Evidence: scratch `layout-consumer-evidence.json`; formal pack at `work/recipe-board-v1/projects/banana-design/out/stills-review/86ff6e1bfe9680f0/review-pack.json` inside that scratch root. The historical repository `work/still-review-materials-20261030/review-pack.json` now verifies **false** for changed candidate bytes; not retroactively rebound.

## Verification

- RED: missing layout consumer status/cache wiring tests failed; final-title safety assertion failed on y85.
- Targeted: 18 tests, 18 pass, 0 fail. `/Users/a1/.hermes/cache/scratch/layout-targeted.log`.
- Full `TMPDIR=/Users/a1/.hermes/cache/scratch npm run test:recipe-board`: 831 tests, 770 pass, 61 skipped, 0 fail. `/Users/a1/.hermes/cache/scratch/layout-full-suite.log`.
- Real rerender/measure/pack: `layout-render-final.log`, `layout-measure-final.log`, `layout-review-pack-final.log` in scratch.
- Formal consumer: `layout-formal-consumer.log`, `layout-runtime-evidence.log` in scratch. Runtime test: `scripts/test-layout-runtime-consumer.mjs` with RECIPE_BOARD_REPO_ROOT and RECIPE_BOARD_SOURCE_ROOT set to the isolated root.
- Targeted tracked `git diff --check` passed.

Remaining unknown: independent visual/aesthetic review, general occlusion/OCR, undeclared old layouts, other film beats, motion acceptance. No user gate or review submission was fabricated.
