#!/usr/bin/env node

import assert from "node:assert/strict";
import {compileExternalMaterialRequest} from "../apps/studio-next/src/lib/a1-external-media-discovery-v1.mjs";
import {assertYouTubeReferenceDiscovery, compileYouTubeReferenceQuery, compileYouTubeReferenceQueryVariants, discoverYouTubeReferenceMetadata} from "../apps/studio-next/src/lib/a1-youtube-reference-search-v1.mjs";

const request = compileExternalMaterialRequest({id: "education-broll", viewerTask: "See children studying together", shotFunction: "ACTION", narrativeRole: "B_ROLL", actions: ["children studying"], locations: ["classroom"], keywords: ["education"], preferredMedia: ["VIDEO"]});
const query = compileYouTubeReferenceQuery(request);
assert.match(query, /children studying/iu);
assert.match(query, /creative commons/iu);
assert.ok(compileYouTubeReferenceQueryVariants(request).some((variant) => /children studying classroom/iu.test(variant)));

const runner = (_executable, args) => {
  if (args.includes("--flat-playlist")) return `${JSON.stringify({id: "cc1", title: "Children Studying", url: "https://www.youtube.com/watch?v=cc1"})}\n${JSON.stringify({id: "standard1", title: "Classroom Commercial", url: "https://www.youtube.com/watch?v=standard1"})}\n`;
  const url = args.at(-1);
  if (url.endsWith("cc1")) return `${JSON.stringify({id: "cc1", title: "Children Studying - Free Stock Creative Commons Video", webpage_url: url, channel: "Freestocks", channel_id: "channel-1", duration: 8, license: "Creative Commons Attribution license (reuse allowed)", availability: "public", age_limit: 0, thumbnail: "https://i.ytimg.com/vi/cc1/maxresdefault.jpg", description: "Children studying in a classroom", formats: [{format_id: "136", ext: "mp4", width: 1280, height: 720, filesize: 2000000, vcodec: "avc1"}]})}\n`;
  return `${JSON.stringify({id: "standard1", title: "Classroom Commercial", webpage_url: url, channel: "Commercial", duration: 10, license: "Standard YouTube License", availability: "public", age_limit: 0, thumbnail: "https://i.ytimg.com/vi/standard1/maxresdefault.jpg", description: "classroom", formats: []})}\n`;
};
const discovery = discoverYouTubeReferenceMetadata(request, {ytDlpPath: "/mock/yt-dlp", runner, limit: 2, detailLimit: 2});
assertYouTubeReferenceDiscovery(discovery);
assert.equal(discovery.counts.ccMetadataFound, 1);
assert.equal(discovery.candidates[0].sourceId, "cc1");
assert.equal(discovery.candidates[0].status, "CC_METADATA_FOUND_REVIEW_REQUIRED");
assert.equal(discovery.candidates[0].boundaries.referenceOnly, true);
assert.equal(discovery.candidates[0].boundaries.automaticDownload, false);
assert.equal(discovery.candidates[1].status, "REFERENCE_ONLY_RIGHTS_UNVERIFIED");

console.log(JSON.stringify({contract: "A1YouTubeReferenceSearchTest/v1", status: "PASS", counts: discovery.counts, top: discovery.candidates[0].sourceId}, null, 2));
