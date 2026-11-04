#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "remotion-renderer/src/OperationPackagingProofV2.tsx"), "utf8");
assert.match(source, /scale: 1\.18/u);
assert.doesNotMatch(source, /scale: 1\.[3-9]/u);
assert.match(source, /CAPTURE_SYNCHRONIZED_DOM_POINTER/u);
assert.match(source, /exact-pressed-target/u);
assert.match(source, /result-only/u);
assert.match(source, /SENTENCE_HOLD/u);
assert.match(source, /PANEL_HOLD/u);
assert.match(source, /RESULT_HOLD/u);
assert.equal((source.match(/blendCamera\(/gu) || []).length, 3, "exactly three camera moves required");
console.log(JSON.stringify({status: "PASS", contract: "A1OperationPackagingProofV2StaticGate/v1", maxScale: 1.18, cameraMoveCount: 3, capturedPointer: true, exactPressedTargetFeedback: true, resultOnlyAnnotation: true}, null, 2));
