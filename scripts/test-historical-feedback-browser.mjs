import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url), {build}=require('esbuild'), {chromium}=require('playwright');
const app=path.resolve('apps/studio-next');
test('historical feedback stays local, identifies candidate, and fails closed on changed bytes', async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import App from './src/app/recipe-board/HistoricalStills';createRoot(document.getElementById('root')).render(<App project="banana-design"/>);`,resolveDir:app,loader:'tsx'},bundle:true,write:false,platform:'browser'});
 const bytes=Buffer.from('fixture image bytes'); const {createHash}=await import('node:crypto'); const sha=createHash('sha256').update(bytes).digest('hex'); let changed=false, writes=0;
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(req.method!=='GET')writes++; if(u.pathname==='/bundle.js'){res.end(bundle.outputFiles[0].contents);return} if(u.pathname.includes('historical-stills')){if(u.searchParams.has('beat')){res.end(changed?'changed':bytes);return}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({project:'banana-design',rows:[{beat:'B01',text:'fixture',source:'fixture/B01.png',recordedStatus:'unknown',sha256:sha,matches:true}]}));return}res.end('<div id="root"></div><script src="/bundle.js"></script>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); let browser;try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('summary').click();await page.getByLabel('B01 修改意见').fill('保留原文\n第二行');await page.getByRole('button',{name:'生成可复制意见'}).click();const output=page.getByLabel('B01 可复制意见');await output.waitFor();let text=await output.inputValue();assert.match(text,/banana-design/);assert.match(text,/B01/);assert.ok(text.includes(sha));assert.ok(text.includes('保留原文\n第二行'));assert.match(text,/历史诊断/);changed=true;await page.getByRole('button',{name:'生成可复制意见'}).click();await page.getByText('图片已变更或无法验证，意见仍保留，请勿套用。').waitFor();assert.equal(await page.getByLabel('B01 修改意见').inputValue(),'保留原文\n第二行');assert.equal(await output.count(),0);assert.equal(writes,0)}finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
});
