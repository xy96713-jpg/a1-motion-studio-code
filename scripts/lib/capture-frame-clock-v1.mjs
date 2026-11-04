// Bounds the usable recording with two visible pre/post markers.
// It proves capture boundaries, not all intermediate event timestamps.
export function locateCaptureWindow({timestamps, coverage, wallDurationMs, toleranceMs = 120}) {
  if (!Array.isArray(timestamps) || timestamps.length !== coverage?.length || timestamps.length < 8
    || !Number.isFinite(wallDurationMs) || wallDurationMs <= 0
    || !Number.isFinite(toleranceMs) || toleranceMs < 0
    || timestamps.some((t,i) => !Number.isFinite(t) || (i>0 && t<=timestamps[i-1]))
    || coverage.some(v => !Number.isFinite(v) || v<0 || v>1)) throw new Error('CAPTURE_CLOCK_INPUT_INVALID');
  const runs=[];
  for(let i=0;i<coverage.length;i++) {
    if(coverage[i]<.9)continue;
    const start=i;while(i+1<coverage.length && coverage[i+1]>=.9)i++;
    if(i-start+1>=3)runs.push({start,end:i+1});
  }
  if(runs.length!==2)throw new Error('CAPTURE_CLOCK_MARKER_PAIR_REQUIRED');
  let start=runs[0].end,end=runs[1].start;
  while(start<end && coverage[start]>.01)start++;
  while(end>start && coverage[end-1]>.01)end--;
  if(end<=start || coverage.slice(start,end).some(v=>v>.01))throw new Error('CAPTURE_CLOCK_CLEAN_WINDOW_REQUIRED');
  const durationMs=(timestamps[end]-timestamps[start])*1000;
  const durationErrorMs=durationMs-wallDurationMs;
  if(Math.abs(durationErrorMs)>toleranceMs)throw new Error('CAPTURE_CLOCK_DURATION_MISMATCH');
  return {contract:'A1PixelCaptureWindow/v1',status:'BOUNDARIES_VERIFIED',startFrame:start,endFrameExclusive:end,startSeconds:timestamps[start],endSeconds:timestamps[end],durationMs,wallDurationMs,durationErrorMs,toleranceMs,scope:'CAPTURE_BOUNDARIES_ONLY'};
}
