import assert from 'node:assert/strict';
import {assessArticleCaptureContent} from '../lib/article-capture-content-gate.mjs';
assert.equal(assessArticleCaptureContent({title:'请稍候…',html:'<script src="/cdn-cgi/challenge-platform/test"></script>',textContent:'正在验证'}).reason,'ARTICLE_CAPTURE_ACCESS_CHALLENGE');
assert.equal(assessArticleCaptureContent({title:'Just a moment...',html:'cf-chl-widget',textContent:'Verifying you are human'}).reason,'ARTICLE_CAPTURE_ACCESS_CHALLENGE');
assert.equal(assessArticleCaptureContent({title:'Article',textContent:' \n '}).reason,'ARTICLE_CAPTURE_EMPTY_BODY');
assert.equal(assessArticleCaptureContent({title:'How Cloudflare challenges work',html:'<p>cf-turnstile</p>',textContent:'A substantive article about web verification.'}).articleContentAvailable,true);
assert.equal(assessArticleCaptureContent({title:'Introducing a model',textContent:'An official product announcement.'}).status,'CONTENT_AVAILABLE_FOR_REVIEW');
console.log('PASS challenge interstitials and empty bodies rejected; real articles remain reviewable.');
