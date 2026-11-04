#!/usr/bin/env node

import assert from "node:assert/strict";
import {compileOpenSourceTypographyStack, openSourceTypographyProhibitedImports, openSourceTypographySourceCatalog} from "../apps/studio-next/src/lib/a1-open-source-typography-stack-v1.mjs";

const stack = compileOpenSourceTypographyStack();
const sources = openSourceTypographySourceCatalog();
const prohibited = openSourceTypographyProhibitedImports();

assert.equal(stack.contract, "A1OpenSourceTypographyStack/v1");
assert.equal(stack.renderAuthority.join("+"), "remotion+hyperframes");
assert.deepEqual(stack.directRuntimeDependencies, ["fontkit"]);
assert(sources.length >= 8);
assert(sources.some((source) => source.id === "foliojs/fontkit" && source.integrationMode === "DIRECT_EXISTING_DEPENDENCY"));
assert(sources.some((source) => source.id === "bradley/Blotter" && source.integrationMode === "MATERIAL_REFERENCE_NO_DEPENDENCY"));
assert(sources.some((source) => source.id === "motion-canvas/motion-canvas" && source.integrationMode === "MOTION_REFERENCE_NO_SECOND_RENDERER"));
assert(prohibited.includes("external-product-shell"));
assert(prohibited.includes("second-render-authority"));
assert.equal(stack.reviewBoundary.productionAdmission, false);
assert.equal(stack.reviewBoundary.motionAdmission, false);

console.log(JSON.stringify({
  contract: "A1OpenSourceTypographyStackTest/v1",
  status: "PASS",
  sourceCount: sources.length,
  directRuntimeDependencies: stack.directRuntimeDependencies,
  checks: ["single-a1-owner", "fontkit-only-direct-runtime", "no-external-shell", "no-second-render-authority", "review-only"],
}, null, 2));
