// Self-contained for page.evaluate: capture at the exact keyframe, never infer a contract.
export function captureLayoutPreflight() {
 const missing=why=>({result:{status:'unknown',errors:[],unknown:[{code:'layout-unknown',why}]},coordinateSpace:'unknown',finalOutput:{status:'unknown',why:'final display pixels not measured'}});
 try {
  if(typeof window.__layoutPreflight!=='function') return missing('contract not declared');
  const value=window.__layoutPreflight();
  if(!value?.result || !['pass','fail','unknown'].includes(value.result.status) || !Array.isArray(value.result.errors) || !Array.isArray(value.result.unknown)) return missing('malformed runtime output');
  return {...value,coordinateSpace:value.coordinateSpace||'inner-content',finalOutput:value.finalOutput||{status:'unknown',why:'inner layout is not final display pixel validation'}};
 } catch(e) {return missing(String(e.message||e));}
}
