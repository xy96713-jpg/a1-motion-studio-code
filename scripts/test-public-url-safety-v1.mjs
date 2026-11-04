#!/usr/bin/env node
import assert from "node:assert/strict";
import {canonicalPublicHttpUrlV1,isPublicNetworkAddressV1,isLoopbackNetworkAddressV1,assertPublicHttpTargetV1,fetchPublicArticleHtmlV1,resolveLoopbackHttpTargetV1} from "../apps/studio-next/src/lib/a1-public-url-safety-v1.mjs";

for(const address of ["0.1.2.3","10.1.2.3","100.64.0.1","127.0.0.1","169.254.2.3","172.16.0.1","172.31.255.254","192.0.2.1","192.168.1.1","198.18.0.1","203.0.113.5","224.0.0.1","240.0.0.1","::","::1","::ffff:127.0.0.1","fc00::1","fd00::1","fe80::1","ff02::1","2001:db8::1","2001:0::1","2001:10::1","2002::1","64:ff9b::808:808","100::1"]){
  assert.equal(isPublicNetworkAddressV1(address),false,`${address} must fail closed`);
}
for(const address of ["8.8.8.8","93.184.216.34","2606:4700:4700::1111"]){assert.equal(isPublicNetworkAddressV1(address),true,`${address} is public`);}
// Protocol assignments and TEST-NET-1 are /24 ranges, not all of 192.0/16.
for(const address of ["192.0.1.0","192.0.1.255","192.0.3.0","192.0.66.199","192.0.255.255"]){
  assert.equal(isPublicNetworkAddressV1(address),true,`${address} is outside the blocked /24 ranges`);
}
for(const address of ["192.0.0.0","192.0.0.1","192.0.0.255","192.0.2.0","192.0.2.255","192.168.0.0","192.168.255.255","198.18.0.10","198.19.255.255"]){
  assert.equal(isPublicNetworkAddressV1(address),false,`${address} must remain blocked`);
}
const reviewedPublicLookup=async()=>[{address:"192.0.66.199",family:4},{address:"2606:4700:4700::1111",family:6}];
assert.equal((await assertPublicHttpTargetV1("https://example.com/",{lookup:reviewedPublicLookup})).addressCount,2);
for(const blocked of [{address:"192.0.0.1",family:4},{address:"192.0.2.1",family:4},{address:"198.18.0.10",family:4},{address:"::1",family:6}]){
  let connections=0;
  await assert.rejects(fetchPublicArticleHtmlV1("https://example.com/",{
    lookup:async()=>[{address:"192.0.66.199",family:4},blocked],
    requestImpl:async()=>{connections+=1;throw new Error("must-not-connect");},
  }),/PUBLIC_URL_DNS_NOT_PUBLIC/u);
  assert.equal(connections,0,"mixed DNS must fail before connecting");
}
for(const address of ["127.0.0.1","127.255.2.3","::1"]){assert.equal(isLoopbackNetworkAddressV1(address),true,`${address} is loopback`);}
for(const address of ["10.0.0.1","192.168.1.1","::ffff:10.0.0.1"]){assert.equal(isLoopbackNetworkAddressV1(address),false,`${address} is not loopback`);}
for(const url of ["file:///etc/passwd","ftp://example.com/a","http://localhost/","https://printer.local/","https://service.internal/","http://127.0.0.1/","http://192.168.1.5/","https://user:pass@example.com/","https://example.com:8443/article"]){
  assert.equal(canonicalPublicHttpUrlV1(url),null,`${url} must not be capture eligible`);
}
assert.equal(canonicalPublicHttpUrlV1("https://example.com/article#section"),"https://example.com/article");
assert.deepEqual(await assertPublicHttpTargetV1("https://example.com/article",{lookup:async()=>[{address:"93.184.216.34",family:4},{address:"2606:4700:4700::1111",family:6}]}),
  {url:"https://example.com/article",hostname:"example.com",addressCount:2});
await assert.rejects(assertPublicHttpTargetV1("https://example.com/",{lookup:async()=>[{address:"93.184.216.34",family:4},{address:"10.0.0.5",family:4}]}),/PUBLIC_URL_DNS_NOT_PUBLIC/u);
await assert.rejects(assertPublicHttpTargetV1("https://missing.example/",{lookup:async()=>[]}),/PUBLIC_URL_DNS_NOT_PUBLIC/u);
await assert.rejects(assertPublicHttpTargetV1("https://stalled.example/",{timeoutMs:2,lookup:()=>new Promise(()=>{})}),/PUBLIC_URL_DNS_TIMEOUT/u);
await assert.rejects(assertPublicHttpTargetV1("ftp://example.com/"),/PUBLIC_URL_NOT_PUBLIC_HTTP/u);
const pinnedRequests=[];
const fetched=await fetchPublicArticleHtmlV1("https://example.com/old",{
  lookup:async()=>[{address:"93.184.216.34",family:4}],
  requestImpl:async request=>{pinnedRequests.push(request);return request.url.endsWith("/old")
    ? {statusCode:302,headers:{location:"/article", "content-type":"text/html"},body:Buffer.alloc(0)}
    : {statusCode:200,headers:{"content-type":"text/html; charset=utf-8","content-encoding":"identity"},body:Buffer.from("<article>captured source text</article>")};},
});
assert.equal(fetched.finalUrl,"https://example.com/article");assert.equal(fetched.redirectCount,1);assert.match(fetched.html,/captured source text/u);
assert.ok(pinnedRequests.every(request=>request.address.address==="93.184.216.34"),"each hop uses the validated address instead of a second DNS resolution");
await assert.rejects(fetchPublicArticleHtmlV1("https://example.com/",{lookup:async()=>[{address:"10.0.0.4",family:4}],requestImpl:async()=>{throw new Error("must-not-connect");}}),/PUBLIC_URL_DNS_NOT_PUBLIC/u);
await assert.rejects(fetchPublicArticleHtmlV1("https://example.com/old",{lookup:async()=>[{address:"93.184.216.34",family:4}],
  requestImpl:async()=>({statusCode:302,headers:{location:"http://127.0.0.1/private"},body:Buffer.alloc(0)})}),/PUBLIC_PAGE_REDIRECT_TARGET_INVALID/u);
await assert.rejects(fetchPublicArticleHtmlV1("https://example.com/old",{lookup:async()=>[{address:"93.184.216.34",family:4}],
  requestImpl:async()=>({statusCode:302,headers:{location:"https://other.example/article"},body:Buffer.alloc(0)})}),/PUBLIC_PAGE_REDIRECT_HOST_CHANGED/u);
assert.equal((await resolveLoopbackHttpTargetV1("http://127.0.0.1:4311/app")).hostname,"127.0.0.1");
assert.equal((await resolveLoopbackHttpTargetV1("http://localhost:4311/app",{lookup:async()=>[{address:"127.0.0.1",family:4},{address:"::1",family:6}]})).addresses.length,2);
await assert.rejects(resolveLoopbackHttpTargetV1("http://192.168.1.1/"),/LOOPBACK_URL_NOT_ALLOWED/u);
await assert.rejects(resolveLoopbackHttpTargetV1("http://localhost/",{lookup:async()=>[{address:"127.0.0.1",family:4},{address:"192.168.1.3",family:4}]}),/LOOPBACK_URL_DNS_NOT_LOOPBACK/u);

console.log(JSON.stringify({contract:"A1PublicUrlSafetyTest/v1",status:"PASS",checks:["non-public IPv4 and IPv6 ranges","local hostnames and unsupported schemes","all DNS answers must be public","empty/unavailable DNS fails closed","bounded DNS timeout","public redirect revalidation","same-host redirect only","DNS-pinned HTTP connection","explicit loopback-origin classification","loopback DNS cannot escape to a private subnet"]},null,2));
