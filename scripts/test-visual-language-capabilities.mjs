import assert from 'node:assert/strict';
const mod = await import('../work/recipe-board-v1/style-lab/engine/templates/visual-language.js').catch(() => ({}));
assert.equal(typeof mod.visualLanguage, 'function', 'shared visualLanguage renderer must exist');
assert.equal(typeof mod.visualLanguageOptions, 'function');
for (const id of ['dither-relief', 'scan-sections', 'technical-editorial']) {
  const spec = mod.visualLanguageOptions({ id, purpose: 'concept', progress: 0.5 });
  assert.equal(spec.id, id);
  assert.equal(spec.progress, 0.5);
}
for (const field of ['progress','density']) {
  assert.equal(mod.visualLanguageOptions({id:'scan-sections'})[field],1,'omission defaults');
  assert.equal(mod.visualLanguageOptions({id:'scan-sections',[field]:undefined})[field],1,'undefined defaults');
  for (const value of [null,NaN,Infinity,-Infinity,'1',false]) {
    assert.throws(()=>mod.visualLanguageOptions({id:'scan-sections',[field]:value}),new RegExp(`visualLanguage: ${field} must be finite`));
  }
  const jsonNaN=JSON.parse(JSON.stringify({id:'scan-sections',[field]:NaN}));
  assert.equal(jsonNaN[field],null);
  assert.throws(()=>mod.visualLanguageOptions(jsonNaN),new RegExp(`visualLanguage: ${field} must be finite`),'JSON-serialized NaN must not become default');
}
const first=mod.visualLanguageOptions({id:'dither-relief'}); first.palette[0]='#ffffff';
assert.equal(mod.visualLanguageOptions({id:'dither-relief'}).palette[0],'#282343','normalized values cannot mutate shared defaults');
for (const invalid of [ {id:'unknown'}, {id:'scan-sections',progress:NaN}, {id:'scan-sections',progress:1.1}, {id:'scan-sections',density:0}, {id:'scan-sections',purpose:'medical-evidence'}, {id:'scan-sections',palette:['red']}, {id:'scan-sections',box:[0,0,-1,10]}, {id:'scan-sections',geometry:{radius:Infinity}}, {id:'scan-sections',geometry:{fake:1}}, {id:'scan-sections',text:'not a template'} ]) assert.throws(() => mod.visualLanguageOptions(invalid), /visualLanguage/);
const {pickDirectorDefaults} = await import('../apps/studio-next/src/lib/recipe-board/directorroutes.mjs');
const fs = await import('node:fs');
const table = JSON.parse(fs.readFileSync(new URL('../work/recipe-board-v1/routing/director-routes.json',import.meta.url)));
const pick = pickDirectorDefaults({kind:'compare',visualPurpose:'structure'},{table});
assert.ok(pick.visualLanguages?.some(x=>x.id==='scan-sections'), 'real director pick exposes suitable shared primitives');
assert.deepEqual(pickDirectorDefaults({medium:'evidence',visualPurpose:'structure'},{table}).visualLanguages, []);
assert.deepEqual(pickDirectorDefaults({visualPurpose:'clean'},{table}).visualLanguages, []);
const morph = fs.readFileSync(new URL('../work/recipe-board-v1/style-lab/engine/templates/morph.js',import.meta.url),'utf8');
assert.match(morph,/type.dev = .*\.\.\.display/);
const {display} = await import('../work/recipe-board-v1/style-lab/engine/templates/kit5.js');
assert.equal(display.visualLanguage,mod.visualLanguage);
const {briefText} = await import('../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs');
const brief = briefText({id:'fixture',chapter:'B01',beats:[{beat:'B01',at:0,dur:2,text:'层次示意'}],routes:{B01:pick}});
assert.match(brief,/scan-sections/);
assert.match(brief,/type.dev.visualLanguage/);
const {loadKitSymbolIndex, selectedDeviceKitErrors} = await import('../apps/studio-next/src/lib/recipe-board/refbreakdown.mjs');
const cfg = {dataDir:new URL('../work/recipe-board-v1/',import.meta.url).pathname};
assert.ok(loadKitSymbolIndex(cfg).has('type.dev.visualLanguage'), 'existing kit checker must recognize the callable');
const catalog = JSON.parse(fs.readFileSync(new URL('../work/recipe-board-v1/routing/devices.json',import.meta.url)));
for (const id of mod.visualLanguageIds) assert.equal(catalog.devices.find(d=>d.id===id)?.kit?.status,'ready');
const symbols=loadKitSymbolIndex(cfg);
assert.deepEqual(selectedDeviceKitErrors([{beat:'B01',devices:mod.visualLanguageIds}],catalog.devices,{symbols}),[]);
assert.equal(selectedDeviceKitErrors([{beat:'B01',devices:['unknown']}],catalog.devices,{symbols}).length,1);
const fakeTable={...table,visualLanguages:table.visualLanguages.map(r=>({...r,export:'notExported'}))};
assert.deepEqual(pickDirectorDefaults({visualPurpose:'concept'},{table:fakeTable}).visualLanguages,[]);
const capabilities=JSON.parse(fs.readFileSync(new URL('../work/recipe-board-v1/routing/engine-capabilities.json',import.meta.url)));
const cap=capabilities.capabilities.find(c=>c.id==='visual-languages');
assert.equal(cap.chapter,'type.dev.visualLanguage');
for(const row of table.visualLanguages) {
  assert.equal(typeof mod[row.export],'function',`real export ${row.export}`);
  assert.ok(capabilities.routes.some(r=>r.device===row.id && r.codeSymbol===row.entry));
}
const P1=await import('../apps/studio-next/src/lib/recipe-board/p1hard.mjs');
assert.deepEqual(P1.engineCapabilitiesSchemaErrors(capabilities),[]);
assert.deepEqual(P1.capabilityRouteResolveErrors(capabilities,catalog.devices),[]);
for(const r of capabilities.routes.filter(r=>mod.visualLanguageIds.includes(r.device))) assert.equal(P1.dispatchCapability(capabilities,r.need).codeSymbol,'type.dev.visualLanguage');
const visualDispatch=P1.dispatchCapability(capabilities,'visual-languages');
assert.equal(visualDispatch.chapterCallable,true);
assert.equal(visualDispatch.codeSymbol,'type.dev.visualLanguage');
assert.equal(visualDispatch.device,'dither-relief','capability dispatch uses first linked route in table order');
assert.equal(visualDispatch.kitPath,'routing/devices.json#dither-relief');
const reversed={...capabilities,routes:[...capabilities.routes].reverse()};
assert.equal(P1.dispatchCapability(reversed,'visual-languages').device,'technical-editorial');
assert.equal(P1.dispatchCapability(capabilities,'made-model').codeSymbol,'kit.props.model','made-model default stays first route');
assert.equal(P1.dispatchCapability(capabilities,'props').codeSymbol,'kit.props.model','chapter symbol is an exact capability-route link');
const dispatchDoc=(routes,status='chapter')=>({capabilities:[{id:'example',chapter:'kit.example',status}],routes});
const linked={capability:'example',device:'example-device',need:'example need',kitPath:'kit/example',codeSymbol:'kit.example.run'};
assert.equal(P1.dispatchCapability(dispatchDoc([linked]),'example').codeSymbol,linked.codeSymbol,'explicit capability link');
for(const routes of [[],[{...linked,capability:undefined,codeSymbol:'kit.exampleOther'}],[{...linked,kitPath:null}],[{...linked,codeSymbol:'   '}],[{...linked,codeSymbol:'device:None'}]]) {
  assert.equal(P1.dispatchCapability(dispatchDoc(routes),'example').chapterCallable,false,'missing/unlinked callable cannot be advertised');
}
for(const field of ['kitPath','codeSymbol']) for(const value of [null,'','   ']) {
  assert.equal(P1.dispatchCapability(dispatchDoc([{...linked,[field]:value}]),'example need').chapterCallable,false);
}
for(const status of ['card','retired']) {
  assert.equal(P1.dispatchCapability(dispatchDoc([linked],status),'example').chapterCallable,false);
  assert.equal(P1.dispatchCapability(dispatchDoc([linked],status),'example need').chapterCallable,false);
}
console.log('visual language: parameters, negative contracts, ready-kit symbols, catalog consistency and route/session consumption passed');
