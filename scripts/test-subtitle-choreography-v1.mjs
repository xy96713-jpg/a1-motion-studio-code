import assert from "node:assert/strict";
import {buildSubtitleChoreographyV1, validateSubtitleChoreographyV1} from "../apps/studio-next/src/lib/a1-subtitle-choreography-v1.mjs";
import {compileTypographyBeatStateProgramV1, deriveTypographyBeatStateInputV1} from "../apps/studio-next/src/lib/a1-typography-beat-state-director-v1.mjs";

const source = "第一段保留主题。第二段解释原因。第三段说明操作。第四段说明结果。第五段保留限制。";
const estimated = buildSubtitleChoreographyV1({shotId: "estimate", sourceText: source, durationFrames: 90});
assert.deepEqual(validateSubtitleChoreographyV1(estimated), []);
assert.equal(estimated.timingSource, "shot-duration-estimate");
assert.equal(estimated.copyCoverage.exact, true);
assert.ok(estimated.chunks.at(-1).endFrame <= 90);

const aligned = buildSubtitleChoreographyV1({
  shotId: "audio",
  sourceText: "自然语言控制允许描述目标。",
  durationFrames: 90,
  wordTimings: [
    {text: "自然语言", startSec: 0.1, endSec: 0.55},
    {text: "控制", startSec: 0.56, endSec: 0.8},
    {text: "允许", startSec: 0.9, endSec: 1.1},
    {text: "描述目标。", startSec: 1.12, endSec: 1.55},
  ],
});
assert.deepEqual(validateSubtitleChoreographyV1(aligned), []);
assert.equal(aligned.timingSource, "audio-word-aligned");
assert.ok(aligned.chunks.every((chunk) => chunk.endFrame <= 90));

const broken = structuredClone(estimated);
broken.chunks[0].endFrame = 91;
assert.ok(validateSubtitleChoreographyV1(broken).includes("subtitle-outside-shot"));
const protectedRegion = buildSubtitleChoreographyV1({shotId: "protected", sourceText: "字幕区域测试。", durationFrames: 90, protectedBoxes: [{x: 0, y: 0.8, width: 1, height: 0.2}]});
assert.ok(validateSubtitleChoreographyV1(protectedRegion).includes("caption-over-protected-region"));

const beatInput = deriveTypographyBeatStateInputV1({
  shotId: "beat-audio",
  exactCopy: "自然语言控制\n允许描述目标",
  typographyRole: "EXPLANATION_DIAGRAM",
  semanticEvent: "PROCESS",
  durationFrames: 90,
  audioWordTimings: [
    {text: "自然语言", startSec: 0.1, endSec: 0.55},
    {text: "控制", startSec: 0.56, endSec: 0.8},
    {text: "允许", startSec: 0.9, endSec: 1.1},
    {text: "描述目标", startSec: 1.12, endSec: 1.55},
  ],
});
assert.equal(beatInput.subtitleBoundary.timeline.timingSource, "audio-word-aligned");
assert.deepEqual(validateSubtitleChoreographyV1(beatInput.subtitleBoundary.timeline), []);
assert.equal(compileTypographyBeatStateProgramV1(beatInput).status, "PASS_REVIEW_ONLY");

console.log(JSON.stringify({contract: "A1SubtitleChoreographyTest/v1", status: "PASS", estimatedChunks: estimated.chunks.length, alignedChunks: aligned.chunks.length, coverage: estimated.copyCoverage.exact}, null, 2));
