import { representativePreviewTime } from "../apps/studio-next/src/lib/a1-preview-frame.ts";

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const endCard = representativePreviewTime({ startSec: 20, endSec: 24.2 }, "end-card");
const method = representativePreviewTime({ startSec: 0, endSec: 3.8 }, "progress-steps");
const title = representativePreviewTime({ startSec: 5, endSec: 8 }, "title-split");
const short = representativePreviewTime({ startSec: 10, endSec: 10.8 }, "quote-card");

assert(Math.abs(endCard - 21.764) < 0.001, `end-card representative time is wrong: ${endCard}`);
assert(Math.abs(method - 1.596) < 0.001, `method representative time is wrong: ${method}`);
assert(Math.abs(title - 6.02) < 0.001, `title representative time is wrong: ${title}`);
assert(short > 10 && short < 10.8, `short shot representative time must stay in range: ${short}`);
assert(representativePreviewTime({ startSec: 3, endSec: 3 }, "end-card") === 3, "zero-duration shot must stay at start");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  contract: "A1RepresentativePreviewFrameTest/v1",
  samples: { endCard, method, title, short },
}, null, 2));
