#!/usr/bin/env node
import assert from "node:assert/strict";
import { routeShot } from "../lib/visual-sourcing/visual-router.mjs";
import { isOfficialCandidateForEntities } from "../lib/visual-sourcing/visual-source-resolver.mjs";
import { rankEvidenceCandidates } from "../lib/visual-sourcing/candidate-scorer.mjs";
import { matchCandidatesToShots } from "../lib/visual-sourcing/scene-asset-matcher.mjs";

assert.equal(
  routeShot(
    { screenText: "DeepSeek 官方能力", sourceText: "这里需要看 DeepSeek 官方页面和产品证据" },
    {},
    { articleUrl: "https://example.com/article" },
  ),
  "search",
);

assert.equal(
  routeShot(
    { screenText: "文章配图说明", sourceText: "这一段引用原文网页中的图片和图表" },
    {},
    { articleUrl: "https://example.com/article" },
  ),
  "scrape",
);

assert.equal(
  routeShot(
    { screenText: "核心问题", sourceText: "问题不是模型，而是工作流" },
    { animationTier: "formal-highlight" },
    {},
  ),
  "generate",
);

assert.equal(
  routeShot(
    { screenText: "为什么不对", sourceText: "为什么不对？" },
    {},
    {},
  ),
  "type",
);

const official = {
  id: "official",
  label: "DeepSeek official homepage",
  sourceUrl: "https://www.deepseek.com/",
  url: "https://www.deepseek.com/favicon.ico",
  sourceKind: "duckduckgo-image-search",
  width: 1200,
  height: 675,
};
const blog = {
  id: "blog",
  label: "DeepSeek comparison blog",
  sourceUrl: "https://example.com/deepseek-blog",
  sourceKind: "duckduckgo-image-search",
  width: 768,
  height: 480,
};

official.officialEntityMatch = isOfficialCandidateForEntities(official, ["DeepSeek"]);
blog.officialEntityMatch = isOfficialCandidateForEntities(blog, ["DeepSeek"]);

const ranked = rankEvidenceCandidates([blog, official], { shotText: "DeepSeek 官方能力", entities: ["DeepSeek"] });
assert.equal(ranked[0].candidate.id, "official");

const scores = new Map(ranked.map((item) => [item.candidate.id, item.score]));
const assignments = matchCandidatesToShots(
  [{ screenText: "DeepSeek 官方能力", sourceText: "DeepSeek 官网证据" }],
  [blog, official],
  { candidateScores: scores, minScore: 34 },
);
assert.equal(assignments.get(0).candidate.id, "official");

const figureClip = {
  id: "figure-clip",
  label: "article-figure 16:9 context clip",
  sourceKind: "playwright-selector-clip-screenshot",
  domRole: "article-figure-clip",
  nearbyText: "Figure 1: Frequencies of PubMed abstracts containing certain words and excess vocabulary.",
  localPath: "/tmp/figure-clip.png",
  width: 904,
  height: 817,
  renderAllowed: false,
};
const hugeMain = {
  id: "huge-main",
  label: "main-region locator screenshot",
  sourceKind: "playwright-locator-screenshot",
  domRole: "main-region",
  nearbyText: "Delving into ChatGPT usage in academic writing through excess vocabulary",
  localPath: "/tmp/main.png",
  width: 832,
  height: 21053,
  renderAllowed: false,
};
const pageEvidenceRanked = rankEvidenceCandidates([hugeMain, figureClip], {
  shotText: "研究文章图表 AI 措辞 excess vocabulary",
});
assert.equal(pageEvidenceRanked[0].candidate.id, "figure-clip");

const titleLocator = {
  id: "title-locator",
  label: "article-title locator screenshot",
  sourceUrl: "https://arxiv.org/html/2406.07016v4",
  sourceKind: "playwright-locator-screenshot",
  domRole: "article-title",
  nearbyText: "Delving into ChatGPT usage in academic writing through excess vocabulary",
  localPath: "/tmp/title-locator.png",
  width: 832,
  height: 65,
  renderAllowed: false,
};
const titleFrontMatter = {
  id: "title-front-matter",
  label: "article-title + front-matter context clip",
  sourceUrl: "https://arxiv.org/html/2406.07016v4",
  sourceKind: "playwright-selector-clip-screenshot",
  domRole: "article-title-front-matter",
  nearbyText: "Delving into ChatGPT usage in academic writing through excess vocabulary Dmitry Kobak University of Tübingen",
  localPath: "/tmp/title-front-matter.png",
  width: 904,
  height: 509,
  renderAllowed: false,
};
const pureTitleRanked = rankEvidenceCandidates([titleFrontMatter, titleLocator], {
  shotText: "研究标题 文章标题 Delving into ChatGPT usage in academic writing through excess vocabulary",
});
assert.equal(pureTitleRanked[0].candidate.id, "title-locator");

const titleContextRanked = rankEvidenceCandidates([titleFrontMatter, titleLocator], {
  shotText: "研究标题 作者 机构 affiliation front matter",
});
assert.equal(titleContextRanked[0].candidate.id, "title-front-matter");

const abstractLocator = {
  id: "abstract-locator",
  label: "article-abstract locator screenshot",
  sourceUrl: "https://arxiv.org/html/2406.07016v4",
  sourceKind: "playwright-locator-screenshot",
  domRole: "article-abstract",
  nearbyText: "Abstract Recent large language models can generate and revise text with human-level performance and at least 10% of 2024 abstracts were processed with LLMs.",
  localPath: "/tmp/abstract-locator.png",
  width: 832,
  height: 282,
  renderAllowed: false,
};
const introSection = {
  id: "intro-section",
  label: "article-section 16:9 context clip",
  sourceUrl: "https://arxiv.org/html/2406.07016v4",
  sourceKind: "playwright-selector-clip-screenshot",
  domRole: "article-section-clip",
  nearbyText: "1 Introduction When the world changes, human-written text changes.",
  localPath: "/tmp/intro-section.png",
  width: 904,
  height: 960,
  renderAllowed: false,
};
const abstractRanked = rankEvidenceCandidates([figureClip, introSection, abstractLocator], {
  shotText: "Abstract 摘要 10% of 2024 abstracts were processed with LLMs",
});
assert.equal(abstractRanked[0].candidate.id, "abstract-locator");

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1VisualSourcingRouterTest/v1",
  routes: ["search", "scrape", "generate", "type"],
  officialCandidateWins: true,
  figureClipBeatsHugeMain: true,
  pureTitleLocatorBeatsFrontMatter: true,
  explicitFrontMatterCanWin: true,
  abstractLocatorBeatsIntroAndFigure: true,
}, null, 2));
