#!/usr/bin/env node

import assert from "node:assert/strict";
import {compileArticleMediaOrchestration, assertArticleMediaOrchestration} from "../apps/studio-next/src/lib/a1-article-media-orchestration-v1.mjs";

const understanding={contract:"A1ArticleUnderstanding/v1",analyzerMode:"deterministic-local-v1",sentences:[],sections:[{id:"s1",sourceText:"Children learn through shared reading.",dominantFunction:"setup",relationFromPrevious:"opening",semanticClaim:"children learn",topicKeys:["children"],confidence:.8},{id:"s2",sourceText:"The method creates visible practice.",dominantFunction:"method",relationFromPrevious:"sequence",semanticClaim:"visible practice",topicKeys:["method"],confidence:.8}],coverage:{exact:true},confidence:.8};
const article=compileArticleMediaOrchestration({articleId:"article",title:"Learning",articleText:"Children learn through shared reading. The method creates visible practice.",understanding});
assertArticleMediaOrchestration(article);assert.equal(article.semanticBeats.length,2);assert.equal(article.program.items.length,2);assert.equal(article.boundaries.automaticCandidateSelection,false);
console.log(JSON.stringify({contract:"A1ArticleMediaOrchestrationTest/v1",status:"PASS",beatCount:article.semanticBeats.length,requestCount:article.program.requests.length},null,2));
