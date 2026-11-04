#!/usr/bin/env node
import assert from "node:assert/strict";
import {classifyTypographyTreatment} from "../apps/studio-next/src/lib/a1-typography-treatment-policy-v1.mjs";
import {deriveShotIntelligenceDecision} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";

const classify = (input) => classifyTypographyTreatment(input);

const question = classify({sourceText: "既然都用 AI 了，为什么不让它直接写完全文？", editMode: "presenter-overlay", evidenceRoute: "PRESENTER"});
assert.equal(question.strongLanguageEvent, true);
assert.equal(question.baseVisualCarrier, "PRESENTER_BASE");
assert.equal(question.typographyTreatment, "QUESTION_OVERLAY");
assert.equal(question.preferredPresentationMode, "OVERLAY");

const verdict = classify({sourceText: "AI 常常不说人话。", editMode: "presenter-clean", evidenceRoute: "PRESENTER"});
assert.equal(verdict.typographyTreatment, "VERDICT_OVERLAY");

const contrast = classify({sourceText: "中文更顺，但问题并没有彻底解决。", editMode: "presenter-overlay", evidenceRoute: "PRESENTER"});
assert.equal(contrast.typographyTreatment, "CONTRAST_OVERLAY");

const boundary = classify({sourceText: "不通顺、AI 味、不说人话，仍然需要人修改。", editMode: "presenter-clean", semanticRole: "conclusion", evidenceRoute: "PRESENTER"});
assert.equal(boundary.strongLanguageEvent, true);
assert.ok(["KEYWORD_OVERLAY", "VERDICT_OVERLAY"].includes(boundary.typographyTreatment));
for (const phrase of ["不通顺", "AI 味", "不说人话"]) assert.ok(boundary.protectedPhrases.includes(phrase), phrase);

const method = classify({sourceText: "先给材料，再找角度，最后再让 AI 动笔。", editMode: "type-only", semanticRole: "core-method"});
assert.equal(method.typographyTreatment, "PROCESS_TYPE");
assert.equal(method.preferredPresentationMode, "EXPLAINER");
assert.deepEqual(method.protectedPhrases, ["先给材料", "再找角度", "最后再让 AI 动笔"]);

const introducedMethod = classify({sourceText: "所以目前主流的做法，就是先给材料，再找角度，最后再让 AI 动笔。", editMode: "type-only", semanticRole: "core-method"});
assert.deepEqual(introducedMethod.protectedPhrases, ["先给材料", "再找角度", "最后再让 AI 动笔"]);
assert.equal(introducedMethod.protectedPhrases.includes("所以目前主流的做法"), false);

const causeConsequence = classify({sourceText: "材料不够，角度不清，最后就会变成一篇很顺的泛泛而谈。", editMode: "type-only", semanticRole: "decisive-contrast"});
assert.deepEqual(causeConsequence.protectedPhrases, ["材料不够", "角度不清", "泛泛而谈"]);

const ordinary = classify({sourceText: "这段只是补充背景和我的个人感受。", editMode: "presenter-clean", semanticRole: "ordinary-narration", evidenceRoute: "PRESENTER"});
assert.equal(ordinary.strongLanguageEvent, false);
assert.equal(ordinary.typographyTreatment, "NONE");

const screen = classify({sourceText: "打开设置，点击字号并保存。", editMode: "screen-demo", semanticRole: "SCREEN_OR_PRODUCT_EVIDENCE", evidenceRoute: "PRODUCT_PROOF"});
assert.equal(screen.baseVisualCarrier, "SCREEN_EVIDENCE");
assert.equal(screen.strongLanguageEvent, false);

const research = deriveShotIntelligenceDecision({shotId: "fixture-research", order: 1, sourceText: "后来我查了一下关于 AI 写作的研究。", semanticRole: "decisive-contrast", editMode: "presenter-base", packagingType: "FULLSCREEN_PACKAGE", valueAdded: 6, typeFit: 2}, {sourceHash: "fixture"});
assert.equal(research.networkDecision, "REQUIRED");
assert.equal(research.claimType, "research_claim");
assert.equal(research.packageDecision, "PACKAGE");

console.log(JSON.stringify({status: "PASS", cases: 10, presenterStrongLanguageRecall: true, methodActionClausesProtected: true, causeConsequenceInputsProtected: true, screenOperationExcluded: true, researchAxisIndependent: true}, null, 2));
