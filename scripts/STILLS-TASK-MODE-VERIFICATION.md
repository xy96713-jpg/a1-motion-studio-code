# Still-only acceptance scope

Production changes: `stills.mjs`, `chapter.mjs`, `profile.mjs`.

- The formal `stepStills` task, runtime call, check and review input carry `taskMode: "stills"`. Runtime's default remains `motion`; unknown modes throw. No project-wide motion exemption.
- Stills skip event implementation/runtime evidence, frozen/idle/motion/seam checks and narration/read-duration timing. Geometry, loaded assets, source numbers, subject/pipeline checks, type bible and actual loaded-font cmap checks stay active. No filtering of arbitrary runtime errors by `STILLS:` prefix in this mode.
- `typeBible: true` is the explicit HOUSE/TYPE authority scope. Old brightness bands/low-key, free-type density and on-object word quota become persisted review notes. Legacy projects keep their hard profile checks. Readability and spatial checks never downgrade. Notes are not instructions to modify approved design.
- Source classification uses existing `materials/bindings.json` entries: `caption`, four-digit publication `year`, `url`, and `file`. Runtime requires a matching beat and a real file in loaded assets. Only the exact caption's matching publication year is exempt from narration membership. Wrong year, extra numbers, unrelated numeric claims and an unbound citation still fail. Renderer split glyph runs use their whole line for citation matching. This is metadata consistency, not automated verification that the publisher's assertion is true.
- New still-only checks cannot become `heroChapter` motion-checked output. They must graduate through normal chapter acceptance. Legacy checks without the new task-mode field retain the old consumer behavior; no existing project/check/approval was rewritten here.

## Tests

Offline regression is imported by `scripts/test-recipe-board.mjs`:

```sh
TMPDIR=/Users/a1/.hermes/cache/scratch node scripts/test-stills-task-mode.mjs
TMPDIR=/Users/a1/.hermes/cache/scratch npm run test:recipe-board
```

Real browser consumers (opt-in; guard refuses non-scratch repo roots):

```sh
export RECIPE_BOARD_REPO_ROOT=/Users/a1/.hermes/cache/scratch/stills-mode-acceptance-20261030
export RECIPE_BOARD_SOURCE_ROOT="$RECIPE_BOARD_REPO_ROOT"
export TMPDIR=/Users/a1/.hermes/cache/scratch
node scripts/test-stills-runtime-consumer.mjs
node scripts/test-stills-runtime-negative.mjs
node scripts/test-stills-runtime-consumer.mjs
```

Fixture: APFS copy of the existing isolated `representative-stills-l5l4w0de`, not the production banana project. Existing B02 mesh / B04 raster / B10 filmed source candidate used unchanged for the positive test. Its B10 loaded source file received publication metadata in the **isolated** bindings file. No layout fix, animation or audio generated.

Observed RED: formal entry rejected the three unchanged stills for five frozen/idle errors, B10 legacy luma band and publication year. Observed GREEN: three keyframes, state `review`, errors empty, profile notes retained. Separate real-render negative mutation: B02 clipped type, B04 U+10FFFF unsupported glyph, B10 false publication year 2006; all rejected by their actual consumers. Negative test restores answer bytes in finally. Promotion regression first returned a hero chapter despite still-only check; after guard it returns null.

Evidence in scratch root: `stills-task-mode-result.json`, `stills-negative-result.json`, project `tasks/stills.check.json`, keyframes and shapes/font telemetry. These are technical results, not blind review or user approval. Full-suite log: `/Users/a1/.hermes/cache/scratch/stills-mode-full-suite-final.log`.

Limitations: metadata is authored provenance, not a universal fact checker; hard-coded bitmap text/source crops still need source/visual review. These tests do not claim mature aesthetics, and do not fix the independent B10 layout bug. Future chapter production must validate motion afresh.
