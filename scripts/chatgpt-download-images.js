// Chrome JS: download all generated square images from ChatGPT via sync XHR
// Fetch image -> POST blob to local receiver -> receiver writes to disk
// All synchronous, returns result string immediately for AppleScript
(function(){
  var RECEIVER = 'http://127.0.0.1:18924/save';
  var imgs = document.querySelectorAll('img[alt*="已生成图片"], img[alt*="Generated image"]');
  var seen = {};
  var urls = [];

  for(var i=0; i<imgs.length; i++){
    var img = imgs[i];
    if(img.naturalWidth < 1000 || img.naturalWidth !== img.naturalHeight) continue;
    var src = img.src;
    var idMatch = src.match(/id=([^&]+)/);
    var key = idMatch ? idMatch[1] : src;
    if(seen[key]) continue;
    seen[key] = true;
    urls.push(src);
  }

  if(urls.length === 0) return 'NO_IMAGES';

  var results = [];
  for(var i=0; i<urls.length; i++){
    var name = 'v5-shot-' + String(i).padStart(2,'0') + '.png';
    try {
      // Sync fetch image as binary
      var xhr = new XMLHttpRequest();
      xhr.open('GET', urls[i], false);
      xhr.overrideMimeType('text/plain; charset=x-user-defined');
      xhr.send();
      if(xhr.status !== 200){ results.push('FETCH_FAIL_' + i); continue; }

      // Convert to Uint8Array
      var raw = xhr.responseText;
      var arr = new Uint8Array(raw.length);
      for(var j=0; j<raw.length; j++) arr[j] = raw.charCodeAt(j) & 0xff;

      // POST to local receiver
      var blob = new Blob([arr], {type:'image/png'});
      var post = new XMLHttpRequest();
      post.open('POST', RECEIVER + '?name=' + encodeURIComponent(name), false);
      post.send(blob);

      if(post.status === 200){
        var resp = JSON.parse(post.responseText);
        results.push('OK_' + name + '_' + resp.bytes);
      } else {
        results.push('POST_FAIL_' + name + '_' + post.status);
      }
    } catch(e) {
      results.push('ERR_' + name + '_' + e.message);
    }
  }

  return 'DONE_' + urls.length + '|' + results.join(',');
})()
