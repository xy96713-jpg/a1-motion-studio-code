# Static delivery boundary

Controlled entry (no render, no user approval):

```sh
node scripts/recipe-board.mjs export-stills --project ID --scope diagnostic --out NEW_DIRECTORY
node scripts/recipe-board.mjs export-stills --project ID --scope design-review --out NEW_DIRECTORY
node scripts/recipe-board.mjs export-stills --project ID --scope mature --out NEW_DIRECTORY
```

`diagnostic` retains failed internal candidates. `design-review` is explicitly a still-image design-review package, not a finished deliverable; the HTML and delivery projection expose blockers. Neither is labelled final/mature. `mature` checks current still-only technical evidence, existing render-input/frame hashes, checker identity, layout evidence, two distinct existing writer/reviewer receipt chains, complete storyboard coverage and both reviewers' per-dimension scores (each >=4, never a mean). Missing inspection/whole-board evidence, stale inputs, failed dimensions and unresolved checks block before any output directory is created. The scope is stills, never motion/audio or user approval.

The existing `stills-taste*.answer.json` holds `maturity`; no parallel acceptance file is introduced. New structured answers use `maturity:null` when not making this claim; historical answers remain untouched and normal `stillsReady`/user gates keep their behavior. Non-null maturity records original-size, downscaled and whole-board inspection, concrete observations, five per-beat dimensions and wholeFilmCoherence overall. These are reviewer assertions, not proof that a human actually opened an image. The exporter consumes raw reviews, not relaxed checklist/arbiter averages. A stills task covering only hero beats cannot claim a complete film. No multi-project maturity aggregator or automatic adjudication migration is implemented.

New actual technical checks persist the already-existing `checksHash()` in `stills.check.json`; absent historical checker identity is unknown at the mature-export boundary only. Do not backfill it or re-sign old reviews. Refresh through ordinary acceptance when production is separately authorized; this repair does not regenerate old projects.

For existing overnight snapshots only:

```sh
node scripts/recipe-board.mjs export-stills --acceptance-file work/banana-full-stills-production-20261030/final-round8-20261031/final-acceptance.json --scope diagnostic --out NEW_DIRECTORY
```

This adapter verifies selected image bytes and exposes historical failures, but **never admits a snapshot as mature**, even if somebody changes its boolean. Snapshots cannot substitute for the live native task chain. `delivery.json` is an export projection, never acceptance authority.

## Discovery / deliberately uncovered paths

There was no unified still-delivery exporter. `stepStills` and `stillsReady` serve technical/design progression; `heroChapter` deliberately permits checked previews (and rejects still-only motion use). `filmTasteGate` is a video-sheet/mean-based gate, not NIGHT strict per-dimension still maturity. `filmBoard` makes an internal board without delivery scope. The overnight `final-round8-20261031/finalize.py` assembled/labelled FINAL even while reporting not mature; it is a historical manual assembler and has NOT been rerun or modified. Rendering, that script, existing UI image links, video export, direct Python/zip/cp and arbitrary shell/chat attachments are not intercepted. Operators must use the explicit CLI for delivery claims. This is not a shell security boundary or a global ban on sending files.

No thresholds, fonts, user design/final approvals or historic banana outputs were changed. No rerender or cron restart is needed for these tests.

## Verification

`TMPDIR=/Users/a1/.hermes/cache/scratch node --test scripts/test-stills-delivery.mjs scripts/test-stills-review-consumer.mjs scripts/test-stills-task-mode.mjs scripts/test-still-review-pack.mjs`

The new suite invokes the real CLI. It includes the real round8 14-stale snapshot and real retained B11 technical-pass project, plus explicitly synthetic receipt-bound positives and 3-versus-5/unknown/stale/tamper negatives. Fixture scores and images are TEST DATA, not visual improvement or production acceptance. Full suite also imports the delivery tests. Runtime logs live in scratch; no fixture writes enter real project tasks.

Verified execution: targeted 16/16 pass; full recipe-board 883 tests, 822 pass, 61 skip, 0 fail. Logs: `/Users/a1/.hermes/cache/scratch/delivery-targeted.log`, `delivery-full-suite.log`, `delivery-real-refusal.log`, `delivery-b11-refusal.log`. Both real mature-export commands exited 1 without creating the output directory. The overnight protection inventory's 7,495 non-target files remain byte-identical; its other three paths are intentionally edited shared consumers/tests, not banana artifacts. Targeted `git diff --check` is clean; global diff still reports pre-existing whitespace in `work/person-packaging-reuse-acceptance-v1/README.md` and `work/recipe-board-v1/AUDIT-skills-sop-20261028.md` (left untouched). No production image was regenerated, no user gate approved and no commit made.
