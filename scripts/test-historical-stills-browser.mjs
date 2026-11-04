// Browser integration: real board/client components, fixture-only HTTP on an ephemeral port.
// Not part of the offline suite: requires Playwright Chromium.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {build} = require('esbuild');
const {chromium} = require('playwright');
const app = path.join(root, 'apps/studio-next');

test('project changes ignore out-of-order board and historical responses', {timeout:60000}, async () => {
  const bundle = await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Board from './src/app/recipe-board/RecipeBoardClient'; createRoot(document.getElementById('root')).render(<Board/>);`, resolveDir:app, loader:'tsx'}, bundle:true, write:false, platform:'browser', plugins:[{name:'link', setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import React from 'react'; export default function Link({children,...p}){return <a {...p}>{children}</a>}`,loader:'jsx',resolveDir:app}));}}]});
  const projects=['alpha','banana-design','beta'].map(id=>({id,title:id,hasShots:true}));
  const board=id=>({project:{id,title:id},projects,counts:{total:0,pass:0,reject:0,pending:0,todo:0},recipes:[],handRepair:{},rows:[],gates:null,lineStatus:null,statusError:null});
  const held=[];
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/bundle.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(bundle.outputFiles[0].contents);return;}
    if(url.pathname==='/api/recipe-board'){const id=url.searchParams.get('project')||'alpha';if(id==='banana-design' && held.length===0){held.push(res);return;}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(board(id)));return;}
    if(url.pathname==='/api/recipe-board/historical-stills'){held.push(res);return;}
    res.writeHead(200,{'content-type':'text/html'});res.end('<div id="root"></div><script src="/bundle.js"></script>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try {
    browser=await chromium.launch({headless:true});const page=await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/?project=alpha`);
    await page.locator('select').waitFor();
    await page.selectOption('select','banana-design');
    await page.waitForFunction(()=>document.body.textContent.includes('加载中'));
    await page.selectOption('select','beta');
    await page.waitForFunction(()=>location.search==='?project=beta');
    assert.equal(held.length,1);
    held[0].writeHead(200,{'content-type':'application/json'});held[0].end(JSON.stringify(board('banana-design')));
    await page.waitForTimeout(250);
    assert.equal(await page.locator('select').inputValue(),'beta');
    assert.equal(await page.locator('summary').count(),0);
    await page.selectOption('select','banana-design');
    await page.waitForFunction(()=>location.search==='?project=banana-design');
    await page.locator('summary').waitFor();
    await page.waitForFunction(()=>document.body.textContent.includes('读取中'));
    await page.selectOption('select','beta');
    await page.waitForFunction(()=>location.search==='?project=beta');
    assert.equal(held.length,2);
    held[1].writeHead(200,{'content-type':'application/json'});held[1].end(JSON.stringify({project:'banana-design',rows:[{beat:'B01',text:'STALE_FIXTURE',recordedStatus:'unknown',matches:false,sha256:'0',source:'fixture'}]}));
    await page.waitForTimeout(250);
    assert.equal(await page.locator('select').inputValue(),'beta');
    assert.equal(await page.locator('summary').count(),0);
    assert.equal(await page.getByText('STALE_FIXTURE').count(),0);
  } finally { for(const res of held) if(!res.writableEnded) res.end(); if(browser) await browser.close(); await new Promise(r=>server.close(r)); }
});
