import {buildFfmpegFrameSelectFilterV1} from '../apps/studio-next/src/lib/a1-node-ffmpeg-frame-extractor-v1.mjs';
// Pure argv generation only; consumers retain their own lease, SHA and deadline guards.
console.log(JSON.stringify({filter:buildFfmpegFrameSelectFilterV1(JSON.parse(process.argv[2]))}));
