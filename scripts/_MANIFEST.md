// A1 System Line Scripts Manifest
// Auto-generated snapshot describing what scripts/ and work/ look like
// after the t3 archive pass. Used as a quick reference so future agents
// don't have to rglob to understand the structure.

| tier | path | count | role |
|------|------|-------|------|
| active (npm) | scripts/*-v1.mjs | ~1020 | reference implementations referenced by package.json or other repo files |
| active (npm) | scripts/*-v2..v7.mjs | ~200 | canonical work referenced by package.json or repo files |
| active (ts) | scripts/*.ts | 16 | TypeScript scripts, all referenced |
| archived | scripts/archive/<base>/v<N>.mjs | 66 | orphan v2+ scripts, never referenced; moved with SHA-256 index |
| attempt archive | work/archive/cap-native-ed*-<attempt> | 20 | cap-native run attempt outputs, never referenced; SHA-256 in _attempts.ndjson |
| canonical work | work/cap-native-ed*-v1/ | 18 | current canonical cap-native run outputs (per-shot reference) |
| work ref | work/cap-native-canary-v1, work/cap-native-preference-v1, work/cap-native-production-v1/v2 | 4 | older canonical runs |
| pilot | work/cap-official-upstream, work/cap-studio-pilot, work/browser-verification, work/headless-* | 8 | pilot runs and official upstream samples |
| research | work/style-research, work/resolve-native-screen-v1, work/native-screen-capture-canary-v1, work/cursor-telemetry-capture-v1, work/current-*, work/clean-*, work/ed01-storyboard-consistency-v1, work/first-episode-motion-direction-v1, work/whole-film-packaging-polish-v1 | 14 | research and historical one-off runs |

To add a new attempt:
  1. Place it in scripts/<base>-vN.mjs (active) or scripts/archive/<base>/vN.mjs (orphan)
  2. If active, reference it in package.json
  3. The archive_orphans.py script can be re-run to sweep fresh orphans

To add a new cap-native attempt:
  1. Place it in work/cap-native-edXX-v1-<attempt-tag>/
  2. Reference its name from any report if you need it preserved
  3. The archive_cap_attempts.py script sweeps un-referenced attempts

If something in scripts/archive/ is needed: re-link via `git mv scripts/archive/<base>/<file>.mjs scripts/<file>.mjs` and re-run `npm install` to refresh lockfile.
