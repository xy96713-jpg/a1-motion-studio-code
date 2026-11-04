import assert from 'node:assert/strict';
import {requestProviderImageAtAddressV1} from '../apps/studio-next/src/lib/a1-provider-network-v1.mjs';
let drained=0,connections=0;
const body={async dump(options){assert.equal(options.limit,128*1024);drained++;},destroy(){throw Error('Unobserved abort would crash the source process');}};
const options={timeoutMs:1000,maxBytes:1000,requestImpl:async(target,request)=>{
  connections++;assert.equal(target.hostname,'93.184.216.34');assert.equal(request.headers.host,'example.org');
  return {statusCode:403,headers:{'content-type':'text/html'},body};
}};
await assert.rejects(requestProviderImageAtAddressV1('https://example.org/image.jpg',{address:'93.184.216.34',family:4},options),e=>e.message==='PUBLIC_IMAGE_HTTP_OR_CONTENT_TYPE_INVALID'&&e.statusCode===403);
assert.equal(drained,1);assert.equal(connections,1);
const redirect=await requestProviderImageAtAddressV1('https://example.org/image.jpg',{address:'93.184.216.34',family:4},
  {...options,requestImpl:async()=>({statusCode:302,headers:{location:'https://example.org/new.jpg'},body})});
assert.equal(redirect.statusCode,302);assert.equal(redirect.body.length,0);assert.equal(drained,2);
console.log('PASS rejected/redirected image bodies are drained safely; HTTP status retained; no unobserved abort, DNS delegation or network call.');
