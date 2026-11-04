#!/usr/bin/env node

import assert from "node:assert/strict";
import {classifySourceAsset, SOURCE_PRESENTATION_ROUTES} from "../apps/studio-next/src/lib/a1-source-presentation-routing-v1.mjs";

const generatedPaperBackground = {id: "bg-warm-paper-dot", route: "editorial-artwork", assetUri: "/generated/bg-warm-paper-dot.png", provenance: {sourceType: "generated-article-pack", sourceUri: "/generated/bg-warm-paper-dot.png"}};
const aclPaper = {id: "acl", route: "network-source", assetUri: "/generated/acl.png", provenance: {sourceType: "peer-reviewed-primary-research-source", sourceUri: "https://aclanthology.org/paper/", doi: "10.1/test"}};
const localArticle = {id: "article", route: "verified-real-source", assetUri: "/generated/article.png", provenance: {sourceType: "real-local-writing-workbench", sourceUri: "http://127.0.0.1/document"}};
const externalImage = {id: "image", route: "network-source", assetUri: "/generated/photo.jpg", provenance: {sourceType: "external-image", sourceUri: "https://example.com/photo.jpg"}};

assert.equal(classifySourceAsset(generatedPaperBackground), null, "visual paper texture must not become a research paper source");
assert.equal(classifySourceAsset(aclPaper), "PAPER");
assert.equal(classifySourceAsset(localArticle), "ARTICLE");
assert.equal(classifySourceAsset(externalImage), "IMAGE");
assert.deepEqual(Object.values(SOURCE_PRESENTATION_ROUTES), ["SOURCE_WINDOW", "CROP_ANNOTATION", "SOURCE_COLLAGE"]);
console.log(JSON.stringify({status: "PASS", contract: "A1SourcePresentationRoutingTest/v1", falsePaperClassificationBlocked: true, formalRoutes: Object.values(SOURCE_PRESENTATION_ROUTES)}, null, 2));
