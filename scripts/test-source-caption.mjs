import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import * as chapter from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';

test('source captions: exact bound publication fields, not numeric facts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-caption-'));
  try {
    const url = 'https://www.rural21.com/english/news/example.html';
    const archive = path.join(root, 'source.html'), file = path.join(root, 'source.txt');
    fs.writeFileSync(file, 'An archived article, not a rendered image.');
    fs.writeFileSync(archive, `<link rel="canonical" href="${url}"><time itemprop="datePublished" datetime="2019-10-14">`);
    const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    const source = {kind:'text', source:'real', generated:false, file, sha256:hash(file), url,
      caption:'Rural21 · 2019-10-14', year:2019,
      citation:{publisher:'Rural21', date:'2019-10-14', archive:{file:archive, sha256:hash(archive)}}};
    assert.equal(typeof chapter.captionSourcesForBeat, 'function', 'a shared real consumer must accept verified text sources');
    const check = (b=source, text=b.caption, key='B18', assets={}) => chapter.numberErrors([text], '', {
      sources:chapter.captionSourcesForBeat({[key]:b}, 'B18', assets, root)});
    assert.deepEqual(check(), [], 'text citation needs no fake image consumption');
    assert.ok(check(source, '21億美元').length, 'body numbers are not citation metadata');
    assert.ok(check(source, source.caption, 'B19').length, 'another beat is not bound');
    assert.ok(check({...source,file:path.join(root,'missing.txt')}).length, 'missing source');
    assert.ok(check({...source,sha256:'0'.repeat(64)}).length, 'changed source bytes');
    assert.ok(check({...source,caption:source.caption+' · 900億美元'}).length, 'fabricated caption amount');
    assert.ok(check({...source,citation:{...source.citation,date:'2019-10-15'}}).length, 'date mismatch');
    assert.ok(check({...source,caption:'Rural21 · 2019-10-15',citation:{...source.citation,date:'2019-10-15'}}).length, 'caption and declared date cannot override archive');
    assert.ok(check({...source,source:'generated',generated:true}).length, 'generated material is not a source');
    assert.ok(check({...source,citation:undefined}).length, 'missing metadata fails closed');
    assert.ok(check(source, source.caption+' · 21億美元').length, 'publisher digits cannot be reused as an amount');
    assert.ok(check({...source,citation:{...source.citation,publisher:'Rural2100'}}).length, 'publisher mismatch');
    assert.ok(check({...source,caption:'Rural21 900 · 2019-10-14',citation:{...source.citation,publisher:'Rural21 900'}}).length, 'publisher field is not arbitrary text');
    assert.ok(check({...source,citation:{...source.citation,archive:{file:archive,sha256:'0'.repeat(64)}}}).length, 'archive hash mismatch');
    assert.ok(check({...source,url:'https://www.rural21.com/other.html'}).length, 'archive identity mismatch');
    assert.ok(chapter.numberErrors([source.caption], '', {sources:[source]}).length, 'unbound raw object cannot mint provenance');
    const food = {...source, url:'https://www.foodnavigator.com/Article/2019/08/09/report/', caption:'FoodNavigator · 2019-08-09',
      citation:{publisher:'FoodNavigator',date:'2019-08-09'}};
    assert.deepEqual(check(food), [], 'date-stamped source URL and hashed binding');
    assert.ok(check({...food,caption:'FoodNavigator · 2019-08-10',citation:{publisher:'FoodNavigator',date:'2019-08-10'}}).length, 'URL date mismatch');
    assert.ok(check({...food,sha256:undefined}).length, 'date URL alone is not a source file');
    const old={caption:'APS · Ploetz · 2005',year:2005,url:'https://www.apsnet.org'};
    assert.deepEqual(chapter.numberErrors([old.caption], '', {sources:[old]}), [], 'legacy year behavior');
    assert.ok(chapter.numberErrors(['2005億美元'], '', {sources:[old]}).length);
    const photo=path.join(root,'page.png'); fs.writeFileSync(photo,'fixture image bytes');
    const image={...old,file:photo};
    assert.deepEqual(chapter.captionSourcesForBeat({B18:image},'B18',{},root), [], 'old image must really be consumed');
    assert.equal(chapter.captionSourcesForBeat({B18:image},'B18',{page:photo},root).length,1);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
