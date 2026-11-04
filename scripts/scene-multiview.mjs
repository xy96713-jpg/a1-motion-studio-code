import fs from 'node:fs'; import path from 'node:path';
import { codexImage } from '../work/recipe-board-v1/style-lab/engine/blender/ref.mjs';
const root=process.cwd(); const src=path.join(root,'work/recipe-board-v1/style-lab/banana-3d/gen/clone-shelf.png'); const outdir=path.join(root,'work/recipe-board-v1/projects/banana-design/materials/hero-views'); fs.mkdirSync(outdir,{recursive:true});
const views=[
 ['left-low','Same banana shelf world as the attached reference, exact same yellow shelf, banana bunches, overhead strip lights and right-side black negative space. Camera moved lower and slightly left, closer to the foreground bunches; keep the empty slot on the left shelf. No text, no logos, no people. 16:9 cinematic still.'],
 ['aisle-3q','Same banana shelf world as the attached reference, exact same shelf geometry, banana rows, lighting and black right side. Camera moved to a three-quarter aisle view looking down the shelf, foreground bunch lower-left, black negative upper-right. No text, no logos, no people. 16:9 cinematic still.'],
 ['foreground','Same banana shelf world as the attached reference, exact same yellow shelf and lighting. Camera tighter on the foreground bunch and the empty slot, left shelf, right side falls to black. No text, no logos, no people. 16:9 cinematic still.']
];
for(const [name,prompt] of views){
 const out=path.join(outdir,'shelf-'+name+'-'+Date.now()+'.png');
 try{ codexImage({out,request:prompt,from:src,receipt:{kind:'scene-multiview',source:'clone-shelf.png',view:name}}); console.log('OK',out); }
 catch(e){ console.error('FAIL',name,e.message); }
}
