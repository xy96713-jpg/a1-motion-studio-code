#!/usr/bin/env node
process.env.A1_VISUAL_SYSTEM_PHASE_ID = "visual-system-full-review-v1";
await import("./build-hyperframes-visual-system-pilot-v1.mjs");
