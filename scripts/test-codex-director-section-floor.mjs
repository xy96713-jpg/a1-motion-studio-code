import assert from "node:assert/strict";
import { mustRestoreBaselineSectioning } from "../apps/studio-next/src/lib/a1-codex-director-section-floor.js";

assert.equal(
  mustRestoreBaselineSectioning({ sentenceCount: 6, baselineSectionCount: 4, candidateSectionCount: 3 }),
  true,
  "a six-sentence tutorial must not lose its checking/method beat when Codex compresses a four-section baseline into three sections",
);
assert.equal(
  mustRestoreBaselineSectioning({ sentenceCount: 6, baselineSectionCount: 4, candidateSectionCount: 4 }), false);
assert.equal(
  mustRestoreBaselineSectioning({ sentenceCount: 4, baselineSectionCount: 3, candidateSectionCount: 3 }), false);

console.log(JSON.stringify({ ok: true, contract: "A1CodexDirectorSectionFloorTest/v1" }, null, 2));
