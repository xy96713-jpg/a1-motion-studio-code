#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertYouTubeCcSegmentManifest, compileYouTubeCcSegmentManifest} from "../apps/studio-next/src/lib/a1-youtube-cc-segment-manifest-v1.mjs";

const sha=(letter)=>letter.repeat(64);
const candidate={id:"generic-candidate",genre:"education",viewerTask:"see a visible learning action",query:"student writing",title:"Generic CC source",publisher:"Publisher",sourcePageUrl:"https://www.youtube.com/watch?v=generic",license:{name:"Creative Commons Attribution license (reuse allowed)",status:"PASS_FOR_REVIEW_ONLY"},source:{publicUrl:"/generated/system-line/editorial-asset-workbench-v1/youtube-cc-media-candidates-v1/generic/source.mp4",sha256:sha("a"),bytes:1000,width:1280,height:720,durationMs:10000},selected:{publicUrl:"/generated/system-line/editorial-asset-workbench-v1/youtube-cc-media-candidates-v1/generic/selected.mp4",sha256:sha("b"),keyframePublicUrl:"/generated/system-line/editorial-asset-workbench-v1/youtube-cc-media-candidates-v1/generic/key.png",inMs:1000,outMs:5000,semanticScore:.8,fullDecode:true}};
const manifest=compileYouTubeCcSegmentManifest({generatedAt:"2026-09-18T00:00:00.000Z",candidates:[candidate],contactSheetPublicUrl:"/generated/system-line/editorial-asset-workbench-v1/youtube-cc-media-candidates-v1/contact-sheet.png",contactSheetSha256:sha("c"),downloader:{adapter:"yt-dlp",version:"test"}});
assertYouTubeCcSegmentManifest(manifest);
assert.equal(manifest.status,"READY_FOR_USER_REVIEW");
assert.equal(manifest.boundaries.automaticAdoption,false);
assert.equal(manifest.candidates[0].productionUseAllowed,false);

const blocked=compileYouTubeCcSegmentManifest({candidates:[{...candidate,license:{name:"Standard YouTube License",status:"PASS_FOR_REVIEW_ONLY"}}]});
assert.equal(blocked.status,"BLOCKED");
assert.throws(()=>assertYouTubeCcSegmentManifest(blocked),/manifest-blocked/u);

console.log(JSON.stringify({contract:"A1YouTubeCcSegmentWorkbenchTest/v1",status:"PASS",candidateCount:manifest.counts.candidateCount,boundary:manifest.boundaries},null,2));
